//! Website accounts: sign-up, username check, sign-in and out, the session, email verification, and the deletion of
//! accounts that never verified (spec 9.2).

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use time::{Date, Duration, OffsetDateTime, format_description::well_known::Iso8601};

use super::{
    AgeBand, UserSummary, age_on,
    auth::{
        AuthKind, Viewer, clear_session_cookie, create_session, ip_key_for, limit, require_session,
        session_cookie,
    },
    names::{self, Unavailable},
};
use crate::{
    AppState,
    crypto::{self, csrf_token, email_hash, keyed_hash, new_token, token_hash},
    http::{ApiJson, ApiQuery, ClientIp, rfc3339},
    problem::{ApiResult, Problem, Validator},
    services::{Email, EmailKind, Limit},
    text,
};

const VERIFY_TOKEN_TTL: Duration = Duration::days(7);
const SIGNUP_LIMIT: Limit = Limit::per_hour("signup", 20);
const LOGIN_IP_LIMIT: Limit = Limit::per_minute("login_ip", 20);
const LOGIN_NAME_LIMIT: Limit = Limit {
    name: "login_name",
    max: 10,
    window: std::time::Duration::from_secs(900),
};
const VERIFY_LIMIT: Limit = Limit::per_minute("verify_email", 20);
const RESEND_LIMIT: Limit = Limit::per_hour("resend_email", 3);

/// The `Session` schema.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBody {
    pub user: UserSummary,
    pub csrf_token: String,
    pub expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignUpRequest {
    username: Option<String>,
    password: Option<String>,
    email: Option<String>,
    birth_date: Option<String>,
    parent_email: Option<String>,
    accept_terms: Option<bool>,
    captcha_token: Option<String>,
}

/// Common passwords refused at sign-up. The full breached-password list (k-anonymity, spec 9.2) plugs in here.
const COMMON_PASSWORDS: [&str; 16] = [
    "1234567890",
    "12345678910",
    "123456789a",
    "password123",
    "password1234",
    "passwordpassword",
    "qwertyuiop",
    "1q2w3e4r5t",
    "iloveyou123",
    "abc1234567",
    "0987654321",
    "1111111111",
    "letmein1234",
    "qwerty12345",
    "welcome123",
    "football123",
];

fn password_problem(
    password: &str,
    username: &str,
    email: &str,
) -> Option<(&'static str, &'static str)> {
    let len = password.chars().count();
    if len < 10 {
        return Some(("too_short", "Use at least 10 characters."));
    }
    if len > 128 {
        return Some(("too_long", "Use at most 128 characters."));
    }
    let lower = password.to_lowercase();
    if COMMON_PASSWORDS.contains(&lower.as_str())
        || lower.chars().all(|c| Some(c) == lower.chars().next())
    {
        return Some(("too_common", "This password is too easy to guess."));
    }
    if !username.is_empty() && lower.contains(&username.to_lowercase()) {
        return Some((
            "contains_username",
            "Do not use your username in your password.",
        ));
    }
    if let Some((local, _)) = email.split_once('@')
        && local.len() >= 4
        && lower.contains(&local.to_lowercase())
    {
        return Some(("contains_email", "Do not use your email in your password."));
    }
    None
}

