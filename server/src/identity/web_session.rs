//! Web-session handoff (plateform #7, section 4). A first-party native app trades its sign-in for a one-time code,
//! and the website redeems the code server-side for a normal session cookie. The Launcher's web view has its own
//! cookie jar, so this is how a user signed in to the Launcher is also signed in to the site shown inside it.

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use time::{Duration, OffsetDateTime};

use super::{
    account::SessionBody,
    auth::{AuthKind, Viewer, create_session, ip_key_for, limit, session_cookie},
};
use crate::{
    AppState,
    crypto::{new_token, token_hash},
    http::{ApiJson, ClientIp, rfc3339},
    problem::{ApiResult, Problem},
    services::Limit,
};

/// Codes are single use and live this long (the Launcher opens the handoff page right away).
pub const CODE_TTL: Duration = Duration::seconds(60);
const CODE_PREFIX: &str = "wsc_";
const ISSUE_LIMIT: Limit = Limit::per_minute("web_session_issue", 10);
const REDEEM_LIMIT: Limit = Limit::per_minute("web_session_redeem", 30);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSessionCode {
    code: String,
    expires_at: String,
}

/// `createWebSessionCode`: needs a first-party app's bearer token with the `profile` scope. A browser session
/// cannot mint codes: it already has a cookie, and a code would let a page hand its session to another browser.
pub async fn create_code(State(state): State<AppState>, viewer: Viewer) -> ApiResult<Response> {
    let AuthKind::Bearer { client_id, .. } = &viewer.kind else {
        return Err(Problem::forbidden(
            "native_app_required",
            "Only the Metallic apps can do this",
        )
        .with_detail("Send the app's bearer access token."));
    };
    viewer.require_scope("profile")?;
    limit(&state, ISSUE_LIMIT, &viewer.user_id.to_string()).await?;
    let code = new_token(CODE_PREFIX);
    let expires_at = OffsetDateTime::now_utc() + CODE_TTL;
    sqlx::query(
        "INSERT INTO identity.web_session_codes (code_hash, user_id, client_id, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(token_hash(&code))
    .bind(viewer.user_id)
    .bind(client_id)
    .bind(expires_at)
    .execute(&state.db)
    .await?;
    let body = WebSessionCode {
        code,
        expires_at: rfc3339(expires_at),
    };
    Ok(no_store(Json(body).into_response()))
}

#[derive(Deserialize)]
pub struct RedeemRequest {
    code: Option<String>,
}

/// `redeemWebSessionCode`: called by the website's server, never by the browser. Answers like `logIn`: the
/// session body plus `Set-Cookie`. A wrong, used or expired code is one 400, so the answer says nothing about
/// which codes exist.
pub async fn redeem_code(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    ApiJson(req): ApiJson<RedeemRequest>,
) -> ApiResult<Response> {
    limit(&state, REDEEM_LIMIT, &ip_key_for(&state, ip)).await?;
    let code = req
        .code
        .as_deref()
        .map(str::trim)
        .filter(|c| c.starts_with(CODE_PREFIX) && c.len() <= 128)
        .ok_or_else(invalid_code)?;
    let hash = token_hash(code);
    let mut claim = state.db.begin().await?;
    // The predicate of a blocked UPDATE can be evaluated before its row lock is available.
    // Lock without a time predicate, then claim against the database's actual clock while we own the row.
    let found: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM identity.web_session_codes WHERE code_hash = $1 FOR UPDATE",
    )
    .bind(&hash)
    .fetch_optional(&mut *claim)
    .await?;
    if found.is_none() {
        return Err(invalid_code());
    }
    let user_id: Option<i64> = sqlx::query_scalar(
        "UPDATE identity.web_session_codes c SET used_at = clock_timestamp() FROM identity.users u \
         WHERE c.code_hash = $1 AND c.used_at IS NULL AND c.expires_at > clock_timestamp() \
           AND u.id = c.user_id AND u.status IN ('active', 'limited', 'suspended') \
         RETURNING c.user_id",
    )
    .bind(&hash)
    .fetch_optional(&mut *claim)
    .await?;
    let user_id = user_id.ok_or_else(invalid_code)?;
    // Preserve the single-use claim boundary, releasing its connection before session creation uses the pool.
    claim.commit().await?;
    let user = super::basic(&state.db, user_id)
        .await?
        .ok_or_else(invalid_code)?;
    let session = create_session(&state, &headers, ip, user_id).await?;
    tracing::info!(user_id, "signed in through a web-session code");
    let body = SessionBody {
        user: user.summary(),
        csrf_token: session.csrf_token,
        expires_at: rfc3339(session.expires_at),
    };
    Ok(no_store(
        (
            [(header::SET_COOKIE, session_cookie(&state, &session.token))],
            Json(body),
        )
            .into_response(),
    ))
}

fn invalid_code() -> Problem {
    Problem::new(
        StatusCode::BAD_REQUEST,
        "invalid_code",
        "This sign-in link has expired",
    )
    .with_detail("Sign in again from Metallic Play.")
}

fn no_store(mut r: Response) -> Response {
    r.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}
