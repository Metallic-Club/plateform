//! Test harness: a fresh database per test (copied from a migrated template), the full app with middleware, and a
//! client that calls operations by `operationId` and checks every response against `api/openapi.yaml`.
//!
//! Database: `METALLIC_TEST_DATABASE_URL` (a server URL whose user may create databases), or the local cluster from
//! `scripts/dev-postgres.ps1` (password read from `%LOCALAPPDATA%/Metallic/pg/dev-password`).

use std::{
    collections::{BTreeSet, HashMap},
    net::SocketAddr,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicU32, Ordering},
    },
};

use axum::{
    Router,
    body::Body,
    extract::ConnectInfo,
    http::{HeaderMap, Method, Request, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use http_body_util::BodyExt;
use metallic_platform::{
    AppState, app,
    config::Config,
    contract::OPERATIONS,
    services::{AcceptingCaptcha, MemoryMailer},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Connection, Executor, PgConnection, PgPool, postgres::PgPoolOptions};
use tower::ServiceExt;

pub const SERVER_SECRET: &str = "test-server-secret-0123456789abcdefghijklmnop";
pub const PASSWORD: &str = "correct horse battery staple";
pub const WEB: &str = "http://localhost:3000";

// ------------------------------------------------------------------ database

fn base_url() -> String {
    if let Ok(url) = std::env::var("METALLIC_TEST_DATABASE_URL") {
        return url;
    }
    let dir = std::env::var("LOCALAPPDATA")
        .expect("LOCALAPPDATA or METALLIC_TEST_DATABASE_URL must be set");
    let pw = std::fs::read_to_string(format!("{dir}/Metallic/pg/dev-password")).expect(
        "no test database: run `scripts/dev-postgres.ps1 setup` or set METALLIC_TEST_DATABASE_URL",
    );
    format!("postgres://metallic:{}@127.0.0.1:54329/postgres", pw.trim())
}

fn with_db(url: &str, db: &str) -> String {
    let (head, tail) = url
        .split_once('?')
        .map_or((url, None), |(h, t)| (h, Some(t)));
    let base = head.rsplit_once('/').map_or(head, |(b, _)| b);
    match tail {
        Some(t) => format!("{base}/{db}?{t}"),
        None => format!("{base}/{db}"),
    }
}

/// Template name from a hash of the migration files, so a schema change builds a new template.
fn template_name() -> String {
    let mut files: Vec<_> = std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/migrations"))
        .expect("migrations dir")
        .map(|e| e.expect("entry").path())
        .collect();
    files.sort();
    let mut h = Sha256::new();
    for f in files {
        h.update(
            std::fs::read(f)
                .expect("migration")
                .iter()
                .filter(|b| **b != b'\r')
                .copied()
                .collect::<Vec<_>>(),
        );
    }
    let hex: String = h.finalize()[..6]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    format!("metallic_tpl_{hex}")
}

static COUNTER: AtomicU32 = AtomicU32::new(0);
static SWEPT: OnceLock<()> = OnceLock::new();

async fn admin() -> PgConnection {
    PgConnection::connect(&base_url())
        .await
        .expect("connect to the test Postgres")
}

/// Creates a fresh database for one test.
async fn create_database() -> (String, String) {
    let url = base_url();
    let mut conn = admin().await;
    // One process at a time builds templates and copies them.
    conn.execute("SELECT pg_advisory_lock(726354)")
        .await
        .expect("lock");
    if SWEPT.set(()).is_ok() {
        sweep(&mut conn).await;
    }
    let tpl = template_name();
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)")
            .bind(&tpl)
            .fetch_one(&mut conn)
            .await
            .expect("query");
    if !exists {
        conn.execute(sqlx::AssertSqlSafe(format!(
            "CREATE DATABASE \"{tpl}_build\""
        )))
        .await
        .ok();
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&with_db(&url, &format!("{tpl}_build")))
            .await
            .expect("template db");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("migrations apply");
        pool.close().await;
        conn.execute(sqlx::AssertSqlSafe(format!(
            "ALTER DATABASE \"{tpl}_build\" RENAME TO \"{tpl}\""
        )))
        .await
        .expect("rename template");
    }
    let name = format!(
        "metallic_t_{}_{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::SeqCst)
    );
    conn.execute(sqlx::AssertSqlSafe(format!(
        "CREATE DATABASE \"{name}\" TEMPLATE \"{tpl}\""
    )))
    .await
    .expect("copy template");
    conn.execute("SELECT pg_advisory_unlock(726354)")
        .await
        .expect("unlock");
    (with_db(&url, &name), name)
}

