//! matchmaker: regions, live servers and counts, the server browser and join tickets (spec 9.7).
//! Game servers report through the internal endpoints in [`internal`]; counts come only from those heartbeats.

pub mod connection;
pub mod internal;

use std::collections::{HashMap, HashSet};

use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::PgExecutor;
use time::{Duration, OffsetDateTime};

use crate::{
    AppState,
    crypto::{new_token, token_hash},
    games,
    http::{ApiQuery, IdPath, Page, parse_flag, rfc3339},
    identity::{
        UserSummary,
        auth::{MaybeViewer, Viewer, limit},
    },
    problem::{ApiResult, Problem},
    services::{Activity, Limit},
    social,
};

/// A server counts as live when it beat within this many seconds (spec: counts never older than 30 s).
pub const LIVE_WINDOW_SECS: i64 = 30;
pub const HEARTBEAT_INTERVAL_SECS: i64 = 5;
pub const TICKET_TTL: Duration = Duration::seconds(60);
const LIVE: &str = "status IN ('starting', 'running', 'draining') AND last_heartbeat_at > now() - make_interval(secs => 30)";
const JOIN_LIMIT: Limit = Limit::per_minute("join_ticket", 30);

/// (players, servers, newest heartbeat) per game.
pub type LiveCounts = HashMap<i64, (i64, i64, OffsetDateTime)>;

pub async fn live_counts(db: impl PgExecutor<'_>, game_ids: &[i64]) -> ApiResult<LiveCounts> {
    if game_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(i64, i64, i64, OffsetDateTime)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT game_id, coalesce(sum(cardinality(player_ids)), 0)::bigint, count(*), max(last_heartbeat_at) \
         FROM matchmaker.servers WHERE game_id = ANY($1) AND {LIVE} GROUP BY game_id"
    )))
    .bind(game_ids)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(g, p, s, t)| (g, (p, s, t)))
        .collect())
}

pub async fn all_live_counts(db: impl PgExecutor<'_>) -> ApiResult<LiveCounts> {
    let rows: Vec<(i64, i64, i64, OffsetDateTime)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT game_id, coalesce(sum(cardinality(player_ids)), 0)::bigint, count(*), max(last_heartbeat_at) \
         FROM matchmaker.servers WHERE {LIVE} GROUP BY game_id"
    )))
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(g, p, s, t)| (g, (p, s, t)))
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    code: String,
    name: String,
    probe_url: String,
}

#[derive(Serialize)]
pub struct Items<T> {
    pub items: Vec<T>,
}

/// `listRegions`
pub async fn list_regions(State(state): State<AppState>) -> ApiResult<Json<Items<Region>>> {
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT code, name, probe_url FROM matchmaker.regions WHERE active ORDER BY position, code",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Items {
        items: rows
            .into_iter()
            .map(|(code, name, probe_url)| Region {
                code,
                name,
                probe_url,
            })
            .collect(),
    }))
}

pub fn valid_region_code(code: &str) -> bool {
    let Some((a, b)) = code.split_once('-') else {
        return false;
    };
    (2..=8).contains(&a.len())
        && (2..=12).contains(&b.len())
        && a.bytes().all(|c| c.is_ascii_lowercase())
        && b.bytes().all(|c| c.is_ascii_lowercase())
}

#[derive(sqlx::FromRow, Clone)]
pub struct ServerRow {
    pub id: i64,
    pub game_id: i64,
    pub place_id: i64,
    pub region: String,
    pub status: String,
    pub max_players: i32,
    pub player_ids: Vec<i64>,
    pub joinable: bool,
    pub started_at: OffsetDateTime,
}

impl ServerRow {
    pub fn playing(&self) -> i64 {
        self.player_ids.len() as i64
    }
    pub fn can_join(&self) -> bool {
        self.joinable && self.status == "running" && self.playing() < i64::from(self.max_players)
    }
}

