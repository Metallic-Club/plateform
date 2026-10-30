//! Authenticated endpoint resolution. Tickets bind once, stay unconsumed and retain their original expiry.

use axum::{
    Json,
    extract::State,
    http::header,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::{PgConnection, Postgres, Transaction};
use time::OffsetDateTime;

use super::{SERVER_COLUMNS, ServerRow, pick_server, visible_friends};
use crate::{
    AppState,
    crypto::token_hash,
    http::{ApiJson, rfc3339},
    identity::auth::{Viewer, limit},
    problem::{ApiResult, Problem},
    services::Limit,
    social,
};

const CONNECT_LIMIT: Limit = Limit::per_minute("join_connect", 30);
const ELIGIBLE: &str = "status = 'running' AND joinable AND cardinality(player_ids) < max_players \
    AND last_heartbeat_at > clock_timestamp() - interval '30 seconds' AND host IS NOT NULL";

/// An optional field must be absent, rather than explicitly null, when using legacy registration.
fn supplied<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

/// Optional as a group, for backwards-compatible registration. Never derive Debug for endpoint-bearing input.
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConnectionFields {
    #[serde(default, deserialize_with = "supplied")]
    host: Option<String>,
    #[serde(default, deserialize_with = "supplied")]
    port: Option<i32>,
    #[serde(default, deserialize_with = "supplied")]
    cert_sha256: Option<String>,
    #[serde(default, deserialize_with = "supplied")]
    protocol_major: Option<i32>,
    #[serde(default, deserialize_with = "supplied")]
    engine_version: Option<String>,
    #[serde(default, deserialize_with = "supplied")]
    build_id: Option<String>,
}

/// Database-backed connection facts. No endpoint fields are recorded in tracing or problem details.
#[derive(sqlx::FromRow)]
pub(super) struct ConnectionMetadata {
    pub host: String,
    pub port: i32,
    pub cert_sha256: String,
    pub protocol_major: i32,
    pub engine_version: String,
    pub build_id: String,
}

fn invalid_field(field: &'static str) -> Problem {
    Problem::invalid(field, "invalid", "Invalid connection metadata.")
}

fn host(text: &str) -> Option<String> {
    if text.is_empty() || text.len() > 253 || !text.is_ascii() {
        return None;
    }
    if let Ok(address) = text.parse::<std::net::IpAddr>() {
        return Some(address.to_string());
    }
    if text.bytes().all(|c| c.is_ascii_digit() || c == b'.') {
        return None;
    }
    let valid = text.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && label
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphanumeric)
            && label
                .as_bytes()
                .last()
                .is_some_and(u8::is_ascii_alphanumeric)
            && label
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    });
    valid.then(|| text.to_ascii_lowercase())
}

fn label(text: &str, maximum: usize, plus: bool) -> bool {
    !text.is_empty()
        && text.len() <= maximum
        && text
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && text.bytes().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-') || (plus && c == b'+')
        })
}

impl ConnectionFields {
    pub(super) fn validate(&self) -> ApiResult<Option<ConnectionMetadata>> {
        match (
            &self.host,
            self.port,
            &self.cert_sha256,
            self.protocol_major,
            &self.engine_version,
            &self.build_id,
        ) {
            (None, None, None, None, None, None) => Ok(None),
            (
                Some(address),
                Some(port),
                Some(certificate),
                Some(protocol),
                Some(engine),
                Some(build),
            ) => {
                let host = host(address).ok_or_else(|| invalid_field("host"))?;
                if !(1..=65535).contains(&port) {
                    return Err(invalid_field("port"));
                }
                if certificate.len() != 64 || !certificate.bytes().all(|c| c.is_ascii_hexdigit()) {
                    return Err(invalid_field("certSha256"));
                }
                if protocol <= 0 {
                    return Err(invalid_field("protocolMajor"));
                }
                if !label(engine, 64, true) {
                    return Err(invalid_field("engineVersion"));
                }
                if !label(build, 128, false) {
                    return Err(invalid_field("buildId"));
                }
                Ok(Some(ConnectionMetadata {
                    host,
                    port,
                    cert_sha256: certificate.to_ascii_lowercase(),
                    protocol_major: protocol,
                    engine_version: engine.clone(),
                    build_id: build.clone(),
                }))
            }
            _ => Err(Problem::invalid(
                "connectionMetadata",
                "incomplete",
                "Supply all connection fields or omit all of them.",
            )),
        }
    }
}

#[derive(Deserialize)]
struct ConnectRequest {
    ticket: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Connected {
    server_id: String,
    host: String,
    port: i32,
    cert_sha256: String,
    protocol: String,
    engine_version: String,
    build_id: String,
    expires_at: String,
}

#[derive(sqlx::FromRow)]
struct Ticket {
    game_id: i64,
    place_id: i64,
    server_id: Option<i64>,
    region: Option<String>,
}

fn invalid_ticket() -> Problem {
    Problem::new(
        axum::http::StatusCode::GONE,
        "ticket_invalid",
        "Ticket expired or already used",
    )
}

/// Fresh-clock validation after the caller has acquired the ticket row lock.
pub(super) async fn current_ticket(
    tx: &mut PgConnection,
    hash: &[u8],
    owner: i64,
) -> ApiResult<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM matchmaker.join_tickets \
        WHERE ticket_hash = $1 AND user_id = $2 AND redeemed_at IS NULL AND expires_at > clock_timestamp())")
        .bind(hash).bind(owner).fetch_one(tx).await?)
}