/// Drops test databases left by earlier runs (a failed test keeps its database for inspection until the next run)
/// and templates of older migration sets.
async fn sweep(conn: &mut PgConnection) {
    let tpl = template_name();
    let names: Vec<String> = sqlx::query_scalar(
        "SELECT datname FROM pg_database WHERE datname LIKE 'metallic\\_t\\_%' OR (datname LIKE 'metallic\\_tpl\\_%' AND datname <> $1)",
    )
    .bind(&tpl)
    .fetch_all(&mut *conn)
    .await
    .expect("list databases");
    for n in names {
        conn.execute(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS \"{n}\" WITH (FORCE)"
        )))
        .await
        .ok();
    }
}

// ------------------------------------------------------------------ app

pub struct TestApp {
    pub state: AppState,
    pub db: PgPool,
    pub mailer: Arc<MemoryMailer>,
    router: Router,
    db_name: String,
    ip_seq: AtomicU32,
}

pub fn test_config() -> Config {
    let hmac = STANDARD.encode([7u8; 32]);
    let data = STANDARD.encode([9u8; 32]);
    let vars: HashMap<&str, String> = HashMap::from([
        ("METALLIC_ENV", "dev".to_owned()),
        ("METALLIC_HMAC_KEY", hmac),
        ("METALLIC_DATA_KEY", data),
        ("METALLIC_SERVER_SECRET", SERVER_SECRET.to_owned()),
        ("METALLIC_PUBLIC_WEB_URL", WEB.to_owned()),
        ("METALLIC_CLIENT_IP_HEADER", "x-test-ip".to_owned()),
        ("METALLIC_RUN_JOBS", "false".to_owned()),
        ("METALLIC_MIGRATE_ON_START", "false".to_owned()),
        ("METALLIC_COOKIE_SECURE", "true".to_owned()),
    ]);
    Config::from_lookup(|k| vars.get(k).cloned()).expect("test config")
}

impl TestApp {
    pub async fn new() -> Self {
        let (url, db_name) = create_database().await;
        let db = PgPoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .expect("test db");
        let config = test_config();
        let secrets = config.require_secrets().expect("secrets").clone();
        let mailer = Arc::new(MemoryMailer::default());
        let state = AppState::new(
            db.clone(),
            config,
            secrets,
            mailer.clone(),
            Arc::new(AcceptingCaptcha),
        );
        let router = app(state.clone());
        Self {
            state,
            db,
            mailer,
            router,
            db_name,
            ip_seq: AtomicU32::new(1),
        }
    }

