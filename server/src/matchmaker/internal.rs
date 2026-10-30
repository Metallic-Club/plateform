//! Internal endpoints for game servers and host agents: register, heartbeat (every 5 s with the player list), stop,
//! and redeem a join ticket. Callers authenticate as their host with `Authorization: Bearer mht_...` (see
//! [`super::hosts`]); the shared secret from `METALLIC_SERVER_SECRET` is a deprecated fallback that is off unless
//! `METALLIC_LEGACY_SERVER_SECRET` is on. A host may only touch its own servers; the legacy secret only touches
//! servers without a host. Not for browsers or players; the edge should not route `/internal/` from the internet.

use std::collections::HashSet;

use axum::{
    Json,
    extract::{FromRequestParts, State},
    http::{StatusCode, header, request::Parts},
};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;

use super::{HEARTBEAT_INTERVAL_SECS, valid_region_code};
use crate::{
    AppState,
    crypto::{ct_eq, token_hash},
    http::{ApiJson, IdPath},
    ids::parse_id,
    problem::{ApiResult, Problem},
    services::{Activity, Limit},
};

pub const SERVER_SECRET_HEADER: &str = "x-metallic-server-secret";
/// Requests per minute one host may send (agent heartbeats, per-server calls and one redeem per join).
const HOST_LIMIT: Limit = Limit::per_minute("host_requests", 3000);
/// Failed internal authentications per client address per minute before 429.
const AUTH_FAIL_LIMIT: Limit = Limit::per_minute("internal_auth_fail", 20);

/// The authenticated caller of an internal endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameServer {
    /// Deprecated shared secret: may only touch servers without a host.
    Legacy,
    /// A host token (`mht_`): may only touch this host's servers.
    Host(i64),
}

impl GameServer {
    /// Bind as `host_id IS NOT DISTINCT FROM $n`: NULL for legacy callers, the host id otherwise.
    pub fn scope(self) -> Option<i64> {
        match self {
            Self::Legacy => None,
            Self::Host(id) => Some(id),
        }
    }
}

fn unrecognised() -> Problem {
    Problem::new(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "Game server not recognised",
    )
}

impl FromRequestParts<AppState> for GameServer {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Problem> {
        let bearer = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));
        let caller = match bearer {
            Some(token) => super::hosts::authenticate(state, token)
                .await?
                .map(Self::Host),
            None => {
                let sent = parts
                    .headers
                    .get(SERVER_SECRET_HEADER)
                    .map(|v| v.as_bytes());
                match (&state.secrets.server_secret, sent) {
                    (Some(secret), Some(sent)) if ct_eq(sent, secret.as_bytes()) => {
                        Some(Self::Legacy)
                    }
                    _ => None,
                }
            }
        };
        match caller {
            Some(Self::Host(id)) => {
                crate::identity::auth::limit(state, HOST_LIMIT, &id.to_string()).await?;
                Ok(Self::Host(id))
            }
            Some(c) => Ok(c),
            None => {
                let key = crate::identity::auth::ip_key(state, parts);
                let d = state.limiter.hit(AUTH_FAIL_LIMIT, &key).await;
                Err(if d.allowed {
                    unrecognised()
                } else {
                    Problem::rate_limited(d.reset_secs)
                })
            }
        }
    }
}

