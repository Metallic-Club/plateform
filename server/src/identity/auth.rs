//! Who is calling: browser session cookie (with CSRF on unsafe methods) or a native app's bearer access token.

use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, HeaderValue, Method, StatusCode, header, request::Parts},
};
use time::{Duration, OffsetDateTime};

use crate::{
    AppState,
    crypto::{csrf_token, ct_eq, keyed_hash, new_token, token_hash},
    http::client_ip,
    problem::{ApiResult, Problem},
    services::Activity,
};

pub const SESSION_COOKIE: &str = "metallic_session";
pub const CSRF_HEADER: &str = "x-csrf-token";
/// Browser sessions last 30 days (`Max-Age=2592000` in the contract).
pub const SESSION_TTL: Duration = Duration::days(30);

#[derive(Debug, Clone)]
pub enum AuthKind {
    /// Website cookie. Holds the stored hash, never the cookie value.
    Session { session_hash: Vec<u8>, expires_at: OffsetDateTime },
    /// Native app access token.
    Bearer { token_hash: Vec<u8>, family_id: i64, client_id: String, scopes: Vec<String> },
}

/// A signed-in caller.
#[derive(Debug, Clone)]
pub struct Viewer {
    pub user_id: i64,
    pub kind: AuthKind,
}

impl Viewer {
    pub fn is_session(&self) -> bool {
        matches!(self.kind, AuthKind::Session { .. })
    }

    /// Bearer tokens must carry `scope`; browser sessions may do everything their user may do.
    pub fn require_scope(&self, scope: &str) -> ApiResult<()> {
        match &self.kind {
            AuthKind::Bearer { scopes, .. } if !scopes.iter().any(|s| s == scope) => Err(Problem::forbidden(
                "insufficient_scope",
                "This app was not allowed to do that",
            )
            .with_detail(format!("The access token needs the `{scope}` scope."))),
            _ => Ok(()),
        }
    }
}

/// The caller if signed in. A bad bearer token is still a 401 (so apps refresh); a stale cookie reads as signed out.
pub struct MaybeViewer(pub Option<Viewer>);

impl FromRequestParts<AppState> for MaybeViewer {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Problem> {
        if let Some(cached) = parts.extensions.get::<CachedViewer>() {
            return Ok(Self(cached.0.clone()));
        }
        let viewer = authenticate(parts, state).await?;
        parts.extensions.insert(CachedViewer(viewer.clone()));
        Ok(Self(viewer))
    }
}

#[derive(Clone)]
struct CachedViewer(Option<Viewer>);

impl FromRequestParts<AppState> for Viewer {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Problem> {
        MaybeViewer::from_request_parts(parts, state)
            .await?
            .0
            .ok_or_else(Problem::unauthorized)
    }
}

async fn authenticate(parts: &Parts, state: &AppState) -> ApiResult<Option<Viewer>> {
    if let Some(auth) = parts.headers.get(header::AUTHORIZATION) {
        let token = auth
            .to_str()
            .ok()
            .and_then(|v| v.strip_prefix("Bearer ").or_else(|| v.strip_prefix("bearer ")))
            .map(str::trim)
            .filter(|t| !t.is_empty() && t.len() <= 256)
            .ok_or_else(Problem::unauthorized)?;
        let viewer = bearer_viewer(state, token).await?.ok_or_else(Problem::unauthorized)?;
        let activity = match &viewer.kind {
            AuthKind::Bearer { client_id, .. } if client_id == "metallic-studio" => Activity::InStudio,
            _ => Activity::Online,
        };
        state.presence.beat(viewer.user_id, activity).await;
        return Ok(Some(viewer));
    }

    let Some(cookie) = cookie_value(&parts.headers, SESSION_COOKIE) else {
        return Ok(None);
    };
    let Some(viewer) = session_viewer(state, &cookie).await? else {
        return Ok(None);
    };
    if is_unsafe(&parts.method) {
        let AuthKind::Session { session_hash, .. } = &viewer.kind else {
            return Ok(Some(viewer));
        };
        let expected = csrf_token(&state.secrets.hmac_key, session_hash);
        let sent = parts.headers.get(CSRF_HEADER).and_then(|v| v.to_str().ok()).unwrap_or("");
        if !ct_eq(sent.as_bytes(), expected.as_bytes()) {
            return Err(Problem::forbidden("csrf_failed", "Security check failed")
                .with_detail("Send the `X-CSRF-Token` from `GET /v1/auth/session` with every change."));
        }
    }
    state.presence.beat(viewer.user_id, Activity::Online).await;
    Ok(Some(viewer))
}