/// `signUp`
pub async fn sign_up(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    ApiJson(body): ApiJson<SignUpRequest>,
) -> ApiResult<Response> {
    let ip_key = ip_key_for(&state, ip);
    limit(&state, SIGNUP_LIMIT, &ip_key).await?;

    let mut v = Validator::new();
    let username = body.username.unwrap_or_default();
    let password = body.password.unwrap_or_default();
    let email = body.email.unwrap_or_default().trim().to_owned();
    if !names::valid_format(&username) {
        v.add(
            "username",
            "invalid",
            "Use 3 to 20 letters, digits or single underscores, not at the start or end.",
        );
    }
    if !text::valid_email(&email) {
        v.add("email", "invalid", "Enter a valid email address.");
    }
    if let Some((code, msg)) = password_problem(&password, &username, &email) {
        v.add("password", code, msg);
    }
    if body.accept_terms != Some(true) {
        v.add("acceptTerms", "required", "Accept the terms to continue.");
    }
    let today = OffsetDateTime::now_utc().date();
    let birth = body
        .birth_date
        .as_deref()
        .and_then(|d| Date::parse(d, &Iso8601::DATE).ok());
    let age = match birth {
        Some(b) if b <= today && age_on(b, today) <= 120 => Some(age_on(b, today)),
        _ => {
            v.add(
                "birthDate",
                "invalid",
                "Enter your birth date as YYYY-MM-DD.",
            );
            None
        }
    };
    let needs_parent = age.is_some_and(|a| a < state.config.policy.parental_consent_age);
    let parent_email = body
        .parent_email
        .map(|e| e.trim().to_owned())
        .filter(|e| !e.is_empty());
    if needs_parent {
        match &parent_email {
            Some(p) if text::valid_email(p) && !p.eq_ignore_ascii_case(&email) => {}
            Some(_) => v.add(
                "parentEmail",
                "invalid",
                "Enter a parent's email address, different from yours.",
            ),
            None => v.add(
                "parentEmail",
                "required",
                "Players under 13 need a parent's email address.",
            ),
        }
    }
    v.finish()?;
    let age = age.unwrap_or(0);
    let band = AgeBand::from_age(age);

    if let Some(reason) = names::check(&state.db, &username).await? {
        let detail = match reason {
            Unavailable::Taken => "That name is taken.",
            Unavailable::Reserved => "That name is reserved.",
            Unavailable::ReleasedRecently => "That name was freed recently and is on hold.",
            Unavailable::NotAllowed => "That name is not allowed.",
            Unavailable::Invalid => "That name is not valid.",
        };
        return Err(
            Problem::conflict("username_unavailable", "Username not available").with_detail(detail),
        );
    }

    let secrets = &state.secrets;
    let policy = &state.config.policy;
    let e_hash = email_hash(&secrets.hmac_key, &email);
    let (accounts, banned): (i64, bool) = sqlx::query_as(
        "SELECT count(*), coalesce(bool_or(u.status = 'banned' OR p.banned_until > now()), false) \
         FROM identity.users u JOIN identity.persons p ON p.id = u.person_id \
         WHERE u.email_hash = $1",
    )
    .bind(&e_hash)
    .fetch_one(&state.db)
    .await?;
    if banned {
        return Err(
            Problem::conflict("email_unavailable", "Email not available")
                .with_detail("This email address cannot be used for a new account."),
        );
    }
    if accounts >= policy.max_accounts_per_email {
        return Err(Problem::conflict("account_limit_reached", "Account limit reached").with_detail(format!(
            "One email address can hold at most {} accounts. Use the account switcher instead.",
            policy.max_accounts_per_email
        )));
    }

    // Many sign-ups from one network: captcha first, then a manual-review hold (spec 9.2). Never a ban by itself.
    let ip_hmac = keyed_hash(&secrets.hmac_key, "ip", ip.to_string().as_bytes());
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM identity.signup_signals WHERE ip_hmac = $1 AND created_at > now() - interval '24 hours'",
    )
    .bind(&ip_hmac)
    .fetch_one(&state.db)
    .await?;
    if recent >= policy.signups_per_ip_free {
        let ok = match body.captcha_token.as_deref() {
            Some(t) if !t.is_empty() && t.len() <= 4096 => state.captcha.verify(t).await,
            _ => false,
        };
        if !ok {
            return Err(Problem::invalid(
                "captchaToken",
                "captcha_required",
                "Complete the captcha to continue.",
            ));
        }
    }
    let review_hold = recent >= policy.signups_per_ip_review;

    let password_for_hash = password.clone();
    let password_hash =
        tokio::task::spawn_blocking(move || crypto::hash_password(&password_for_hash))
            .await
            .map_err(|_| Problem::internal())?;

    let user_id = state.ids.next();
    let person_id = state.ids.next();
    let (status, status_reason) = if needs_parent {
        ("limited", Some("parent_consent"))
    } else if review_hold {
        ("limited", Some("signup_review"))
    } else {
        ("active", None)
    };
    let birth_text = birth.map(|b| b.to_string()).unwrap_or_default();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO identity.persons (id) VALUES ($1)")
        .bind(person_id)
        .execute(&mut *tx)
        .await?;
    let inserted = sqlx::query(
        "INSERT INTO identity.users (id, username, display_name, email_ciphertext, email_hash, birth_date_ciphertext, \
             age_band, status, status_reason, parent_email_ciphertext, delete_after, person_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + make_interval(days => $11::int), $12)",
    )
    .bind(user_id)
    .bind(&username)
    .bind(&username)
    .bind(crypto::encrypt(&secrets.data_key, "email", email.as_bytes()))
    .bind(&e_hash)
    .bind(crypto::encrypt(&secrets.data_key, "birth_date", birth_text.as_bytes()))
    .bind(band.as_str())
    .bind(status)
    .bind(status_reason)
    .bind(parent_email.as_ref().filter(|_| needs_parent).map(|p| crypto::encrypt(&secrets.data_key, "parent_email", p.as_bytes())))
    .bind(policy.verify_window_days as i32)
    .bind(person_id)
    .execute(&mut *tx)
    .await;
    match inserted {
        Ok(_) => {}
        Err(e) if crate::problem::is_unique_violation(&e) => {
            return Err(
                Problem::conflict("username_unavailable", "Username not available")
                    .with_detail("That name is taken."),
            );
        }
        Err(e) => return Err(e.into()),
    }
    sqlx::query("INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&password_hash)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO identity.signup_signals (user_id, ip_hmac) VALUES ($1, $2)")
        .bind(user_id)
        .bind(&ip_hmac)
        .execute(&mut *tx)
        .await?;
    crate::social::create_default_settings(&mut tx, user_id, band).await?;
    let (kind, to) = if needs_parent {
        (
            EmailKind::ParentConsent,
            parent_email.clone().unwrap_or_default(),
        )
    } else {
        (EmailKind::Verify, email.clone())
    };
    let token = issue_email_token(
        &mut tx,
        user_id,
        kind,
        needs_parent.then(|| email_hash(&secrets.hmac_key, &to)),
    )
    .await?;
    tx.commit().await?;

    send_email(&state, kind, &to, &username, &token).await;
    tracing::info!(user_id, age_band = band.as_str(), status, "account created");

    let session = create_session(&state, &headers, ip, user_id).await?;
    let user = UserSummary {
        id: user_id.to_string(),
        username: username.clone(),
        display_name: username,
        avatar_headshot_url: None,
    };
    let body = SessionBody {
        user,
        csrf_token: session.csrf_token,
        expires_at: rfc3339(session.expires_at),
    };
    Ok((
        StatusCode::CREATED,
        [(header::SET_COOKIE, session_cookie(&state, &session.token))],
        Json(body),
    )
        .into_response())
}