fn id_field(field: &str, v: &Option<String>) -> ApiResult<i64> {
    v.as_deref()
        .and_then(parse_id)
        .ok_or_else(|| Problem::invalid(field, "invalid", "Not an id."))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    game_id: Option<String>,
    place_id: Option<String>,
    region: Option<String>,
    max_players: Option<i32>,
    #[serde(flatten)]
    connection: super::connection::ConnectionFields,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registered {
    server_id: String,
    heartbeat_interval_secs: i64,
}

/// `POST /internal/v1/servers` (per-process registration, kept for compatibility; host agents use the host
/// heartbeat). With a host token the server belongs to that host and must be in the host's region.
pub async fn register(
    State(state): State<AppState>,
    caller: GameServer,
    ApiJson(raw): ApiJson<serde_json::Value>,
) -> ApiResult<(StatusCode, Json<Registered>)> {
    // Deserialize sensitive fields without returning serde's input-bearing type error text.
    let req: RegisterRequest = serde_json::from_value(raw)
        .map_err(|_| Problem::bad_request("Registration fields are not valid."))?;
    let game_id = id_field("gameId", &req.game_id)?;
    let place_id = id_field("placeId", &req.place_id)?;
    let connection = req.connection.validate()?;
    let region = req
        .region
        .filter(|r| valid_region_code(r))
        .ok_or_else(|| Problem::invalid("region", "invalid", "Unknown region code."))?;
    let max_players = req
        .max_players
        .filter(|m| (1..=200).contains(m))
        .ok_or_else(|| Problem::invalid("maxPlayers", "out_of_range", "Use 1 to 200."))?;
    if !crate::games::place_in_game(&state.db, place_id, game_id).await? {
        return Err(Problem::invalid(
            "placeId",
            "not_found",
            "No such place in this game.",
        ));
    }
    let region_ok: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM matchmaker.regions WHERE code = $1 AND active)",
    )
    .bind(&region)
    .fetch_one(&state.db)
    .await?;
    if !region_ok {
        return Err(Problem::invalid(
            "region",
            "not_found",
            "Unknown region code.",
        ));
    }
    if let GameServer::Host(host) = caller {
        let host_region: String =
            sqlx::query_scalar("SELECT region FROM matchmaker.hosts WHERE id = $1")
                .bind(host)
                .fetch_one(&state.db)
                .await?;
        if host_region != region {
            return Err(Problem::invalid(
                "region",
                "mismatch",
                "Use the host's region.",
            ));
        }
    }
    let id = state.ids.next();
    sqlx::query("INSERT INTO matchmaker.servers (id, game_id, place_id, region, max_players, host, port, cert_sha256, protocol_major, engine_version, build_id, host_id) \
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)")
        .bind(id)
        .bind(game_id)
        .bind(place_id)
        .bind(&region)
        .bind(max_players)
        .bind(connection.as_ref().map(|c| c.host.as_str()))
        .bind(connection.as_ref().map(|c| c.port))
        .bind(connection.as_ref().map(|c| c.cert_sha256.as_str()))
        .bind(connection.as_ref().map(|c| c.protocol_major))
        .bind(connection.as_ref().map(|c| c.engine_version.as_str()))
        .bind(connection.as_ref().map(|c| c.build_id.as_str()))
        .bind(caller.scope())
        .execute(&state.db)
        .await?;
    tracing::info!(
        server_id = id,
        game_id,
        region = region.as_str(),
        "game server registered"
    );
    Ok((
        StatusCode::CREATED,
        Json(Registered {
            server_id: id.to_string(),
            heartbeat_interval_secs: HEARTBEAT_INTERVAL_SECS,
        }),
    ))
}