const SERVER_COLUMNS: &str =
    "id, game_id, place_id, region, status, max_players, player_ids, joinable, started_at";

async fn live_servers(db: impl PgExecutor<'_>, game: i64) -> ApiResult<Vec<ServerRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {SERVER_COLUMNS} FROM matchmaker.servers WHERE game_id = $1 AND {LIVE} ORDER BY started_at DESC LIMIT 2000"
    )))
    .bind(game)
    .fetch_all(db)
    .await?)
}

async fn live_server(db: impl PgExecutor<'_>, id: i64) -> ApiResult<Option<ServerRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {SERVER_COLUMNS} FROM matchmaker.servers WHERE id = $1 AND {LIVE}"
    )))
    .bind(id)
    .fetch_optional(db)
    .await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerBody {
    id: String,
    game_id: String,
    place_id: String,
    region: String,
    playing: i64,
    max_players: i32,
    friends: Vec<UserSummary>,
    started_at: String,
    joinable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageBody<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerQuery {
    region: Option<String>,
    sort: Option<String>,
    hide_full: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

/// Friends of `viewer` whose presence `viewer` may see (they show in server lists and "friends playing").
pub async fn visible_friends(state: &AppState, viewer: i64) -> ApiResult<HashSet<i64>> {
    let friends = social::friend_ids(&state.db, viewer).await?;
    let privacy = social::privacy_many(&state.db, &friends).await?;
    Ok(friends
        .into_iter()
        .filter(|f| {
            privacy
                .get(f)
                .is_some_and(|p| p.presence_visibility != "nobody")
        })
        .collect())
}

/// `listServers`
pub async fn list_servers(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(game_id): IdPath,
    ApiQuery(q): ApiQuery<ServerQuery>,
) -> ApiResult<Json<PageBody<ServerBody>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let region = match q.region.as_deref() {
        None | Some("") => None,
        Some(r) if valid_region_code(r) => Some(r.to_owned()),
        Some(_) => {
            return Err(Problem::invalid(
                "region",
                "invalid",
                "Unknown region code.",
            ));
        }
    };
    let sort = q.sort.as_deref().unwrap_or("most_players");
    if !matches!(sort, "most_players" | "fewest_players" | "newest") {
        return Err(Problem::invalid(
            "sort",
            "invalid",
            "Use most_players, fewest_players or newest.",
        ));
    }
    let hide_full = parse_flag("hideFull", q.hide_full.as_deref())?.unwrap_or(true);
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    games::viewable(
        &state.db,
        game_id,
        &games::labels_for(band),
        viewer.as_ref().map(|v| v.user_id),
    )
    .await?
    .ok_or_else(Problem::not_found)?;

    let mut servers = live_servers(&state.db, game_id).await?;
    servers.retain(|s| {
        region.as_deref().is_none_or(|r| s.region == r) && (!hide_full || s.can_join())
    });
    let friends = match &viewer {
        Some(v) => visible_friends(&state, v.user_id).await?,
        None => HashSet::new(),
    };
    let hidden: HashSet<i64> = match &viewer {
        Some(v) => social::hidden_for(&state.db, v.user_id)
            .await?
            .into_iter()
            .collect(),
        None => HashSet::new(),
    };
    let friend_count = |s: &ServerRow| s.player_ids.iter().filter(|p| friends.contains(p)).count();
    servers.sort_by(|a, b| {
        friend_count(b)
            .cmp(&friend_count(a))
            .then_with(|| match sort {
                "fewest_players" => a.playing().cmp(&b.playing()),
                "newest" => b.started_at.cmp(&a.started_at),
                _ => b.playing().cmp(&a.playing()),
            })
    });
    let total = servers.len();
    let page_rows: Vec<ServerRow> = servers
        .into_iter()
        .skip(offset as usize)
        .take(page.limit as usize)
        .collect();
    let friend_ids: Vec<i64> = page_rows
        .iter()
        .flat_map(|s| s.player_ids.iter().copied())
        .filter(|p| friends.contains(p) && !hidden.contains(p))
        .collect();
    let people = crate::identity::basics(&state.db, &friend_ids).await?;
    let items = page_rows
        .iter()
        .map(|s| ServerBody {
            id: s.id.to_string(),
            game_id: s.game_id.to_string(),
            place_id: s.place_id.to_string(),
            region: s.region.clone(),
            playing: s.playing(),
            max_players: s.max_players,
            friends: s
                .player_ids
                .iter()
                .filter_map(|p| {
                    people
                        .get(p)
                        .filter(|_| friends.contains(p))
                        .map(|u| u.summary())
                })
                .collect(),
            started_at: rfc3339(s.started_at),
            joinable: s.can_join(),
        })
        .collect();
    let next = offset + page.limit;
    let next_cursor = ((total as i64) > next && next <= crate::http::MAX_OFFSET)
        .then(|| crate::http::Cursor::Offset(next).encode());
    Ok(Json(PageBody { items, next_cursor }))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequest {
    server_id: Option<String>,
    follow_user_id: Option<String>,
    region: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinTicket {
    ticket: String,
    launch_uri: String,
    place_id: String,
    expires_at: String,
}

/// `createJoinTicket`
pub async fn create_join_ticket(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
    body: Bytes,
) -> ApiResult<Response> {
    viewer.require_scope("play")?;
    limit(&state, JOIN_LIMIT, &viewer.user_id.to_string()).await?;
    let req: JoinRequest = if body.iter().all(u8::is_ascii_whitespace) {
        JoinRequest::default()
    } else {
        serde_json::from_slice(&body).map_err(|e| Problem::bad_request(e.to_string()))?
    };
    let parse = |field: &str, v: &Option<String>| -> ApiResult<Option<i64>> {
        match v {
            None => Ok(None),
            Some(s) => crate::ids::parse_id(s)
                .map(Some)
                .ok_or_else(|| Problem::invalid(field, "invalid", "Not an id.")),
        }
    };
    let server_id = parse("serverId", &req.server_id)?;
    let follow = parse("followUserId", &req.follow_user_id)?;
    if server_id.is_some() && follow.is_some() {
        return Err(Problem::invalid(
            "serverId",
            "conflict",
            "Give serverId or followUserId, not both.",
        ));
    }
    if let Some(r) = &req.region
        && !valid_region_code(r)
    {
        return Err(Problem::invalid(
            "region",
            "invalid",
            "Unknown region code.",
        ));
    }

    let me = crate::identity::basic(&state.db, viewer.user_id)
        .await?
        .ok_or_else(Problem::unauthorized)?;
    let game = games::viewable(
        &state.db,
        game_id,
        &games::labels_for(Some(me.band())),
        Some(viewer.user_id),
    )
    .await?
    .ok_or_else(Problem::not_found)?;
    let place_id = game.start_place_id.ok_or_else(Problem::not_found)?;
    let full = || Problem::conflict("server_full", "Server full");

    let chosen: Option<ServerRow> = if let Some(sid) = server_id {
        let s = live_server(&state.db, sid)
            .await?
            .filter(|s| s.game_id == game_id)
            .ok_or_else(Problem::not_found)?;
        if !s.can_join() {
            return Err(full());
        }
        Some(s)
    } else if let Some(target) = follow {
        let s = follow_target(&state, viewer.user_id, target, game_id).await?;
        if !s.can_join() {
            return Err(full());
        }
        Some(s)
    } else {
        let friends = visible_friends(&state, viewer.user_id).await?;
        let hidden: HashSet<i64> = social::hidden_for(&state.db, viewer.user_id)
            .await?
            .into_iter()
            .collect();
        let servers = live_servers(&state.db, game_id).await?;
        pick_server(&servers, req.region.as_deref(), &friends, &hidden)
    };

    let ticket = new_token("jt_");
    let expires_at = OffsetDateTime::now_utc() + TICKET_TTL;
    sqlx::query(
        "INSERT INTO matchmaker.join_tickets (ticket_hash, user_id, game_id, place_id, server_id, region, expires_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(token_hash(&ticket))
    .bind(viewer.user_id)
    .bind(game_id)
    .bind(chosen.as_ref().map(|s| s.place_id).unwrap_or(place_id))
    .bind(chosen.as_ref().map(|s| s.id))
    .bind(chosen.as_ref().map(|s| s.region.clone()).or(req.region))
    .bind(expires_at)
    .execute(&state.db)
    .await?;
    let place = chosen.as_ref().map(|s| s.place_id).unwrap_or(place_id);
    let body = JoinTicket {
        launch_uri: format!("metallic://play?place={place}&ticket={ticket}"),
        ticket,
        place_id: place.to_string(),
        expires_at: rfc3339(expires_at),
    };
    Ok((
        StatusCode::CREATED,
        [(header::CACHE_CONTROL, "no-store")],
        Json(body),
    )
        .into_response())
}

/// The server a friend is in, if their privacy lets the viewer follow them (spec 9.7).
async fn follow_target(
    state: &AppState,
    viewer: i64,
    target: i64,
    game_id: i64,
) -> ApiResult<ServerRow> {
    let denied = || {
        Problem::forbidden("join_not_allowed", "You cannot join this player")
            .with_detail("They are not in a server you can join.")
    };
    let (a, b) = social::blocks_between(&state.db, viewer, target).await?;
    if a || b {
        return Err(denied());
    }
    let friend = social::are_friends(&state.db, viewer, target).await?;
    let privacy = social::privacy_many(&state.db, &[target]).await?;
    let Some(p) = privacy.get(&target) else {
        return Err(denied());
    };
    if !social::audience_allows(&p.join_policy, false, friend)
        || !social::audience_allows(&p.presence_visibility, false, friend)
    {
        return Err(denied());
    }
    let rec = state.presence.get_many(&[target]).await;
    let Some(Activity::InGame {
        game_id: g,
        server_id,
    }) = rec.first().and_then(|r| r.activity)
    else {
        return Err(denied());
    };
    if g != game_id {
        return Err(denied());
    }
    live_server(&state.db, server_id)
        .await?
        .filter(|s| s.player_ids.contains(&target))
        .ok_or_else(denied)
}

/// Quick join: prefer the asked region, friends present, and servers 60-90% full so games feel alive (spec 9.7).
pub fn pick_server(
    servers: &[ServerRow],
    region: Option<&str>,
    friends: &HashSet<i64>,
    hidden: &HashSet<i64>,
) -> Option<ServerRow> {
    servers
        .iter()
        .filter(|s| s.can_join() && !s.player_ids.iter().any(|p| hidden.contains(p)))
        .max_by(|a, b| {
            score(a, region, friends)
                .partial_cmp(&score(b, region, friends))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.playing().cmp(&b.playing()))
        })
        .cloned()
}

fn score(s: &ServerRow, region: Option<&str>, friends: &HashSet<i64>) -> f64 {
    let fill = s.playing() as f64 / f64::from(s.max_players.max(1));
    let fill_score = if (0.6..=0.9).contains(&fill) {
        30.0
    } else {
        30.0 - (fill - 0.75).abs() * 40.0
    };
    let region_score = if region.is_some_and(|r| r == s.region) {
        100.0
    } else {
        0.0
    };
    let friend_score = s.player_ids.iter().filter(|p| friends.contains(p)).count() as f64 * 20.0;
    region_score + friend_score + fill_score
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveQuery {
    game_ids: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveCount {
    game_id: String,
    playing: i64,
    servers: i64,
    updated_at: String,
}

/// `getLiveCounts`
pub async fn get_live_counts(
    State(state): State<AppState>,
    ApiQuery(q): ApiQuery<LiveQuery>,
) -> ApiResult<Response> {
    let ids = crate::http::parse_id_list("gameIds", q.game_ids.as_deref(), 100)?;
    let live = live_counts(&state.db, &ids).await?;
    let now = OffsetDateTime::now_utc();
    let items: Vec<LiveCount> = ids
        .iter()
        .map(|id| {
            let (playing, servers, at) = live.get(id).copied().unwrap_or((0, 0, now));
            LiveCount {
                game_id: id.to_string(),
                playing,
                servers,
                updated_at: rfc3339(at),
            }
        })
        .collect();
    Ok((
        [(header::CACHE_CONTROL, "public, max-age=15")],
        Json(Items { items }),
    )
        .into_response())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformLive {
    playing: i64,
    online: i64,
    servers: i64,
    updated_at: String,
}

/// `getPlatformLive`
pub async fn get_platform_live(State(state): State<AppState>) -> ApiResult<Response> {
    let (playing, servers): (i64, i64) = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT coalesce(sum(cardinality(player_ids)), 0)::bigint, count(*) FROM matchmaker.servers WHERE {LIVE}"
    )))
    .fetch_one(&state.db)
    .await?;
    let online = (state.presence.online_count().await as i64).max(playing);
    let body = PlatformLive {
        playing,
        online,
        servers,
        updated_at: rfc3339(OffsetDateTime::now_utc()),
    };
    Ok(([(header::CACHE_CONTROL, "public, max-age=15")], Json(body)).into_response())
}

/// Deletes used or expired join tickets and servers stopped more than a day ago (hourly job).
pub async fn cleanup_expired(db: &sqlx::PgPool) -> ApiResult<u64> {
    let mut n = sqlx::query(
        "DELETE FROM matchmaker.join_tickets WHERE expires_at < now() - interval '1 hour'",
    )
    .execute(db)
    .await?
    .rows_affected();
    n += sqlx::query("DELETE FROM matchmaker.servers WHERE status = 'stopped' AND stopped_at < now() - interval '1 day'")
        .execute(db)
        .await?
        .rows_affected();
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(id: i64, region: &str, players: Vec<i64>, max: i32) -> ServerRow {
        ServerRow {
            id,
            game_id: 1,
            place_id: 2,
            region: region.into(),
            status: "running".into(),
            max_players: max,
            player_ids: players,
            joinable: true,
            started_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn quick_join_prefers_region_friends_and_healthy_fill() {
        let none = HashSet::new();
        let servers = vec![
            server(1, "us-east", (1..=2).collect(), 10),
            server(2, "us-east", (10..=17).collect(), 10),
            server(3, "eu-central", (20..=27).collect(), 10),
            server(4, "us-east", (30..=39).collect(), 10),
        ];
        assert_eq!(
            pick_server(&servers, Some("us-east"), &none, &none).map(|s| s.id),
            Some(2),
            "75% full in region"
        );
        assert_eq!(
            pick_server(&servers, Some("eu-central"), &none, &none).map(|s| s.id),
            Some(3)
        );
        let friends: HashSet<i64> = [1, 2].into();
        assert_eq!(
            pick_server(&servers, None, &friends, &none).map(|s| s.id),
            Some(1),
            "friends win"
        );
        let hidden: HashSet<i64> = [12].into();
        assert_eq!(
            pick_server(&servers, Some("us-east"), &none, &hidden).map(|s| s.id),
            Some(1),
            "blocked users avoided, full server skipped"
        );
        assert!(
            pick_server(
                &[server(9, "us-east", (1..=4).collect(), 4)],
                None,
                &none,
                &none
            )
            .is_none()
        );
    }

    #[test]
    fn region_codes() {
        assert!(valid_region_code("us-east"));
        assert!(!valid_region_code("US-east"));
        assert!(!valid_region_code("useast"));
    }
}
