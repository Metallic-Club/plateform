//! Internal endpoints for `metallic-server` processes: register, heartbeat (every 5 s with the player list), stop,
//! and redeem a join ticket. Authenticated with the shared secret from `METALLIC_SERVER_SECRET`, compared in constant
//! time. Not for browsers or players; the edge should not route `/internal/` from the internet at all.

use std::collections::HashSet;

use axum::{
    Json,
    extract::{FromRequestParts, State},
    http::{StatusCode, request::Parts},
};
use serde::{Deserialize, Serialize};

use super::{HEARTBEAT_INTERVAL_SECS, valid_region_code};
use crate::{
    AppState,
    crypto::{ct_eq, token_hash},
    http::{ApiJson, IdPath},
    ids::parse_id,
    problem::{ApiResult, Problem},
    services::Activity,
};

pub const SERVER_SECRET_HEADER: &str = "x-metallic-server-secret";

/// A request from a game server (shared secret checked).
pub struct GameServer;

impl FromRequestParts<AppState> for GameServer {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Problem> {
        let sent = parts
            .headers
            .get(SERVER_SECRET_HEADER)
            .map(|v| v.as_bytes())
            .unwrap_or_default();
        if ct_eq(sent, state.secrets.server_secret.as_bytes()) {
            Ok(Self)
        } else {
            Err(Problem::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Game server not recognised",
            ))
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registered {
    server_id: String,
    heartbeat_interval_secs: i64,
}

/// `POST /internal/v1/servers`
pub async fn register(
    State(state): State<AppState>,
    _: GameServer,
    ApiJson(req): ApiJson<RegisterRequest>,
) -> ApiResult<(StatusCode, Json<Registered>)> {
    let game_id = id_field("gameId", &req.game_id)?;
    let place_id = id_field("placeId", &req.place_id)?;
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
    let id = state.ids.next();
    sqlx::query("INSERT INTO matchmaker.servers (id, game_id, place_id, region, max_players) VALUES ($1, $2, $3, $4, $5)")
        .bind(id)
        .bind(game_id)
        .bind(place_id)
        .bind(&region)
        .bind(max_players)
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
    _: GameServer,
    IdPath(server_id): IdPath,
    ApiJson(req): ApiJson<HeartbeatRequest>,
) -> ApiResult<StatusCode> {
    let players = req.players.unwrap_or_default();
    if players.len() > 200 {
        return Err(Problem::invalid(
            "players",
            "too_many",
            "At most 200 players.",
        ));
    }
    let mut ids: Vec<i64> = Vec::with_capacity(players.len());
    for p in &players {
        let id = parse_id(p)
            .ok_or_else(|| Problem::invalid("players", "invalid", "Player ids must be ids."))?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
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
    let row: Option<(i64, i32, Vec<i64>, String)> = sqlx::query_as(
        "SELECT game_id, max_players, player_ids, status FROM matchmaker.servers WHERE id = $1 FOR UPDATE",
    )
    .bind(server_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((game_id, max_players, old, old_status)) = row else {
        return Err(Problem::not_found());
    };
    if old_status == "stopped" {
        return Err(Problem::new(
            StatusCode::GONE,
            "server_stopped",
            "Server was stopped; register again",
        ));
    }
    if ids.len() > max_players as usize {
        return Err(Problem::invalid(
            "players",
            "too_many",
            "More players than the server holds.",
        ));
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

    crate::games::start_sessions(&mut tx, &state.ids, game_id, server_id, &joined).await?;
    crate::games::end_sessions(&mut tx, game_id, server_id, &left).await?;
    sqlx::query(
        "UPDATE matchmaker.servers SET player_ids = $2, joinable = $3, status = $4, last_heartbeat_at = now() WHERE id = $1",
    )
    .bind(server_id)
    .bind(&ids)
    .bind(req.joinable.unwrap_or(true))
    .bind(status)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    for user in &ids {
        state
            .presence
            .beat(*user, Activity::InGame { game_id, server_id })
            .await;
    }
    for user in &left {
        state.presence.leave_game(*user, server_id).await;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Stops a server and closes its sessions (also used by the stale-server job).
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
    _: GameServer,
    IdPath(server_id): IdPath,
) -> ApiResult<StatusCode> {
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM matchmaker.servers WHERE id = $1)")
            .bind(server_id)
            .fetch_one(&state.db)
            .await?;
    if !exists {
        return Err(Problem::not_found());
    }
    stop_server(&state, server_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Stops servers that stopped sending heartbeats (crash, network loss). Returns how many.
pub async fn stop_stale_servers(state: &AppState) -> ApiResult<u64> {
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM matchmaker.servers WHERE status <> 'stopped' AND last_heartbeat_at < now() - interval '60 seconds' LIMIT 500",
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
}

/// `POST /internal/v1/join-tickets/redeem`: single use, bound to user, place and server.
pub async fn redeem(
    State(state): State<AppState>,
    _: GameServer,
    ApiJson(req): ApiJson<RedeemRequest>,
) -> ApiResult<Json<Redeemed>> {
    let ticket = req
        .ticket
        .filter(|t| t.starts_with("jt_") && t.len() <= 128)
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
    let row: Option<(i64, i64, i64, Option<i64>)> = sqlx::query_as(
        "SELECT user_id, game_id, place_id, server_id FROM matchmaker.join_tickets \
         WHERE ticket_hash = $1 AND redeemed_at IS NULL AND expires_at > now() FOR UPDATE",
    )
    .bind(token_hash(&ticket))
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, game_id, place_id, bound) = row.ok_or_else(invalid)?;
    let server: Option<(i64, i64)> = sqlx::query_as(
        "SELECT game_id, place_id FROM matchmaker.servers WHERE id = $1 AND status <> 'stopped'",
    )
    .bind(server_id)
    .fetch_optional(&mut *tx)
    .await?;
    let wrong = || Problem::conflict("ticket_wrong_server", "Ticket is for another server");
    match (server, bound) {
        (Some((g, p)), b) if g == game_id && p == place_id && b.is_none_or(|b| b == server_id) => {}
        _ => return Err(wrong()),
    }
    sqlx::query("UPDATE matchmaker.join_tickets SET redeemed_at = now(), server_id = $2 WHERE ticket_hash = $1")
        .bind(token_hash(&ticket))
        .bind(server_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let user = crate::identity::basic(&state.db, user_id)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(invalid)?;
    Ok(Json(Redeemed {
        user_id: user_id.to_string(),
        username: user.username,
        display_name: user.display_name,
        game_id: game_id.to_string(),
        place_id: place_id.to_string(),
    }))
}