/// Parses an authoritative player list: ids, de-duplicated, at most `max` entries.
pub(super) fn player_ids(players: &[String], field: &str, max: usize) -> ApiResult<Vec<i64>> {
    if players.len() > max {
        return Err(Problem::invalid(field, "too_many", "Too many players."));
    }
    let mut ids: Vec<i64> = Vec::with_capacity(players.len());
    for p in players {
        let id = parse_id(p)
            .ok_or_else(|| Problem::invalid(field, "invalid", "Player ids must be ids."))?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    Ok(ids)
}

/// Result of applying one server report.
pub(super) enum Applied {
    /// Recorded; presence must be updated with these (game, joined/current players, left players).
    Recorded {
        game_id: i64,
        current: Vec<i64>,
        left: Vec<i64>,
    },
    /// No such server for this caller.
    Unknown,
    /// The server was already stopped.
    Stopped,
    /// More players than the server holds; nothing was written.
    TooMany,
}

/// Applies an authoritative player list to a locked server row: sessions start for joiners and end for leavers.
/// `status` is the stored status after the report (`starting`, `running` or `draining`).
#[allow(clippy::too_many_arguments)]
pub(super) async fn apply_report(
    conn: &mut PgConnection,
    state: &AppState,
    scope: Option<i64>,
    server_id: i64,
    ids: &[i64],
    joinable: bool,
    status: &str,
    tick_p99_ms: Option<f32>,
) -> ApiResult<Applied> {
    let row: Option<(i64, i32, Vec<i64>, String)> = sqlx::query_as(
        "SELECT game_id, max_players, player_ids, status FROM matchmaker.servers \
         WHERE id = $1 AND host_id IS NOT DISTINCT FROM $2 FOR UPDATE",
    )
    .bind(server_id)
    .bind(scope)
    .fetch_optional(&mut *conn)
    .await?;
    let Some((game_id, max_players, old, old_status)) = row else {
        return Ok(Applied::Unknown);
    };
    if old_status == "stopped" {
        return Ok(Applied::Stopped);
    }
    if ids.len() > max_players as usize {
        return Ok(Applied::TooMany);
    }
    let old_set: HashSet<i64> = old.iter().copied().collect();
    let new_set: HashSet<i64> = ids.iter().copied().collect();
    let joined: Vec<i64> = ids
        .iter()
        .copied()
        .filter(|p| !old_set.contains(p))
        .collect();
    let left: Vec<i64> = old
        .iter()
        .copied()
        .filter(|p| !new_set.contains(p))
        .collect();
    crate::games::start_sessions(&mut *conn, &state.ids, game_id, server_id, &joined).await?;
    crate::games::end_sessions(&mut *conn, game_id, server_id, &left).await?;
    sqlx::query(
        "UPDATE matchmaker.servers SET player_ids = $2, joinable = $3, status = $4, last_heartbeat_at = now(), \
         tick_p99_ms = coalesce($5, tick_p99_ms) WHERE id = $1",
    )
    .bind(server_id)
    .bind(ids)
    .bind(joinable)
    .bind(status)
    .bind(tick_p99_ms)
    .execute(&mut *conn)
    .await?;
    Ok(Applied::Recorded {
        game_id,
        current: ids.to_vec(),
        left,
    })
}

/// Presence after a committed report.
pub(super) async fn publish_presence(
    state: &AppState,
    server_id: i64,
    game_id: i64,
    current: &[i64],
    left: &[i64],
) {
    for user in current {
        state
            .presence
            .beat(*user, Activity::InGame { game_id, server_id })
            .await;
    }
    for user in left {
        state.presence.leave_game(*user, server_id).await;
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatRequest {
    players: Option<Vec<String>>,
    joinable: Option<bool>,
    status: Option<String>,
}

/// `POST /internal/v1/servers/{serverId}/heartbeat`: the authoritative player list. Joins open play sessions and
/// count visits; leaves close sessions and add the time to play history.
pub async fn heartbeat(
    State(state): State<AppState>,
    caller: GameServer,
    IdPath(server_id): IdPath,
    ApiJson(req): ApiJson<HeartbeatRequest>,
) -> ApiResult<StatusCode> {
    let ids = player_ids(&req.players.unwrap_or_default(), "players", 200)?;
    let status = match req.status.as_deref() {
        None | Some("running") => "running",
        Some("draining") => "draining",
        Some(_) => {
            return Err(Problem::invalid(
                "status",
                "invalid",
                "Use running or draining.",
            ));
        }
    };
    let mut tx = state.db.begin().await?;
    let applied = apply_report(
        &mut tx,
        &state,
        caller.scope(),
        server_id,
        &ids,
        req.joinable.unwrap_or(true),
        status,
        None,
    )
    .await?;
    match applied {
        Applied::Unknown => Err(Problem::not_found()),
        Applied::Stopped => Err(Problem::new(
            StatusCode::GONE,
            "server_stopped",
            "Server was stopped; register again",
        )),
        Applied::TooMany => Err(Problem::invalid(
            "players",
            "too_many",
            "More players than the server holds.",
        )),
        Applied::Recorded {
            game_id,
            current,
            left,
        } => {
            tx.commit().await?;
            publish_presence(&state, server_id, game_id, &current, &left).await;
            Ok(StatusCode::NO_CONTENT)
        }
    }
}

/// Stops a server and closes its sessions (also used by the stale-server job and host reports).
pub async fn stop_server(state: &AppState, server_id: i64) -> ApiResult<bool> {
    let mut tx = state.db.begin().await?;
    let row: Option<(i64, Vec<i64>)> = sqlx::query_as(
        "UPDATE matchmaker.servers SET status = 'stopped', stopped_at = now(), joinable = false \
         WHERE id = $1 AND status <> 'stopped' RETURNING game_id, player_ids",
    )
    .bind(server_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((game_id, players)) = row else {
        return Ok(false);
    };
    crate::games::end_sessions(&mut tx, game_id, server_id, &players).await?;
    sqlx::query("UPDATE matchmaker.servers SET player_ids = '{}' WHERE id = $1")
        .bind(server_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    for user in players {
        state.presence.leave_game(user, server_id).await;
    }
    Ok(true)
}

/// `POST /internal/v1/servers/{serverId}/stop`
pub async fn stop(
    State(state): State<AppState>,
    caller: GameServer,
    IdPath(server_id): IdPath,
) -> ApiResult<StatusCode> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM matchmaker.servers WHERE id = $1 AND host_id IS NOT DISTINCT FROM $2)",
    )
    .bind(server_id)
    .bind(caller.scope())
    .fetch_one(&state.db)
    .await?;
    if !exists {
        return Err(Problem::not_found());
    }
    stop_server(&state, server_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Stops servers that went silent (crash, network loss) or whose host did. Legacy servers: 60 s without a heartbeat.
/// Host servers: 60 s for an allocation the agent never reported, 120 s otherwise, or 120 s after the host itself
/// went silent or was disabled (spec 8.3 "Liveness"; they stop being joinable after 30 s). Returns how many.
pub async fn stop_stale_servers(state: &AppState) -> ApiResult<u64> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT s.id FROM matchmaker.servers s WHERE s.status <> 'stopped' AND ( \
           (s.host_id IS NULL AND s.last_heartbeat_at < now() - interval '60 seconds') \
           OR (s.host_id IS NOT NULL AND s.status = 'starting' AND s.last_heartbeat_at < now() - interval '60 seconds') \
           OR (s.host_id IS NOT NULL AND s.last_heartbeat_at < now() - interval '120 seconds') \
           OR EXISTS (SELECT 1 FROM matchmaker.hosts h WHERE h.id = s.host_id AND (h.status = 'disabled' \
              OR h.last_seen_at IS NULL AND s.started_at < now() - interval '120 seconds' \
              OR h.last_seen_at < now() - interval '120 seconds'))) \
         LIMIT 500",
    )
    .fetch_all(&state.db)
    .await?;
    let mut n = 0;
    for id in ids {
        if stop_server(state, id).await? {
            n += 1;
        }
    }
    Ok(n)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedeemRequest {
    ticket: Option<String>,
    server_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Redeemed {
    user_id: String,
    username: String,
    display_name: String,
    game_id: String,
    place_id: String,
    age_band: &'static str,
    party_id: Option<String>,
    kind: String,
    can_edit: bool,
    chat_allowed: bool,
    voice_allowed: bool,
    account_status: String,
}

/// A ticket string as any endpoint accepts it: the signed form (`mjt1.`) or a legacy opaque `jt_` ticket.
pub fn ticket_text_ok(text: &str) -> bool {
    let body = |rest: &str, dots: bool| {
        !rest.is_empty()
            && rest.bytes().all(|c| {
                c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-') || (dots && c == b'.')
            })
    };
    (4..=super::ticket::MAX_TICKET_LEN).contains(&text.len())
        && (text.strip_prefix("jt_").is_some_and(|r| body(r, false))
            || text
                .strip_prefix(super::ticket::TICKET_PREFIX)
                .is_some_and(|r| body(r, true) && r.matches('.').count() == 1))
}

/// Game permissions for the admitting server. Fail closed: chat and voice need 13+, a verified active account and
/// the policy switch (off until age assurance ships). Lead review required (CLAUDE.md "Children").
pub fn game_permissions(state: &AppState, user: &crate::identity::UserBasic) -> (bool, bool) {
    use crate::identity::AgeBand;
    let eligible = matches!(
        user.band(),
        AgeBand::Age13To15 | AgeBand::Age16To17 | AgeBand::Adult
    ) && user.is_verified()
        && user.status == "active";
    let policy = &state.config.policy;
    (
        eligible && policy.game_chat_enabled,
        eligible && policy.game_voice_enabled,
    )
}

/// `POST /internal/v1/join-tickets/redeem`: single use, bound to user, place and server. The host agent calls it
/// for each join and refuses the join without an answer within 3 s, so every lookup here is by primary key.
pub async fn redeem(
    State(state): State<AppState>,
    caller: GameServer,
    ApiJson(req): ApiJson<RedeemRequest>,
) -> ApiResult<Json<Redeemed>> {
    let ticket = req
        .ticket
        .filter(|t| ticket_text_ok(t))
        .ok_or_else(|| Problem::invalid("ticket", "invalid", "Not a ticket."))?;
    let server_id = id_field("serverId", &req.server_id)?;
    let invalid = || {
        Problem::new(
            StatusCode::GONE,
            "ticket_invalid",
            "Ticket expired or already used",
        )
    };
    let mut tx = state.db.begin().await?;
    let hash = token_hash(&ticket);
    let row: Option<(i64, i64, i64, Option<i64>, String)> = sqlx::query_as(
        "SELECT user_id, game_id, place_id, server_id, kind FROM matchmaker.join_tickets \
         WHERE ticket_hash = $1 AND redeemed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE",
    )
    .bind(&hash)
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, game_id, place_id, bound, kind) = row.ok_or_else(invalid)?;
    if !super::connection::current_ticket(&mut tx, &hash, user_id).await? {
        return Err(invalid());
    }
    let server: Option<(i64, i64)> = sqlx::query_as(
        "SELECT game_id, place_id FROM matchmaker.servers WHERE id = $1 AND status <> 'stopped' \
         AND host_id IS NOT DISTINCT FROM $2",
    )
    .bind(server_id)
    .bind(caller.scope())
    .fetch_optional(&mut *tx)
    .await?;
    let wrong = || Problem::conflict("ticket_wrong_server", "Ticket is for another server");
    match (server, bound) {
        (Some((g, p)), b) if g == game_id && p == place_id && b.is_none_or(|b| b == server_id) => {}
        _ => return Err(wrong()),
    }
    let redeemed = sqlx::query(
        "UPDATE matchmaker.join_tickets SET redeemed_at = clock_timestamp(), server_id = $2 \
        WHERE ticket_hash = $1 AND redeemed_at IS NULL AND expires_at > clock_timestamp()",
    )
    .bind(&hash)
    .bind(server_id)
    .execute(&mut *tx)
    .await?;
    if redeemed.rows_affected() != 1 {
        return Err(invalid());
    }
    tx.commit().await?;
    let user = crate::identity::basic(&state.db, user_id)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(invalid)?;
    let age_band = user.band().as_str();
    let (chat_allowed, voice_allowed) = game_permissions(&state, &user);
    Ok(Json(Redeemed {
        user_id: user_id.to_string(),
        username: user.username,
        display_name: user.display_name,
        game_id: game_id.to_string(),
        place_id: place_id.to_string(),
        age_band,
        party_id: None,
        // Edit tickets (M2c) are not issued yet; only an edit ticket could ever carry edit rights.
        can_edit: false,
        kind,
        chat_allowed,
        voice_allowed,
        account_status: user.status,
    }))
}

#[cfg(test)]
mod tests {
    use super::ticket_text_ok;

    #[test]
    fn ticket_text_shapes() {
        assert!(ticket_text_ok("jt_abcDEF-_1"));
        assert!(ticket_text_ok("mjt1.abc.def"));
        for bad in [
            "",
            "jt_",
            "mjt1.",
            "mjt1.abc",
            "mjt1.a.b.c",
            "jt_a.b",
            "jt_a b",
            "xx_abc",
            &format!("jt_{}", "a".repeat(510)),
        ] {
            assert!(!ticket_text_ok(bad), "{bad:?}");
        }
    }
}