async fn choose_server(
    tx: &mut Transaction<'_, Postgres>,
    ticket: &Ticket,
    friends: &std::collections::HashSet<i64>,
    hidden: &std::collections::HashSet<i64>,
) -> ApiResult<Option<i64>> {
    if let Some(bound) = ticket.server_id {
        return Ok(Some(bound));
    }
    // Use the existing quick-join scoring and block filtering, without locking every candidate server.
    let candidates: Vec<ServerRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {SERVER_COLUMNS} FROM matchmaker.servers WHERE game_id = $1 AND place_id = $2 \
         AND {ELIGIBLE} ORDER BY started_at DESC LIMIT 2000"
    )))
    .bind(ticket.game_id)
    .bind(ticket.place_id)
    .fetch_all(&mut **tx)
    .await?;
    Ok(pick_server(&candidates, ticket.region.as_deref(), friends, hidden).map(|server| server.id))
}

/// `POST /v1/join-tickets/connect`: native bearer + play scope + owner, returning registered facts with no-store.
/// Ticket/server row locks serialize binding against redemption and server state changes. The final update uses
/// wall-clock expiry rather than transaction-start time, so waiting for a lock cannot revive an expired ticket.
pub async fn connect_join_ticket(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(raw): ApiJson<serde_json::Value>,
) -> ApiResult<Response> {
    if viewer.is_session() {
        return Err(Problem::forbidden(
            "native_token_required",
            "Use a native app access token",
        ));
    }
    viewer.require_scope("play")?;
    limit(&state, CONNECT_LIMIT, &viewer.user_id.to_string()).await?;
    let req: ConnectRequest = serde_json::from_value(raw)
        .map_err(|_| Problem::bad_request("Invalid connection request."))?;
    let ticket = req
        .ticket
        .filter(|text| {
            (4..=128).contains(&text.len())
                && text.starts_with("jt_")
                && text.as_bytes()[3..]
                    .iter()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
        })
        .ok_or_else(|| Problem::invalid("ticket", "invalid", "Not a ticket."))?;
    let hash = token_hash(&ticket);
    // Read social state before taking a pooled transaction connection. Concurrent waiters must not exhaust the
    // pool while the transaction holding their ticket lock waits for another connection to read these facts.
    let friends = visible_friends(&state, viewer.user_id).await?;
    let hidden = social::hidden_for(&state.db, viewer.user_id)
        .await?
        .into_iter()
        .collect();
    let mut tx = state.db.begin().await?;
    let ticket: Ticket = sqlx::query_as(
        "SELECT game_id, place_id, server_id, region FROM matchmaker.join_tickets \
        WHERE ticket_hash = $1 AND user_id = $2 AND redeemed_at IS NULL FOR UPDATE",
    )
    .bind(&hash)
    .bind(viewer.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(invalid_ticket)?;
    if !current_ticket(&mut tx, &hash, viewer.user_id).await? {
        return Err(invalid_ticket());
    }
    let chosen = choose_server(&mut tx, &ticket, &friends, &hidden).await?;
    let metadata: Option<ConnectionMetadata> = if let Some(server) = chosen {
        sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT host, port, cert_sha256, protocol_major, engine_version, build_id \
            FROM matchmaker.servers WHERE id = $1 AND game_id = $2 AND place_id = $3 AND {ELIGIBLE} FOR UPDATE")))
            .bind(server).bind(ticket.game_id).bind(ticket.place_id).fetch_optional(&mut *tx).await?
    } else {
        None
    };
    let Some((server, metadata)) = chosen.zip(metadata) else {
        if !current_ticket(&mut tx, &hash, viewer.user_id).await? {
            return Err(invalid_ticket());
        }
        return Err(Problem::conflict(
            "server_unavailable",
            "Server connection is unavailable",
        ));
    };
    // A SELECT ... WHERE fresh ... FOR UPDATE can evaluate freshness before waiting for an unchanged row lock.
    // Recheck the server in this later statement, after acquiring its lock, together with final ticket expiry.
    let expires: Option<OffsetDateTime> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("UPDATE matchmaker.join_tickets SET server_id = $2 \
        WHERE ticket_hash = $1 AND user_id = $3 AND redeemed_at IS NULL AND expires_at > clock_timestamp() \
        AND (server_id IS NULL OR server_id = $2) AND EXISTS (SELECT 1 FROM matchmaker.servers \
            WHERE id = $2 AND game_id = $4 AND place_id = $5 AND {ELIGIBLE}) RETURNING expires_at")))
        .bind(&hash).bind(server).bind(viewer.user_id).bind(ticket.game_id).bind(ticket.place_id)
        .fetch_optional(&mut *tx).await?;
    let Some(expires) = expires else {
        if !current_ticket(&mut tx, &hash, viewer.user_id).await? {
            return Err(invalid_ticket());
        }
        return Err(Problem::conflict(
            "server_unavailable",
            "Server connection is unavailable",
        ));
    };
    tx.commit().await?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(Connected {
            server_id: server.to_string(),
            host: metadata.host,
            port: metadata.port,
            cert_sha256: metadata.cert_sha256,
            protocol: format!("metallic/{}", metadata.protocol_major),
            engine_version: metadata.engine_version,
            build_id: metadata.build_id,
            expires_at: rfc3339(expires),
        }),
    )
        .into_response())
}