    /// Drops this test's database. Call at the end of a passing test.
    pub async fn finish(self) {
        let Self {
            db,
            db_name,
            router,
            state,
            ..
        } = self;
        drop(router);
        drop(state);
        db.close().await;
        let mut conn = admin().await;
        conn.execute(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS \"{db_name}\" WITH (FORCE)"
        )))
        .await
        .ok();
    }

    /// A new client address, so per-address limits do not mix between test users.
    pub fn next_ip(&self) -> String {
        let n = self.ip_seq.fetch_add(1, Ordering::SeqCst);
        format!("10.{}.{}.{}", (n >> 16) & 255, (n >> 8) & 255, n & 255)
    }

    /// A signed-out browser client.
    pub fn anon(&self) -> Client<'_> {
        Client {
            app: self,
            auth: Auth::None,
            ip: self.next_ip(),
            user: None,
        }
    }

    /// Signs up and verifies a user; returns a browser client signed in as them.
    pub async fn user(&self, username: &str, birth_date: &str) -> Client<'_> {
        let c = self.signup(username, birth_date).await;
        let token = self.last_email_token(&format!("{}@example.com", username.to_lowercase()));
        let r = c.op("verifyEmail", &[], json!({ "token": token })).await;
        assert_eq!(r.status, StatusCode::NO_CONTENT, "verify: {}", r.body);
        c
    }

    /// Signs up without verifying.
    pub async fn signup(&self, username: &str, birth_date: &str) -> Client<'_> {
        let mut c = self.anon();
        let mut body = json!({
            "username": username,
            "password": PASSWORD,
            "email": format!("{}@example.com", username.to_lowercase()),
            "birthDate": birth_date,
            "acceptTerms": true,
        });
        if birth_date > "2013-10-30" {
            body["parentEmail"] = json!(format!("parent.{}@example.com", username.to_lowercase()));
        }
        let r = c.op("signUp", &[], body).await;
        assert_eq!(
            r.status,
            StatusCode::CREATED,
            "sign up {username}: {}",
            r.body
        );
        c.adopt_session(&r);
        c
    }

    /// Token from the newest email sent to `to`.
    pub fn last_email_token(&self, to: &str) -> String {
        let sent = self.mailer.sent.lock().expect("mailer");
        let email = sent
            .iter()
            .rev()
            .find(|e| e.to == to)
            .unwrap_or_else(|| panic!("no email to {to}"));
        email
            .link
            .rsplit_once("token=")
            .expect("token in link")
            .1
            .to_owned()
    }

    /// Test-only SQL (backdating, inspecting).
    pub async fn sql(&self, q: &str, id: i64) {
        sqlx::query(sqlx::AssertSqlSafe(q.to_owned()))
            .bind(id)
            .execute(&self.db)
            .await
            .expect("test sql");
    }

    async fn send(&self, req: Request<Body>) -> Resp {
        let mut req = req;
        req.extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40000))));
        let res = self
            .router
            .clone()
            .oneshot(req)
            .await
            .expect("router never fails");
        let status = res.status();
        let headers = res.headers().clone();
        let bytes = res.into_body().collect().await.expect("body").to_bytes();
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes)
                .unwrap_or(Value::String(String::from_utf8_lossy(&bytes).into()))
        };
        Resp {
            status,
            headers,
            body,
        }
    }
}

// ------------------------------------------------------------------ client

#[derive(Clone)]
pub enum Auth {
    None,
    Cookie { session: String, csrf: String },
    Bearer(String),
    Server,
}

pub struct Client<'a> {
    pub app: &'a TestApp,
    pub auth: Auth,
    pub ip: String,
    pub user: Option<i64>,
}

#[derive(Debug)]
pub struct Resp {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Value,
}

impl Resp {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|v| v.to_str().ok())
    }
    pub fn id(&self) -> i64 {
        self.body["id"]
            .as_str()
            .expect("id")
            .parse()
            .expect("numeric id")
    }
}

