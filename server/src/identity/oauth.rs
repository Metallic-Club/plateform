//! OAuth 2.0 for the Launcher, Player and Studio: device authorization (RFC 8628), token endpoint with rotating
//! refresh tokens and reuse detection, and revocation (RFC 7009). Native apps never see a password.

use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, PgExecutor};
use time::{Duration, OffsetDateTime};

use super::auth::{Viewer, ip_key_for, limit, require_session};
use crate::{
    AppState,
    crypto::{new_token, random_bytes, token_hash},
    http::{ApiJson, ClientIp},
    problem::{ApiResult, Problem},
    services::Limit,
};

/// `identity.device_authorizations` row: client_id, status, scopes, user_id, interval_secs,
/// expires_at, last_polled_at.
type DeviceAuthRow = (
    String,
    String,
    Vec<String>,
    Option<i64>,
    i32,
    OffsetDateTime,
    Option<OffsetDateTime>,
);

/// `identity.refresh_tokens` row: family_id, user_id, client_id, scopes, expires_at, used_at, revoked_at.
type RefreshRow = (
    i64,
    i64,
    String,
    Vec<String>,
    OffsetDateTime,
    Option<OffsetDateTime>,
    Option<OffsetDateTime>,
);

pub const ACCESS_TTL: Duration = Duration::minutes(15);
pub const REFRESH_TTL: Duration = Duration::days(30);
pub const DEVICE_CODE_TTL: Duration = Duration::minutes(10);
pub const POLL_INTERVAL_SECS: i32 = 5;
const USER_CODE_ALPHABET: &[u8; 20] = b"BCDFGHJKLMNPQRSTVWXZ";
const DEVICE_START_LIMIT: Limit = Limit::per_minute("device_start", 10);
const TOKEN_LIMIT: Limit = Limit::per_minute("oauth_token", 60);
const APPROVE_LIMIT: Limit = Limit::per_minute("device_approve", 10);

/// The first-party apps and what they may ask for.
pub fn client(client_id: &str) -> Option<(&'static str, &'static [&'static str])> {
    match client_id {
        "metallic-launcher" => Some(("Metallic Launcher", &["profile", "play"])),
        "metallic-player" => Some(("Metallic Player", &["profile", "play"])),
        "metallic-studio" => Some(("Metallic Studio", &["profile", "play", "publish"])),
        _ => None,
    }
}

/// RFC 6749 section 5.2 error body.
#[derive(Debug)]
pub struct OAuthError {
    pub error: &'static str,
    pub description: Option<String>,
}

impl OAuthError {
    fn new(error: &'static str) -> Self {
        Self {
            error,
            description: None,
        }
    }
    fn with(error: &'static str, description: &str) -> Self {
        Self {
            error,
            description: Some(description.to_owned()),
        }
    }
}

#[derive(Serialize)]
struct OAuthErrorBody<'a> {
    error: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_description: Option<&'a str>,
}

impl IntoResponse for OAuthError {
    fn into_response(self) -> Response {
        let body = OAuthErrorBody {
            error: self.error,
            error_description: self.description.as_deref(),
        };
        let mut r = (StatusCode::BAD_REQUEST, Json(body)).into_response();
        r.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        r
    }
}

/// Either an OAuth error (400) or a general problem (429, 500).
pub enum TokenError {
    OAuth(OAuthError),
    Problem(Problem),
}

impl From<Problem> for TokenError {
    fn from(p: Problem) -> Self {
        Self::Problem(p)
    }
}
impl From<sqlx::Error> for TokenError {
    fn from(e: sqlx::Error) -> Self {
        Self::Problem(e.into())
    }
}
impl From<OAuthError> for TokenError {
    fn from(e: OAuthError) -> Self {
        Self::OAuth(e)
    }
}
impl IntoResponse for TokenError {
    fn into_response(self) -> Response {
        match self {
            Self::OAuth(e) => e.into_response(),
            Self::Problem(p) => p.into_response(),
        }
    }
}

fn form(body: &Bytes) -> Result<std::collections::HashMap<String, String>, OAuthError> {
    serde_urlencoded::from_bytes(body)
        .map_err(|_| OAuthError::with("invalid_request", "Send application/x-www-form-urlencoded."))
}