pub fn is_unsafe(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

async fn session_viewer(state: &AppState, cookie: &str) -> ApiResult<Option<Viewer>> {
    if cookie.is_empty() || cookie.len() > 128 {
        return Ok(None);
    }
    let hash = token_hash(cookie);
    let row: Option<(i64, OffsetDateTime)> = sqlx::query_as(
        "SELECT s.user_id, s.expires_at FROM identity.sessions s \
         JOIN identity.users u ON u.id = s.user_id \
         WHERE s.id_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() \
           AND u.status IN ('active', 'limited', 'suspended')",
    )
    .bind(&hash)
    .fetch_optional(&state.db)
    .await?;
    let Some((user_id, expires_at)) = row else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE identity.sessions SET last_seen_at = now() \
         WHERE id_hash = $1 AND last_seen_at < now() - interval '5 minutes'",
    )
    .bind(&hash)
    .execute(&state.db)
    .await?;
    Ok(Some(Viewer {
        user_id,
        kind: AuthKind::Session { session_hash: hash, expires_at },
    }))
}

async fn bearer_viewer(state: &AppState, token: &str) -> ApiResult<Option<Viewer>> {
    let hash = token_hash(token);
    let row: Option<(i64, i64, String, Vec<String>)> = sqlx::query_as(
        "SELECT t.user_id, t.family_id, t.client_id, t.scopes FROM identity.access_tokens t \
         JOIN identity.users u ON u.id = t.user_id \
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() \
           AND u.status IN ('active', 'limited', 'suspended')",
    )
    .bind(&hash)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|(user_id, family_id, client_id, scopes)| Viewer {
        user_id,
        kind: AuthKind::Bearer { token_hash: hash, family_id, client_id, scopes },
    }))
}

/// Value of one cookie from the `Cookie` header(s).
pub fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.trim().to_owned())
}

/// A new browser session for `user_id`. Returns the cookie value (only ever sent to the client) and its stored hash.
pub async fn create_session(
    state: &AppState,
    parts_headers: &HeaderMap,
    ip: std::net::IpAddr,
    user_id: i64,
) -> ApiResult<NewSession> {
    let token = new_token("");
    let hash = token_hash(&token);
    let expires_at = OffsetDateTime::now_utc() + SESSION_TTL;
    let user_agent: Option<String> = parts_headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(|ua| ua.chars().take(256).collect());
    sqlx::query(
        "INSERT INTO identity.sessions (id_hash, user_id, expires_at, ip_hmac, user_agent) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&hash)
    .bind(user_id)
    .bind(expires_at)
    .bind(keyed_hash(&state.secrets.hmac_key, "ip", ip.to_string().as_bytes()))
    .bind(user_agent)
    .execute(&state.db)
    .await?;
    Ok(NewSession {
        csrf_token: csrf_token(&state.secrets.hmac_key, &hash),
        token,
        expires_at,
    })
}

pub struct NewSession {
    pub token: String,
    pub csrf_token: String,
    pub expires_at: OffsetDateTime,
}

/// `Set-Cookie` for a new session.
pub fn session_cookie(state: &AppState, token: &str) -> HeaderValue {
    let secure = if state.config.cookie_secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age={}",
        SESSION_TTL.whole_seconds()
    ))
    .expect("session tokens are base64url")
}

/// `Set-Cookie` that removes the session cookie.
pub fn clear_session_cookie(state: &AppState) -> HeaderValue {
    let secure = if state.config.cookie_secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!("{SESSION_COOKIE}=; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age=0"))
        .expect("static cookie")
}

/// Rejects unsafe cross-site requests whose `Origin` is not allowed (defence in depth beside SameSite and CSRF tokens).
/// Native apps send no `Origin` and pass.
pub fn origin_allowed(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    let origin = origin.trim_end_matches('/');
    if state.config.cors_origins.iter().any(|o| o == origin) || origin == state.config.public_web_url {
        return true;
    }
    // Same origin as the API itself.
    headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .is_some_and(|host| origin == format!("https://{host}") || origin == format!("http://{host}"))
}

/// Rate-limit helper: counts a hit and turns a refusal into a 429 problem.
pub async fn limit(state: &AppState, limit: crate::services::Limit, key: &str) -> ApiResult<()> {
    let d = state.limiter.hit(limit, key).await;
    if d.allowed { Ok(()) } else { Err(Problem::rate_limited(d.reset_secs)) }
}

/// Keyed hash of the client IP for rate-limit keys (never the raw address).
pub fn ip_key(state: &AppState, parts: &Parts) -> String {
    let ip = client_ip(parts, state).0;
    ip_key_for(state, ip)
}

pub fn ip_key_for(state: &AppState, ip: std::net::IpAddr) -> String {
    short_key(&keyed_hash(&state.secrets.hmac_key, "ip", ip.to_string().as_bytes()))
}

/// Compact rate-limit key from a keyed hash.
pub fn short_key(hash: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&hash[..hash.len().min(12)])
}

/// 401 for bearer callers on browser-only endpoints.
pub fn require_session(viewer: &Viewer) -> ApiResult<()> {
    if viewer.is_session() {
        Ok(())
    } else {
        Err(Problem::new(StatusCode::UNAUTHORIZED, "session_required", "Sign in on the website")
            .with_detail("This endpoint needs the website session, not an app token."))
    }
}