impl Client<'_> {
    pub fn user_id(&self) -> i64 {
        self.user.expect("signed in")
    }

    pub fn id_str(&self) -> String {
        self.user_id().to_string()
    }

    /// The same user through a bearer token (as a native app).
    pub fn with_bearer(&self, token: &str) -> Client<'_> {
        Client {
            app: self.app,
            auth: Auth::Bearer(token.to_owned()),
            ip: self.ip.clone(),
            user: self.user,
        }
    }

    /// Reads the session cookie and CSRF token from a sign-up or log-in response.
    pub fn adopt_session(&mut self, r: &Resp) {
        let cookie = r.header("set-cookie").expect("session cookie");
        let session = cookie
            .split(';')
            .next()
            .expect("cookie")
            .trim_start_matches("metallic_session=")
            .to_owned();
        let csrf = r.body["csrfToken"].as_str().expect("csrfToken").to_owned();
        self.user = Some(
            r.body["user"]["id"]
                .as_str()
                .expect("user id")
                .parse()
                .expect("id"),
        );
        self.auth = Auth::Cookie { session, csrf };
    }

    pub fn server(app: &TestApp) -> Client<'_> {
        Client {
            app,
            auth: Auth::Server,
            ip: "10.250.0.1".into(),
            user: None,
        }
    }

    /// Calls an operation with path parameters in order, query parameters as `?k=v` suffixes in `params` (keys
    /// starting with `?`), and a JSON body (`Value::Null` for none).
    pub async fn op(&self, operation_id: &str, params: &[(&str, &str)], body: Value) -> Resp {
        let op = OPERATIONS
            .iter()
            .find(|o| o.operation_id == operation_id)
            .unwrap_or_else(|| panic!("no operation {operation_id}"));
        let mut path = op.path.to_owned();
        let mut query = Vec::new();
        for (k, v) in params {
            if let Some(q) = k.strip_prefix('?') {
                query.push(format!("{q}={}", urlencode(v)));
            } else {
                assert!(
                    path.contains(&format!("{{{k}}}")),
                    "{operation_id} has no path parameter {k}"
                );
                path = path.replace(&format!("{{{k}}}"), v);
            }
        }
        if !query.is_empty() {
            path = format!("{path}?{}", query.join("&"));
        }
        let form = matches!(
            operation_id,
            "startDeviceAuthorization" | "exchangeToken" | "revokeToken"
        );
        let r = self.raw(op.method, &path, body, form).await;
        crate::contract::check(operation_id, &r);
        r
    }

    /// Sends a request without contract checks.
    pub async fn raw(&self, method: &str, path: &str, body: Value, form: bool) -> Resp {
        self.send_with(method, path, body, form, WEB).await
    }

    /// Like [`Self::raw`] with a chosen `Origin` on unsafe cookie requests.
    pub async fn raw_with_origin(
        &self,
        method: &str,
        path: &str,
        body: Value,
        origin: &str,
    ) -> Resp {
        self.send_with(method, path, body, false, origin).await
    }

    async fn send_with(
        &self,
        method: &str,
        path: &str,
        body: Value,
        form: bool,
        origin: &str,
    ) -> Resp {
        let method = Method::from_bytes(method.as_bytes()).expect("method");
        let mut b = Request::builder()
            .method(method.clone())
            .uri(path)
            .header("x-test-ip", &self.ip);
        match &self.auth {
            Auth::None => {}
            Auth::Cookie { session, csrf } => {
                b = b.header(header::COOKIE, format!("metallic_session={session}"));
                if method != Method::GET {
                    b = b
                        .header("x-csrf-token", csrf)
                        .header(header::ORIGIN, origin);
                }
            }
            Auth::Bearer(t) => b = b.header(header::AUTHORIZATION, format!("Bearer {t}")),
            Auth::Server => b = b.header("x-metallic-server-secret", SERVER_SECRET),
        }
        let body = if body.is_null() {
            Body::empty()
        } else if form {
            b = b.header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
            let pairs: Vec<(String, String)> = body
                .as_object()
                .expect("form object")
                .iter()
                .map(|(k, v)| {
                    (
                        k.clone(),
                        v.as_str().map_or_else(|| v.to_string(), str::to_owned),
                    )
                })
                .collect();
            Body::from(serde_urlencoded::to_string(pairs).expect("form"))
        } else {
            b = b.header(header::CONTENT_TYPE, "application/json");
            Body::from(body.to_string())
        };
        self.app.send(b.body(body).expect("request")).await
    }
}

pub fn urlencode(v: &str) -> String {
    serde_urlencoded::to_string([("x", v)]).expect("encode")[2..].to_owned()
}

/// Operation ids each test exercised; the contract test checks the union covers every implemented operation.
pub fn covered() -> &'static Mutex<BTreeSet<String>> {
    static COVERED: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();
    COVERED.get_or_init(|| Mutex::new(BTreeSet::new()))
}