fn parse_scopes(client_id: &str, requested: Option<&str>) -> Result<Vec<String>, OAuthError> {
    let (_, allowed) = client(client_id).ok_or_else(|| OAuthError::new("invalid_client"))?;
    let requested = requested
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("profile play");
    let mut scopes: Vec<String> = vec!["profile".to_owned()];
    for s in requested.split(' ').filter(|s| !s.is_empty()) {
        if !allowed.contains(&s) {
            return Err(OAuthError::with(
                "invalid_scope",
                "This app cannot ask for that scope.",
            ));
        }
        if !scopes.iter().any(|x| x == s) {
            scopes.push(s.to_owned());
        }
    }
    Ok(scopes)
}

fn new_user_code() -> String {
    // Rejection sampling: only bytes below 240 (a multiple of 20) so every letter is equally likely.
    let mut code = String::with_capacity(8);
    while code.len() < 8 {
        for b in random_bytes::<16>() {
            if b < 240 && code.len() < 8 {
                code.push(USER_CODE_ALPHABET[usize::from(b) % 20] as char);
            }
        }
    }
    code
}

/// Normalises what a person typed: upper-case, no separators. None if it cannot be a user code.
pub fn normalize_user_code(input: &str) -> Option<String> {
    let code: String = input
        .chars()
        .filter(|c| !matches!(c, '-' | ' '))
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (code.len() == 8 && code.bytes().all(|b| USER_CODE_ALPHABET.contains(&b))).then_some(code)
}

#[derive(Serialize)]
pub struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: String,
    expires_in: i64,
    interval: i32,
}