async fn issue_email_token(
    conn: &mut PgConnection,
    user_id: i64,
    kind: EmailKind,
    target_email_hash: Option<Vec<u8>>,
) -> ApiResult<String> {
    // A new link replaces older unused ones.
    sqlx::query("UPDATE identity.email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL")
        .bind(user_id)
        .bind(kind.as_str())
        .execute(&mut *conn)
        .await?;
    let token = new_token("");
    sqlx::query(
        "INSERT INTO identity.email_tokens (token_hash, user_id, purpose, target_email_hash, expires_at) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(token_hash(&token))
    .bind(user_id)
    .bind(kind.as_str())
    .bind(target_email_hash)
    .bind(OffsetDateTime::now_utc() + VERIFY_TOKEN_TTL)
    .execute(&mut *conn)
    .await?;
    Ok(token)
}

async fn send_email(state: &AppState, kind: EmailKind, to: &str, username: &str, token: &str) {
    let link = format!("{}/verify-email?token={token}", state.config.public_web_url);
    let (subject, body) = match kind {
        EmailKind::Verify => (
            "Confirm your Metallic email".to_owned(),
            format!(
                "Hi {username},\n\nConfirm your email address to keep your Metallic account:\n{link}\n\n\
                 Accounts that are not confirmed within {} days are deleted.\n",
                state.config.policy.verify_window_days
            ),
        ),
        EmailKind::ParentConsent => (
            "Your child wants to join Metallic".to_owned(),
            format!(
                "Hello,\n\nSomeone under 13 created the Metallic account \"{username}\" and gave this address as a \
                 parent's. If you agree, confirm here:\n{link}\n\nIf you did not expect this, ignore this email and \
                 the account will be deleted.\n"
            ),
        ),
    };
    if let Err(e) = state
        .mailer
        .send(Email {
            to: to.to_owned(),
            kind,
            subject,
            body,
            link,
        })
        .await
    {
        tracing::error!(kind = kind.as_str(), error = %e, "email could not be sent");
    }
}

#[derive(Deserialize)]
pub struct UsernameQuery {
    username: Option<String>,
}

#[derive(Serialize)]
pub struct UsernameCheck {
    username: String,
    available: bool,
    reason: Option<Unavailable>,
}

/// `checkUsername`
pub async fn check_username(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    ApiQuery(q): ApiQuery<UsernameQuery>,
) -> ApiResult<Json<UsernameCheck>> {
    let per_hour = state.config.policy.username_checks_per_hour;
    limit(
        &state,
        Limit::per_hour("username_check", per_hour),
        &ip_key_for(&state, ip),
    )
    .await?;
    let username = q.username.unwrap_or_default();
    if username.len() > 64 {
        return Err(Problem::invalid(
            "username",
            "too_long",
            "Use 3 to 20 characters.",
        ));
    }
    let reason = names::check(&state.db, &username).await?;
    Ok(Json(UsernameCheck {
        username,
        available: reason.is_none(),
        reason,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    login: Option<String>,
    password: Option<String>,
}

/// `logIn`
pub async fn log_in(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
    ApiJson(body): ApiJson<LoginRequest>,
) -> ApiResult<Response> {
    limit(&state, LOGIN_IP_LIMIT, &ip_key_for(&state, ip)).await?;
    let login = body.login.unwrap_or_default().trim().to_owned();
    let password = body.password.unwrap_or_default();
    let mut v = Validator::new();
    v.check(
        !login.is_empty() && login.len() <= 254,
        "login",
        "invalid",
        "Enter your username or email.",
    );
    v.check(
        !password.is_empty() && password.len() <= 128,
        "password",
        "invalid",
        "Enter your password.",
    );
    v.finish()?;
    let login_key = super::auth::short_key(&keyed_hash(
        &state.secrets.hmac_key,
        "login",
        login.to_lowercase().as_bytes(),
    ));
    limit(&state, LOGIN_NAME_LIMIT, &login_key).await?;

    // Up to the per-email account limit can share an address; the password picks the account.
    let candidates: Vec<(i64, String, String)> = if login.contains('@') {
        sqlx::query_as(
            "SELECT u.id, u.status, c.password_hash FROM identity.users u \
             JOIN identity.credentials c ON c.user_id = u.id WHERE u.email_hash = $1 ORDER BY u.created_at LIMIT 10",
        )
        .bind(email_hash(&state.secrets.hmac_key, &login))
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT u.id, u.status, c.password_hash FROM identity.users u \
             JOIN identity.credentials c ON c.user_id = u.id WHERE u.username = $1::citext",
        )
        .bind(&login)
        .fetch_all(&state.db)
        .await?
    };
    let checked = tokio::task::spawn_blocking(move || {
        if candidates.is_empty() {
            // Same work as a real check so timing does not reveal whether the account exists.
            let _ = crypto::verify_password(&password, crypto::dummy_password_hash());
            return None;
        }
        candidates
            .into_iter()
            .find(|(_, _, hash)| crypto::verify_password(&password, hash))
    })
    .await
    .map_err(|_| Problem::internal())?;
    let invalid = || {
        Problem::new(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
            "Sign-in failed",
        )
    };
    let Some((user_id, status, _)) = checked else {
        return Err(invalid());
    };
    match status.as_str() {
        "banned" => {
            return Err(Problem::forbidden("account_banned", "Account banned")
                .with_detail("See the moderation notice for the reason and how to appeal."));
        }
        "pending_deletion" => return Err(invalid()),
        _ => {}
    }
    let has_mfa: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM identity.mfa_factors WHERE user_id = $1)")
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;
    if has_mfa {
        // TOTP and passkeys are not built yet; accounts with a factor cannot finish here.
        return Err(Problem::forbidden("mfa_required", "Second step needed"));
    }
    let user = super::basic(&state.db, user_id)
        .await?
        .ok_or_else(invalid)?;
    let session = create_session(&state, &headers, ip, user_id).await?;
    tracing::info!(user_id, "signed in");
    let body = SessionBody {
        user: user.summary(),
        csrf_token: session.csrf_token,
        expires_at: rfc3339(session.expires_at),
    };
    Ok((
        [(header::SET_COOKIE, session_cookie(&state, &session.token))],
        Json(body),
    )
        .into_response())
}

/// `logOut`: ends the browser session, or revokes the app's whole token family.
pub async fn log_out(State(state): State<AppState>, viewer: Viewer) -> ApiResult<Response> {
    match &viewer.kind {
        AuthKind::Session { session_hash, .. } => {
            sqlx::query("UPDATE identity.sessions SET revoked_at = now() WHERE id_hash = $1")
                .bind(session_hash)
                .execute(&state.db)
                .await?;
        }
        AuthKind::Bearer { family_id, .. } => {
            super::oauth::revoke_family(&mut *state.db.acquire().await?, *family_id).await?
        }
    }
    Ok((
        StatusCode::NO_CONTENT,
        [(header::SET_COOKIE, clear_session_cookie(&state))],
    )
        .into_response())
}

/// `getSession` (website only).
pub async fn get_session(
    State(state): State<AppState>,
    viewer: Viewer,
) -> ApiResult<Json<SessionBody>> {
    require_session(&viewer)?;
    let AuthKind::Session {
        session_hash,
        expires_at,
    } = &viewer.kind
    else {
        return Err(Problem::unauthorized());
    };
    let user = super::basic(&state.db, viewer.user_id)
        .await?
        .ok_or_else(Problem::unauthorized)?;
    Ok(Json(SessionBody {
        user: user.summary(),
        csrf_token: csrf_token(&state.secrets.hmac_key, session_hash),
        expires_at: rfc3339(*expires_at),
    }))
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    token: Option<String>,
}

/// `verifyEmail`: confirms an email (or a parent's consent) with the token from the link.
pub async fn verify_email(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    ApiJson(body): ApiJson<VerifyRequest>,
) -> ApiResult<StatusCode> {
    limit(&state, VERIFY_LIMIT, &ip_key_for(&state, ip)).await?;
    let token = body.token.unwrap_or_default();
    if !(16..=128).contains(&token.len()) {
        return Err(Problem::invalid(
            "token",
            "invalid",
            "The link is not complete.",
        ));
    }
    let gone = || {
        Problem::new(StatusCode::GONE, "token_expired", "Link expired")
            .with_detail("Ask for a new email.")
    };
    let mut tx = state.db.begin().await?;
    let row: Option<(i64, String, Option<Vec<u8>>)> = sqlx::query_as(
        "SELECT user_id, purpose, target_email_hash FROM identity.email_tokens \
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE",
    )
    .bind(token_hash(&token))
    .fetch_optional(&mut *tx)
    .await?;
    let Some((user_id, purpose, target)) = row else {
        return Err(gone());
    };
    sqlx::query("UPDATE identity.email_tokens SET used_at = now() WHERE token_hash = $1")
        .bind(token_hash(&token))
        .execute(&mut *tx)
        .await?;
    match purpose.as_str() {
        "verify" => mark_verified(&mut tx, &state, user_id).await?,
        "parent_consent" => {
            mark_verified(&mut tx, &state, user_id).await?;
            sqlx::query(
                "UPDATE identity.users SET status = 'active', status_reason = NULL \
                 WHERE id = $1 AND status = 'limited' AND status_reason = 'parent_consent'",
            )
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
            sqlx::query("INSERT INTO identity.parental_consents (child_user_id, parent_email_hash, method) VALUES ($1, $2, 'email')")
                .bind(user_id)
                .bind(target.unwrap_or_default())
                .execute(&mut *tx)
                .await?;
        }
        _ => return Err(gone()),
    }
    tx.commit().await?;
    tracing::info!(user_id, purpose = purpose.as_str(), "email confirmed");
    Ok(StatusCode::NO_CONTENT)
}

/// Marks the account verified and links it to the person of other accounts verified with the same email
/// (spec 9.2 alts). Linking to a banned person bans this account too (ban evasion).
async fn mark_verified(conn: &mut PgConnection, _state: &AppState, user_id: i64) -> ApiResult<()> {
    let row: Option<(Option<Vec<u8>>, i64, Option<OffsetDateTime>)> =
        sqlx::query_as("SELECT email_hash, person_id, email_verified_at FROM identity.users WHERE id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *conn)
            .await?;
    let Some((email_hash, own_person, verified_at)) = row else {
        return Ok(());
    };
    if verified_at.is_some() {
        return Ok(());
    }
    sqlx::query(
        "UPDATE identity.users SET email_verified_at = now(), delete_after = NULL WHERE id = $1",
    )
    .bind(user_id)
    .execute(&mut *conn)
    .await?;
    let Some(email_hash) = email_hash else {
        return Ok(());
    };
    let other: Option<(i64, bool)> = sqlx::query_as(
        "SELECT p.id, (p.banned_until > now() OR EXISTS (SELECT 1 FROM identity.users b WHERE b.person_id = p.id AND b.status = 'banned')) \
         FROM identity.users u JOIN identity.persons p ON p.id = u.person_id \
         WHERE u.email_hash = $1 AND u.id <> $2 AND u.email_verified_at IS NOT NULL \
         ORDER BY u.email_verified_at LIMIT 1",
    )
    .bind(&email_hash)
    .bind(user_id)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some((person_id, banned)) = other
        && person_id != own_person
    {
        sqlx::query("UPDATE identity.users SET person_id = $2 WHERE id = $1")
            .bind(user_id)
            .bind(person_id)
            .execute(&mut *conn)
            .await?;
        sqlx::query(
            "INSERT INTO identity.account_links (user_id, person_id, link_kind, strength) VALUES ($1, $2, 'same_email', 'strong') \
             ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .bind(person_id)
        .execute(&mut *conn)
        .await?;
        if banned {
            sqlx::query("UPDATE identity.users SET status = 'banned', status_reason = 'ban_evasion' WHERE id = $1")
                .bind(user_id)
                .execute(&mut *conn)
                .await?;
            sqlx::query("UPDATE identity.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL")
                .bind(user_id)
                .execute(&mut *conn)
                .await?;
            tracing::warn!(
                user_id,
                "account linked to a banned person; banned for ban evasion"
            );
        }
    }
    Ok(())
}

/// `resendVerificationEmail`
pub async fn resend_verification(
    State(state): State<AppState>,
    viewer: Viewer,
) -> ApiResult<StatusCode> {
    limit(&state, RESEND_LIMIT, &viewer.user_id.to_string()).await?;
    let row: Option<(String, Option<OffsetDateTime>, Option<Vec<u8>>, Option<Vec<u8>>, Option<String>)> = sqlx::query_as(
        "SELECT username::text, email_verified_at, email_ciphertext, parent_email_ciphertext, status_reason \
         FROM identity.users WHERE id = $1",
    )
    .bind(viewer.user_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((username, verified_at, email_ct, parent_ct, reason)) = row else {
        return Err(Problem::unauthorized());
    };
    if verified_at.is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }
    let key = &state.secrets.data_key;
    let (kind, to) = if reason.as_deref() == Some("parent_consent") {
        (
            EmailKind::ParentConsent,
            parent_ct.and_then(|c| crypto::decrypt(key, "parent_email", &c)),
        )
    } else {
        (
            EmailKind::Verify,
            email_ct.and_then(|c| crypto::decrypt(key, "email", &c)),
        )
    };
    let Some(to) = to.and_then(|b| String::from_utf8(b).ok()) else {
        tracing::error!(user_id = viewer.user_id, "stored email cannot be decrypted");
        return Err(Problem::internal());
    };
    let mut tx = state.db.begin().await?;
    let target =
        (kind == EmailKind::ParentConsent).then(|| email_hash(&state.secrets.hmac_key, &to));
    let token = issue_email_token(&mut tx, viewer.user_id, kind, target).await?;
    tx.commit().await?;
    send_email(&state, kind, &to, &username, &token).await;
    Ok(StatusCode::NO_CONTENT)
}

// ------------------------------------------------------------------ deletion

/// Deletes accounts whose verification window has passed (spec 9.2). Returns how many were deleted.
pub async fn purge_unverified(state: &AppState) -> ApiResult<u64> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM identity.users \
         WHERE email_verified_at IS NULL AND delete_after < now() AND NOT is_first_party \
         ORDER BY delete_after LIMIT 500",
    )
    .fetch_all(&state.db)
    .await?;
    for id in &ids {
        purge_account(state, *id).await?;
    }
    if !ids.is_empty() {
        tracing::info!(count = ids.len(), "deleted unverified accounts");
    }
    Ok(ids.len() as u64)
}

/// Erases an account's personal data across modules and holds its username (spec 9.2). Ledger history stays
/// (append-only); play sessions are kept without the user id.
pub async fn purge_account(state: &AppState, user_id: i64) -> ApiResult<()> {
    let policy = &state.config.policy;
    let mut tx = state.db.begin().await?;
    let username: Option<String> =
        sqlx::query_scalar("SELECT username::text FROM identity.users WHERE id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(username) = username else {
        return Ok(());
    };
    names::hold(
        &mut *tx,
        &username,
        "deletion",
        None,
        policy.name_hold_deletion_days,
        policy.name_release_jitter_days,
    )
    .await?;
    crate::social::purge_user(&mut tx, user_id).await?;
    crate::games::purge_user(&mut tx, user_id).await?;
    crate::economy::purge_user(&mut tx, user_id).await?;
    sqlx::query("DELETE FROM identity.users WHERE id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_rules() {
        assert!(
            password_problem("correct-horse-battery-staple", "kit", "kit@example.com").is_none()
        );
        assert_eq!(
            password_problem("short", "kit", "kit@example.com").map(|p| p.0),
            Some("too_short")
        );
        assert_eq!(
            password_problem("password123", "kit", "kit@example.com").map(|p| p.0),
            Some("too_common")
        );
        assert_eq!(
            password_problem("aaaaaaaaaaaa", "kit", "kit@example.com").map(|p| p.0),
            Some("too_common")
        );
        assert_eq!(
            password_problem("my-ferro_kit-pass", "ferro_kit", "x@example.com").map(|p| p.0),
            Some("contains_username")
        );
        assert_eq!(
            password_problem("ferrokit-is-me-1", "abc", "ferrokit@example.com").map(|p| p.0),
            Some("contains_email")
        );
    }
}
