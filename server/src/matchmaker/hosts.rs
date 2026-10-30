//! Hosts and their agents (multiplayer spec section 8.3). A host is one machine running `metallic-host` (the agent),
//! `metallic-edge` and `metallic-server` containers. The agent is the only process with a backend credential: a
//! `mht_` bearer token, stored here only as a SHA-256 hash. Everything is host-initiated HTTPS: the backend never
//! connects to a host; what it wants (start, drain, stop, rotate the token) rides back on heartbeat responses.
//!
//! Host addresses and tokens never appear in logs, errors or public lists.

use axum::{
    Json,
    extract::State,
    http::{StatusCode, header, request::Parts},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::OffsetDateTime;

use super::internal::{
    Applied, GameServer, apply_report, player_ids, publish_presence, stop_server,
};
use crate::{
    AppState,
    crypto::{new_token, token_hash},
    http::{ApiJson, IdPath, client_ip, rfc3339},
    ids::{IdGenerator, parse_id},
    problem::{ApiResult, Problem},
};

pub const TOKEN_PREFIX: &str = "mht_";
/// Seconds between agent heartbeats.
pub const HOST_HEARTBEAT_SECS: i64 = 5;
/// A host silent this long makes its servers unjoinable (stopped after 120 s by the stale job).
pub const HOST_LIVE_SECS: i64 = 30;
/// How long the previous token keeps working after a rotation.
const PREVIOUS_TOKEN_MINUTES: i64 = 10;
/// Seconds a draining server gets to finish before the agent force-stops it.
const DRAIN_DEADLINE_SECS: i64 = 300;
/// A host's server list per heartbeat (and players across them) is bounded so the body stays under 64 KiB.
const MAX_REPORTED_SERVERS: usize = 100;
const MAX_REPORTED_PLAYERS: usize = 2000;

/// Looks up a host by bearer token (current, or previous within 10 minutes of a rotation) and records that the host
/// was seen. `None` for anything else, including disabled hosts; callers answer one uniform 401.
pub async fn authenticate(state: &AppState, token: &str) -> ApiResult<Option<i64>> {
    let shaped = token.len() == TOKEN_PREFIX.len() + 43
        && token.starts_with(TOKEN_PREFIX)
        && token.as_bytes()[TOKEN_PREFIX.len()..]
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'));
    if !shaped {
        return Ok(None);
    }
    // Lookup by the SHA-256 of a 256-bit random token: an equality probe on a hash leaks nothing useful.
    Ok(sqlx::query_scalar(
        "UPDATE matchmaker.hosts SET last_seen_at = now() WHERE status <> 'disabled' AND (token_hash = $1 \
         OR (prev_token_hash = $1 AND prev_token_expires_at > now())) RETURNING id",
    )
    .bind(token_hash(token))
    .fetch_optional(&state.db)
    .await?)
}

fn host_token_needed() -> Problem {
    Problem::new(
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "Game server not recognised",
    )
    .with_detail("Host endpoints need a host token.")
}

fn host_of(caller: GameServer, path_id: i64) -> ApiResult<i64> {
    match caller {
        // A host may only address itself; another id looks like an unknown resource.
        GameServer::Host(id) if id == path_id => Ok(id),
        GameServer::Host(_) => Err(Problem::not_found()),
        GameServer::Legacy => Err(host_token_needed()),
    }
}

fn label(text: &str, max: usize) -> bool {
    !text.is_empty()
        && text.len() <= max
        && text.as_bytes()[0].is_ascii_alphanumeric()
        && text
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-' | b'+'))
}

fn cert(field: &'static str, v: &str) -> ApiResult<String> {
    if v.len() == 64 && v.bytes().all(|c| c.is_ascii_hexdigit()) {
        Ok(v.to_ascii_lowercase())
    } else {
        Err(Problem::invalid(
            field,
            "invalid",
            "Use 64 hexadecimal digits.",
        ))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capacity {
    cores: i32,
    #[serde(rename = "memoryMiB")]
    memory_mib: i64,
    max_servers: i32,
    max_players: i32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EdgeFacts {
    port: i32,
    cert_sha256: String,
    #[serde(default)]
    cert_sha256_next: Option<String>,
    #[serde(default)]
    public_host: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HostRegisterRequest {
    region: String,
    agent_version: String,
    engine_version: String,
    protocol_major: i32,
    engine_builds: Vec<String>,
    capacity: Capacity,
    edge: EdgeFacts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostRegistered {
    host_id: String,
    heartbeat_interval_secs: i64,
    observed_address: String,
}

/// `POST /internal/v1/hosts/register`: the agent announces capacity and its edge. The edge address handed to players
/// is the agent's public IPv4 as this request arrives (or `publicHost` in the relay phase).
pub async fn register_host(
    State(state): State<AppState>,
    caller: GameServer,
    parts: Parts,
    ApiJson(raw): ApiJson<serde_json::Value>,
) -> ApiResult<Response> {
    let GameServer::Host(host) = caller else {
        return Err(host_token_needed());
    };
    let req: HostRegisterRequest = serde_json::from_value(raw)
        .map_err(|_| Problem::bad_request("Host registration fields are not valid."))?;
    let region: String = sqlx::query_scalar("SELECT region FROM matchmaker.hosts WHERE id = $1")
        .bind(host)
        .fetch_one(&state.db)
        .await?;
    if req.region != region {
        return Err(Problem::invalid(
            "region",
            "mismatch",
            "Use the host's region.",
        ));
    }
    if !label(&req.agent_version, 64) {
        return Err(Problem::invalid(
            "agentVersion",
            "invalid",
            "Invalid version label.",
        ));
    }
    if !label(&req.engine_version, 64) {
        return Err(Problem::invalid(
            "engineVersion",
            "invalid",
            "Invalid version label.",
        ));
    }
    if req.protocol_major <= 0 {
        return Err(Problem::invalid(
            "protocolMajor",
            "invalid",
            "Use a positive number.",
        ));
    }
    if req.engine_builds.is_empty()
        || req.engine_builds.len() > 16
        || !req
            .engine_builds
            .iter()
            .all(|b| label(b, 128) && !b.contains('+'))
    {
        return Err(Problem::invalid(
            "engineBuilds",
            "invalid",
            "1 to 16 build ids.",
        ));
    }
    let c = &req.capacity;
    if !(1..=4096).contains(&c.cores)
        || !(1..=67_108_864).contains(&c.memory_mib)
        || !(1..=1000).contains(&c.max_servers)
        || !(1..=100_000).contains(&c.max_players)
    {
        return Err(Problem::invalid(
            "capacity",
            "out_of_range",
            "Capacity out of range.",
        ));
    }
    let edge = &req.edge;
    if !(1..=65535).contains(&edge.port) {
        return Err(Problem::invalid("edge.port", "invalid", "Use 1 to 65535."));
    }
    let edge_cert = cert("edge.certSha256", &edge.cert_sha256)?;
    let edge_next = edge
        .cert_sha256_next
        .as_deref()
        .map(|v| cert("edge.certSha256Next", v))
        .transpose()?;
    let public_host = edge
        .public_host
        .as_deref()
        .map(|h| {
            super::connection::normalize_host(h)
                .ok_or_else(|| Problem::invalid("edge.publicHost", "invalid", "Invalid host."))
        })
        .transpose()?;
    let observed = client_ip(&parts, &state).0.to_string();
    sqlx::query(
        "UPDATE matchmaker.hosts SET registered_at = now(), last_seen_at = now(), agent_version = $2, \
         engine_version = $3, protocol_major = $4, engine_builds = $5, cap_cores = $6, cap_memory_mib = $7, \
         cap_servers = $8, cap_players = $9, edge_port = $10, edge_cert_sha256 = $11, edge_cert_sha256_next = $12, \
         public_host = $13, observed_address = $14 WHERE id = $1",
    )
    .bind(host)
    .bind(&req.agent_version)
    .bind(&req.engine_version)
    .bind(req.protocol_major)
    .bind(&req.engine_builds)
    .bind(c.cores)
    .bind(c.memory_mib)
    .bind(c.max_servers)
    .bind(c.max_players)
    .bind(edge.port)
    .bind(&edge_cert)
    .bind(&edge_next)
    .bind(&public_host)
    .bind(&observed)
    .execute(&state.db)
    .await?;
    tracing::info!(host_id = host, "host agent registered");
    Ok((
        StatusCode::CREATED,
        [(header::CACHE_CONTROL, "no-store")],
        Json(HostRegistered {
            host_id: host.to_string(),
            heartbeat_interval_secs: HOST_HEARTBEAT_SECS,
            observed_address: observed,
        }),
    )
        .into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Load {
    cpu: f32,
    #[serde(rename = "memoryMiB")]
    memory_mib: i64,
    up_mbps: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EdgeCerts {
    cert_sha256: String,
    #[serde(default)]
    cert_sha256_next: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServerReport {
    server_id: String,
    kind: String,
    status: String,
    players: Vec<String>,
    joinable: bool,
    #[serde(default)]
    tick_p99_ms: Option<f32>,
    #[serde(default)]
    exit_code: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HostHeartbeatRequest {
    load: Load,
    edge: EdgeCerts,
    servers: Vec<ServerReport>,
}

/// One order for the agent. `start` carries what the agent needs to start a server with the given id.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Order {
    #[serde(rename_all = "camelCase")]
    Start {
        server_id: String,
        game_id: String,
        place_id: String,
        place_version_id: Option<String>,
        asset_hash: Option<String>,
        max_players: i32,
        kind: String,
        region: String,
    },
    #[serde(rename_all = "camelCase")]
    Drain {
        server_id: String,
        reason: &'static str,
        deadline_secs: i64,
    },
    #[serde(rename_all = "camelCase")]
    Stop {
        server_id: String,
    },
    RotateToken,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostHeartbeatResponse {
    orders: Vec<Order>,
    keys_version: String,
    next_heartbeat_secs: i64,
}

/// `POST /internal/v1/hosts/{hostId}/heartbeat`: load, edge certificates and every server's state. The response
/// carries the orders; this is the only path by which the backend asks a host to do anything.
pub async fn heartbeat_host(
    State(state): State<AppState>,
    caller: GameServer,
    parts: Parts,
    IdPath(path_id): IdPath,
    ApiJson(raw): ApiJson<serde_json::Value>,
) -> ApiResult<Response> {
    let host = host_of(caller, path_id)?;
    let req: HostHeartbeatRequest = serde_json::from_value(raw)
        .map_err(|_| Problem::bad_request("Heartbeat fields are not valid."))?;
    let l = &req.load;
    if !(l.cpu.is_finite() && (0.0..=100.0).contains(&l.cpu))
        || l.memory_mib < 0
        || !(l.up_mbps.is_finite() && l.up_mbps >= 0.0)
    {
        return Err(Problem::invalid(
            "load",
            "out_of_range",
            "Load out of range.",
        ));
    }
    let edge_cert = cert("edge.certSha256", &req.edge.cert_sha256)?;
    let edge_next = req
        .edge
        .cert_sha256_next
        .as_deref()
        .map(|v| cert("edge.certSha256Next", v))
        .transpose()?;
    if req.servers.len() > MAX_REPORTED_SERVERS {
        return Err(Problem::invalid(
            "servers",
            "too_many",
            "At most 100 servers.",
        ));
    }
    // Validate every report before writing anything.
    let mut reports = Vec::with_capacity(req.servers.len());
    let mut total_players = 0;
    for r in &req.servers {
        let id = parse_id(&r.server_id)
            .ok_or_else(|| Problem::invalid("servers.serverId", "invalid", "Not an id."))?;
        if super::ticket::Kind::parse(&r.kind).is_none() {
            return Err(Problem::invalid(
                "servers.kind",
                "invalid",
                "Use play, edit or test.",
            ));
        }
        let status = match r.status.as_str() {
            "starting" => "starting",
            "ready" => "running",
            "draining" => "draining",
            "stopped" => "stopped",
            _ => {
                return Err(Problem::invalid(
                    "servers.status",
                    "invalid",
                    "Use starting, ready, draining or stopped.",
                ));
            }
        };
        if r.tick_p99_ms.is_some_and(|t| !t.is_finite() || t < 0.0) {
            return Err(Problem::invalid(
                "servers.tickP99Ms",
                "invalid",
                "Not a duration.",
            ));
        }
        let ids = player_ids(&r.players, "servers.players", 200)?;
        total_players += ids.len();
        reports.push((id, status, ids, r));
    }
    if total_players > MAX_REPORTED_PLAYERS {
        return Err(Problem::invalid("servers", "too_many", "Too many players."));
    }
    let registered: Option<Option<OffsetDateTime>> =
        sqlx::query_scalar("SELECT registered_at FROM matchmaker.hosts WHERE id = $1")
            .bind(host)
            .fetch_optional(&state.db)
            .await?;
    if registered.flatten().is_none() {
        return Err(Problem::new(
            StatusCode::GONE,
            "host_not_registered",
            "Register the host first",
        ));
    }
    let observed = client_ip(&parts, &state).0.to_string();
    sqlx::query(
        "UPDATE matchmaker.hosts SET last_seen_at = now(), load_cpu = $2, load_memory_mib = $3, load_up_mbps = $4, \
         edge_cert_sha256 = $5, edge_cert_sha256_next = $6, observed_address = $7 WHERE id = $1",
    )
    .bind(host)
    .bind(l.cpu)
    .bind(l.memory_mib)
    .bind(l.up_mbps)
    .bind(&edge_cert)
    .bind(&edge_next)
    .bind(&observed)
    .execute(&state.db)
    .await?;

    let mut orders = Vec::new();
    let mut reported = std::collections::HashSet::new();
    for (server_id, status, ids, r) in reports {
        reported.insert(server_id);
        if status == "stopped" {
            let owned: bool = sqlx::query_scalar(
                "UPDATE matchmaker.servers SET exit_code = $3 WHERE id = $1 AND host_id = $2 RETURNING true",
            )
            .bind(server_id)
            .bind(host)
            .bind(r.exit_code)
            .fetch_optional(&state.db)
            .await?
            .unwrap_or(false);
            if owned {
                stop_server(&state, server_id).await?;
            }
            continue;
        }
        let mut tx = state.db.begin().await?;
        // A server the backend allocated stays `starting` until the agent says `ready`.
        let applied = apply_report(
            &mut tx,
            &state,
            Some(host),
            server_id,
            &ids,
            r.joinable && status == "running",
            status,
            r.tick_p99_ms,
        )
        .await?;
        match applied {
            Applied::Recorded {
                game_id,
                current,
                left,
            } => {
                tx.commit().await?;
                publish_presence(&state, server_id, game_id, &current, &left).await;
            }
            // Unknown to this host, already stopped, or an impossible player list: the agent should stop it.
            Applied::Unknown | Applied::Stopped | Applied::TooMany => {
                drop(tx);
                orders.push(Order::Stop {
                    server_id: server_id.to_string(),
                });
            }
        }
    }
    orders.extend(pending_orders(&state.db, host, &reported).await?);
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(HostHeartbeatResponse {
            orders,
            keys_version: state.secrets.ticket_keys.version().to_owned(),
            next_heartbeat_secs: HOST_HEARTBEAT_SECS,
        }),
    )
        .into_response())
}

type OrderRow = (
    i64,
    i64,
    i64,
    Option<i64>,
    i32,
    String,
    String,
    String,
    i32,
    String,
    String,
);

/// Orders derived from what the backend wants versus what the host runs.
pub async fn pending_orders(
    db: &PgPool,
    host: i64,
    reported: &std::collections::HashSet<i64>,
) -> ApiResult<Vec<Order>> {
    let rows: Vec<OrderRow> = sqlx::query_as(
        "SELECT s.id, s.game_id, s.place_id, p.live_version_id, s.max_players, s.kind, s.region, s.status, \
         cardinality(s.player_ids), s.desired, h.status FROM matchmaker.servers s \
         JOIN matchmaker.hosts h ON h.id = s.host_id LEFT JOIN games.places p ON p.id = s.place_id \
         WHERE s.host_id = $1 AND s.status <> 'stopped' ORDER BY s.id LIMIT 1000",
    )
    .bind(host)
    .fetch_all(db)
    .await?;
    let mut orders = Vec::new();
    for (id, game, place, version, max, kind, region, status, players, desired, host_status) in rows
    {
        let server_id = id.to_string();
        let drain_reason = match (desired.as_str(), host_status.as_str()) {
            (_, "draining") => Some("host_draining"),
            ("drain", _) => Some("admin"),
            _ => None,
        };
        if desired == "stop" || (status == "starting" && drain_reason.is_some()) {
            orders.push(Order::Stop { server_id });
        } else if status == "starting" && !reported.contains(&id) {
            // Repeated on every heartbeat until the agent reports the server; starting is idempotent by id.
            orders.push(Order::Start {
                server_id,
                game_id: game.to_string(),
                place_id: place.to_string(),
                place_version_id: version.map(|v| v.to_string()),
                asset_hash: None,
                max_players: max,
                kind,
                region,
            });
        } else if status == "draining" && players == 0 {
            // Drained: it stops when empty.
            orders.push(Order::Stop { server_id });
        } else if let Some(reason) = drain_reason {
            orders.push(Order::Drain {
                server_id,
                reason,
                deadline_secs: DRAIN_DEADLINE_SECS,
            });
        }
    }
    let rotate: bool =
        sqlx::query_scalar("SELECT rotate_requested FROM matchmaker.hosts WHERE id = $1")
            .bind(host)
            .fetch_one(db)
            .await?;
    if rotate {
        orders.push(Order::RotateToken);
    }
    Ok(orders)
}

#[derive(Serialize)]
struct Rotated {
    token: String,
}

/// `POST /internal/v1/hosts/{hostId}/token/rotate`: a new token, returned once. The previous one keeps working for
/// 10 minutes so the agent can persist the new one first.
pub async fn rotate_host_token(
    State(state): State<AppState>,
    caller: GameServer,
    IdPath(path_id): IdPath,
) -> ApiResult<Response> {
    let host = host_of(caller, path_id)?;
    let token = new_token(TOKEN_PREFIX);
    sqlx::query(
        "UPDATE matchmaker.hosts SET prev_token_hash = token_hash, \
         prev_token_expires_at = now() + make_interval(mins => $3), token_hash = $2, rotate_requested = false \
         WHERE id = $1",
    )
    .bind(host)
    .bind(token_hash(&token))
    .bind(PREVIOUS_TOKEN_MINUTES as i32)
    .execute(&state.db)
    .await?;
    tracing::info!(host_id = host, "host token rotated");
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(Rotated { token }),
    )
        .into_response())
}

// ------------------------------------------------------------------ admin (CLI)

/// A host row for `metallic-platform host list`: no token, no address.
#[derive(Debug, sqlx::FromRow)]
pub struct HostSummary {
    pub id: i64,
    pub name: String,
    pub region: String,
    pub status: String,
    pub max_servers: i32,
    pub max_players: i32,
    pub last_seen_at: Option<OffsetDateTime>,
    pub servers: i64,
    pub players: i64,
}

impl HostSummary {
    pub fn line(&self) -> String {
        format!(
            "{}  {}  {}  {}  servers {}/{}  players {}/{}  last seen {}",
            self.id,
            self.name,
            self.region,
            self.status,
            self.servers,
            self.max_servers,
            self.players,
            self.max_players,
            self.last_seen_at.map_or("never".to_owned(), rfc3339)
        )
    }
}

fn host_name_ok(name: &str) -> bool {
    (1..=63).contains(&name.len())
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// Creates a host and returns `(id, token)`. The token is shown once and stored only as a hash.
pub async fn add_host(
    db: &PgPool,
    ids: &IdGenerator,
    name: &str,
    region: &str,
    max_servers: i32,
    max_players: i32,
) -> Result<(i64, String), String> {
    if !host_name_ok(name) {
        return Err("name: 1 to 63 of a-z 0-9 -, starting with a letter or digit".to_owned());
    }
    if !(1..=1000).contains(&max_servers) || !(1..=100_000).contains(&max_players) {
        return Err("max servers 1-1000, max players 1-100000".to_owned());
    }
    let region_ok: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM matchmaker.regions WHERE code = $1 AND active)",
    )
    .bind(region)
    .fetch_one(db)
    .await
    .map_err(|e| e.to_string())?;
    if !region_ok {
        return Err("unknown or inactive region".to_owned());
    }
    let id = ids.next();
    let token = new_token(TOKEN_PREFIX);
    sqlx::query(
        "INSERT INTO matchmaker.hosts (id, name, region, token_hash, max_servers, max_players) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(name)
    .bind(region)
    .bind(token_hash(&token))
    .bind(max_servers)
    .bind(max_players)
    .execute(db)
    .await
    .map_err(|e| match e.as_database_error().and_then(|d| d.code()) {
        Some(c) if c == "23505" => "a host with that name exists".to_owned(),
        _ => "could not create the host".to_owned(),
    })?;
    Ok((id, token))
}

pub async fn list_hosts(db: &PgPool) -> Result<Vec<HostSummary>, String> {
    sqlx::query_as(
        "SELECT h.id, h.name, h.region, h.status, h.max_servers, h.max_players, h.last_seen_at, \
         count(s.id) AS servers, coalesce(sum(cardinality(s.player_ids)), 0)::bigint AS players \
         FROM matchmaker.hosts h LEFT JOIN matchmaker.servers s ON s.host_id = h.id AND s.status <> 'stopped' \
         GROUP BY h.id ORDER BY h.name",
    )
    .fetch_all(db)
    .await
    .map_err(|e| e.to_string())
}

/// Sets a host's status (`active`, `draining`, `disabled`). Draining: no new allocations, drain orders for its
/// servers. Disabled: its token stops working and its servers are stopped by the stale job.
pub async fn set_host_status(db: &PgPool, name: &str, status: &str) -> Result<(), String> {
    if !matches!(status, "active" | "draining" | "disabled") {
        return Err("status must be active, draining or disabled".to_owned());
    }
    let n = sqlx::query("UPDATE matchmaker.hosts SET status = $2 WHERE name = $1")
        .bind(name)
        .bind(status)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();
    if n == 1 {
        Ok(())
    } else {
        Err("no such host".to_owned())
    }
}

/// Asks the agent to rotate its token on its next heartbeat (`rotateToken` order).
pub async fn request_rotation(db: &PgPool, name: &str) -> Result<(), String> {
    let n = sqlx::query("UPDATE matchmaker.hosts SET rotate_requested = true WHERE name = $1")
        .bind(name)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();
    if n == 1 {
        Ok(())
    } else {
        Err("no such host".to_owned())
    }
}

/// Replaces a lost or leaked token at once (the old one stops working immediately). Returns the new token.
pub async fn reset_token(db: &PgPool, name: &str) -> Result<String, String> {
    let token = new_token(TOKEN_PREFIX);
    let n = sqlx::query(
        "UPDATE matchmaker.hosts SET token_hash = $2, prev_token_hash = NULL, prev_token_expires_at = NULL, \
         rotate_requested = false WHERE name = $1",
    )
    .bind(name)
    .bind(token_hash(&token))
    .execute(db)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();
    if n == 1 {
        Ok(token)
    } else {
        Err("no such host".to_owned())
    }
}

/// Sets what the backend wants from one server: `drain` (no new players, stop when empty) or `stop`.
pub async fn set_server_desired(db: &PgPool, server_id: i64, desired: &str) -> Result<(), String> {
    if !matches!(desired, "drain" | "stop") {
        return Err("use drain or stop".to_owned());
    }
    let n = sqlx::query(
        "UPDATE matchmaker.servers SET desired = $2 WHERE id = $1 AND status <> 'stopped' \
         AND (desired = 'run' OR $2 = 'stop')",
    )
    .bind(server_id)
    .bind(desired)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();
    if n == 1 {
        Ok(())
    } else {
        Err("no such running server".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_names() {
        assert!(host_name_ok("home-1"));
        assert!(!host_name_ok("Home"));
        assert!(!host_name_ok("-x"));
        assert!(!host_name_ok(""));
    }

    #[test]
    fn orders_serialize_with_a_type_tag() {
        let v = serde_json::to_value(Order::Drain {
            server_id: "1".into(),
            reason: "admin",
            deadline_secs: 300,
        })
        .unwrap_or_default();
        assert_eq!(v["type"], "drain");
        assert_eq!(v["deadlineSecs"], 300);
        let v = serde_json::to_value(Order::RotateToken).unwrap_or_default();
        assert_eq!(v, serde_json::json!({ "type": "rotateToken" }));
    }
}