/// `startDeviceAuthorization`
pub async fn start_device(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    body: Bytes,
) -> Result<Response, TokenError> {
    limit(&state, DEVICE_START_LIMIT, &ip_key_for(&state, ip)).await?;
    let f = form(&body)?;
    let client_id = f.get("client_id").map(String::as_str).unwrap_or("");
    if client(client_id).is_none() {
        return Err(OAuthError::new("invalid_client").into());
    }
    let scopes = parse_scopes(client_id, f.get("scope").map(String::as_str))?;
    let device_code = new_token("");
    let mut user_code = new_user_code();
    for attempt in 0.. {
        let inserted = sqlx::query(
            "INSERT INTO identity.device_authorizations (device_code_hash, user_code, client_id, scopes, interval_secs, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_code) DO NOTHING",
        )
        .bind(token_hash(&device_code))
        .bind(&user_code)
        .bind(client_id)
        .bind(&scopes)
        .bind(POLL_INTERVAL_SECS)
        .bind(OffsetDateTime::now_utc() + DEVICE_CODE_TTL)
        .execute(&state.db)
        .await?;
        if inserted.rows_affected() == 1 {
            break;
        }
        if attempt >= 5 {
            return Err(Problem::internal().into());
        }
        user_code = new_user_code();
    }
    let display = format!("{}-{}", &user_code[..4], &user_code[4..]);
    let base = format!("{}/activate", state.config.public_web_url);
    let body = DeviceCodeResponse {
        device_code,
        verification_uri_complete: format!("{base}?code={display}"),
        verification_uri: base,
        user_code: display,
        expires_in: DEVICE_CODE_TTL.whole_seconds(),
        interval: POLL_INTERVAL_SECS,
    };
    Ok(no_store(Json(body).into_response()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveRequest {
    user_code: Option<String>,
    approve: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveResult {
    client_id: String,
    client_name: &'static str,
    scopes: Vec<String>,
    approved: bool,
}

/// `approveDeviceAuthorization` (website session only; an app token cannot approve another app).
pub async fn approve_device(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(body): ApiJson<ApproveRequest>,
) -> ApiResult<Json<ApproveResult>> {
    require_session(&viewer)?;
    limit(&state, APPROVE_LIMIT, &viewer.user_id.to_string()).await?;
    let Some(approve) = body.approve else {
        return Err(Problem::invalid(
            "approve",
            "required",
            "Say whether to approve.",
        ));
    };
    let code = body
        .user_code
        .as_deref()
        .and_then(normalize_user_code)
        .ok_or_else(Problem::not_found)?;
    let status = if approve { "approved" } else { "denied" };
    let row: Option<(String, Vec<String>)> = sqlx::query_as(
        "UPDATE identity.device_authorizations SET status = $2, user_id = $3 \
         WHERE user_code = $1 AND status = 'pending' AND expires_at > now() RETURNING client_id, scopes",
    )
    .bind(&code)
    .bind(status)
    .bind(viewer.user_id)
    .fetch_optional(&state.db)
    .await?;
    let (client_id, scopes) = row.ok_or_else(Problem::not_found)?;
    let client_name = client(&client_id).map(|c| c.0).unwrap_or("Unknown app");
    tracing::info!(
        user_id = viewer.user_id,
        client_id = client_id.as_str(),
        approved = approve,
        "device sign-in decided"
    );
    Ok(Json(ApproveResult {
        client_id,
        client_name,
        scopes,
        approved: approve,
    }))
}

#[derive(Serialize)]
pub struct TokenResponse {
    access_token: String,
    token_type: &'static str,
    expires_in: i64,
    refresh_token: String,
    scope: String,
}

/// `exchangeToken`
pub async fn token(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    body: Bytes,
) -> Result<Response, TokenError> {
    limit(&state, TOKEN_LIMIT, &ip_key_for(&state, ip)).await?;
    let f = form(&body)?;
    let client_id = f.get("client_id").map(String::as_str).unwrap_or("");
    if client(client_id).is_none() {
        return Err(OAuthError::new("invalid_client").into());
    }
    match f.get("grant_type").map(String::as_str) {
        Some("urn:ietf:params:oauth:grant-type:device_code") => {
            let code = f.get("device_code").filter(|c| !c.is_empty() && c.len() <= 256).ok_or_else(|| OAuthError::new("invalid_request"))?;
            device_grant(&state, client_id, code).await
        }
        Some("refresh_token") => {
            let rt = f.get("refresh_token").filter(|c| !c.is_empty() && c.len() <= 256).ok_or_else(|| OAuthError::new("invalid_request"))?;
            refresh_grant(&state, client_id, rt).await
        }
        Some("authorization_code") => Err(OAuthError::with(
            "unsupported_grant_type",
            "The PKCE flow needs the authorize endpoint, which is not built yet. Use the device flow.",
        )
        .into()),
        Some(_) => Err(OAuthError::new("unsupported_grant_type").into()),
        None => Err(OAuthError::with("invalid_request", "grant_type is required.").into()),
    }
}

async fn device_grant(
    state: &AppState,
    client_id: &str,
    device_code: &str,
) -> Result<Response, TokenError> {
    let hash = token_hash(device_code);
    let mut tx = state.db.begin().await?;
    let row: Option<DeviceAuthRow> = sqlx::query_as(
        "SELECT client_id, status, scopes, user_id, interval_secs, expires_at, last_polled_at \
         FROM identity.device_authorizations WHERE device_code_hash = $1 FOR UPDATE",
    )
    .bind(&hash)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((owner_client, status, scopes, user_id, interval, expires_at, last_polled)) = row
    else {
        return Err(OAuthError::new("invalid_grant").into());
    };
    if owner_client != client_id {
        return Err(OAuthError::new("invalid_grant").into());
    }
    let now = OffsetDateTime::now_utc();
    if expires_at <= now {
        return Err(OAuthError::new("expired_token").into());
    }
    // RFC 8628 3.5: polling faster than the interval earns slow_down and a longer interval.
    if status == "pending"
        && let Some(last) = last_polled
        && now - last < Duration::seconds(i64::from(interval))
    {
        sqlx::query("UPDATE identity.device_authorizations SET interval_secs = interval_secs + 5, last_polled_at = now() WHERE device_code_hash = $1")
            .bind(&hash)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Err(OAuthError::new("slow_down").into());
    }
    sqlx::query("UPDATE identity.device_authorizations SET last_polled_at = now() WHERE device_code_hash = $1")
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    let result = match (status.as_str(), user_id) {
        ("pending", _) => Err(OAuthError::new("authorization_pending")),
        ("denied", _) => {
            sqlx::query("UPDATE identity.device_authorizations SET status = 'consumed' WHERE device_code_hash = $1")
                .bind(&hash)
                .execute(&mut *tx)
                .await?;
            Err(OAuthError::new("access_denied"))
        }
        ("approved", Some(user_id)) => {
            sqlx::query("UPDATE identity.device_authorizations SET status = 'consumed' WHERE device_code_hash = $1")
                .bind(&hash)
                .execute(&mut *tx)
                .await?;
            if !user_can_get_tokens(&mut *tx, user_id).await? {
                Err(OAuthError::new("access_denied"))
            } else {
                let family_id = state.ids.next();
                let pair =
                    issue_pair(&mut tx, user_id, family_id, client_id, &scopes, None).await?;
                tracing::info!(user_id, client_id, "device sign-in completed");
                Ok(pair)
            }
        }
        _ => Err(OAuthError::new("invalid_grant")),
    };
    tx.commit().await?;
    Ok(no_store(Json(result?).into_response()))
}

async fn refresh_grant(
    state: &AppState,
    client_id: &str,
    refresh_token: &str,
) -> Result<Response, TokenError> {
    let hash = token_hash(refresh_token);
    let mut tx = state.db.begin().await?;
    // Family IDs are immutable. Read without a token-row lock so every path acquires family -> token locks.
    let family_id: Option<i64> = sqlx::query_scalar(
        "SELECT family_id FROM identity.refresh_tokens WHERE token_hash = $1 AND client_id = $2",
    )
    .bind(&hash)
    .bind(client_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(family_id) = family_id else {
        return Err(OAuthError::new("invalid_grant").into());
    };
    lock_family(&mut tx, family_id).await?;
    let row: Option<RefreshRow> = sqlx::query_as(
        "SELECT family_id, user_id, client_id, scopes, expires_at, used_at, revoked_at \
             FROM identity.refresh_tokens WHERE token_hash = $1 FOR UPDATE",
    )
    .bind(&hash)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((row_family_id, user_id, owner_client, scopes, expires_at, used_at, revoked_at)) = row
    else {
        return Err(OAuthError::new("invalid_grant").into());
    };
    if row_family_id != family_id
        || owner_client != client_id
        || revoked_at.is_some()
        || expires_at <= OffsetDateTime::now_utc()
    {
        return Err(OAuthError::new("invalid_grant").into());
    }
    if used_at.is_some() {
        // Reuse of a rotated token: someone else may hold the chain. Revoke all of it.
        revoke_family_rows(&mut tx, family_id).await?;
        tx.commit().await?;
        tracing::warn!(
            user_id,
            client_id,
            "refresh token reuse detected; token family revoked"
        );
        return Err(OAuthError::new("invalid_grant").into());
    }
    if !user_can_get_tokens(&mut *tx, user_id).await? {
        revoke_family_rows(&mut tx, family_id).await?;
        tx.commit().await?;
        return Err(OAuthError::new("invalid_grant").into());
    }
    sqlx::query("UPDATE identity.refresh_tokens SET used_at = now() WHERE token_hash = $1")
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    let pair = issue_pair(&mut tx, user_id, family_id, client_id, &scopes, Some(hash)).await?;
    tx.commit().await?;
    Ok(no_store(Json(pair).into_response()))
}

async fn user_can_get_tokens(db: impl PgExecutor<'_>, user_id: i64) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM identity.users WHERE id = $1 AND status IN ('active', 'limited', 'suspended'))")
        .bind(user_id)
        .fetch_one(db)
        .await
}

async fn issue_pair(
    conn: &mut sqlx::PgConnection,
    user_id: i64,
    family_id: i64,
    client_id: &str,
    scopes: &[String],
    parent: Option<Vec<u8>>,
) -> Result<TokenResponse, sqlx::Error> {
    // Device grants create an unpublished family; refresh grants already hold this same transaction lock.
    lock_family(conn, family_id).await?;
    let access = new_token("mat_");
    let refresh = new_token("mrt_");
    let now = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO identity.access_tokens (token_hash, family_id, user_id, client_id, scopes, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(token_hash(&access))
    .bind(family_id)
    .bind(user_id)
    .bind(client_id)
    .bind(scopes)
    .bind(now + ACCESS_TTL)
    .execute(&mut *conn)
    .await?;
    sqlx::query(
        "INSERT INTO identity.refresh_tokens (token_hash, family_id, user_id, client_id, scopes, parent_hash, expires_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(token_hash(&refresh))
    .bind(family_id)
    .bind(user_id)
    .bind(client_id)
    .bind(scopes)
    .bind(parent)
    .bind(now + REFRESH_TTL)
    .execute(&mut *conn)
    .await?;
    Ok(TokenResponse {
        access_token: access,
        token_type: "Bearer",
        expires_in: ACCESS_TTL.whole_seconds(),
        refresh_token: refresh,
        scope: scopes.join(" "),
    })
}

/// Lossless split into PostgreSQL's two-int advisory key space, separate from bigint-key advisory locks.
fn family_lock_key(family_id: i64) -> (i32, i32) {
    ((family_id >> 32) as i32, family_id as i32)
}

/// Caller must have an open transaction. Acquire before any refresh-token row lock and validate after waiting.
async fn lock_family(conn: &mut sqlx::PgConnection, family_id: i64) -> Result<(), sqlx::Error> {
    let (high, low) = family_lock_key(family_id);
    sqlx::query("SELECT pg_advisory_xact_lock($1::int, $2::int)")
        .bind(high)
        .bind(low)
        .execute(conn)
        .await?;
    Ok(())
}

/// Atomically revokes every access and refresh token of one sign-in, serialized against pair issuance.
pub async fn revoke_family(db: &mut sqlx::PgConnection, family_id: i64) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    lock_family(&mut tx, family_id).await?;
    revoke_family_rows(&mut tx, family_id).await?;
    tx.commit().await
}

/// Only called with the family lock held in an open transaction. Refresh uses its existing transaction directly.
async fn revoke_family_rows(
    db: &mut sqlx::PgConnection,
    family_id: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE identity.refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL")
        .bind(family_id)
        .execute(&mut *db)
        .await?;
    sqlx::query("UPDATE identity.access_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL")
        .bind(family_id)
        .execute(db)
        .await?;
    Ok(())
}

/// `revokeToken` (RFC 7009): always 200 unless the request is malformed.
pub async fn revoke(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    body: Bytes,
) -> Result<Response, TokenError> {
    limit(&state, TOKEN_LIMIT, &ip_key_for(&state, ip)).await?;
    let f = form(&body)?;
    let client_id = f.get("client_id").map(String::as_str).unwrap_or("");
    if client(client_id).is_none() {
        return Err(OAuthError::new("invalid_client").into());
    }
    let token = f
        .get("token")
        .filter(|t| !t.is_empty() && t.len() <= 256)
        .ok_or_else(|| OAuthError::new("invalid_request"))?;
    let hash = token_hash(token);
    let family: Option<i64> = sqlx::query_scalar(
        "SELECT family_id FROM identity.refresh_tokens WHERE token_hash = $1 AND client_id = $2 \
         UNION ALL SELECT family_id FROM identity.access_tokens WHERE token_hash = $1 AND client_id = $2 LIMIT 1",
    )
    .bind(&hash)
    .bind(client_id)
    .fetch_optional(&state.db)
    .await?;
    if let Some(family_id) = family {
        // Revoking a refresh token ends the sign-in; revoking an access token ends only that token.
        if token.starts_with("mrt_") {
            revoke_family(&mut *state.db.acquire().await?, family_id).await?;
        } else {
            sqlx::query("UPDATE identity.access_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL")
                .bind(&hash)
                .execute(&state.db)
                .await?;
        }
    }
    Ok(no_store(StatusCode::OK.into_response()))
}

fn no_store(mut r: Response) -> Response {
    r.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r.headers_mut()
        .insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn family_lock_keys_preserve_every_bit_without_narrowing_ids() {
        let halves = [i32::MIN, i32::MIN + 1, -1, 0, 1, i32::MAX - 1, i32::MAX];
        for high in halves {
            for low in halves {
                let id = (i64::from(high) << 32) | i64::from(low as u32);
                assert_eq!(family_lock_key(id), (high, low));
            }
        }
        for id in [i64::MIN, -1, 0, 1, i64::from(u32::MAX), i64::MAX] {
            let (high, low) = family_lock_key(id);
            assert_eq!((i64::from(high) << 32) | i64::from(low as u32), id);
        }
    }

    #[test]
    fn user_codes_use_the_rfc_alphabet() {
        for _ in 0..200 {
            let c = new_user_code();
            assert_eq!(c.len(), 8);
            assert!(c.bytes().all(|b| USER_CODE_ALPHABET.contains(&b)));
        }
        assert_eq!(
            normalize_user_code("wdjb-mjht"),
            Some("WDJBMJHT".to_owned())
        );
        assert_eq!(
            normalize_user_code("WDJB MJHT"),
            Some("WDJBMJHT".to_owned())
        );
        assert_eq!(
            normalize_user_code("WDJB-MJHA"),
            None,
            "vowels are not in the alphabet"
        );
        assert_eq!(normalize_user_code("WDJB"), None);
    }

    #[test]
    fn scopes_follow_the_client() {
        assert_eq!(
            parse_scopes("metallic-studio", Some("profile play publish")).ok(),
            Some(vec!["profile".into(), "play".into(), "publish".into()])
        );
        assert_eq!(
            parse_scopes("metallic-launcher", None).ok(),
            Some(vec!["profile".into(), "play".into()])
        );
        assert_eq!(
            parse_scopes("metallic-launcher", Some("publish"))
                .err()
                .map(|e| e.error),
            Some("invalid_scope")
        );
        assert_eq!(
            parse_scopes("other", None).err().map(|e| e.error),
            Some("invalid_client")
        );
    }
}
