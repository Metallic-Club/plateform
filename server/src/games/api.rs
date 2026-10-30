//! Game endpoints: home feed, genres, browse, search, detail, similar games and ratings.

use std::collections::HashSet;

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use super::{
    GAME_COLUMNS, GAME_FROM, GameRow, GameSummary, MIN_ACCOUNT_DAYS_TO_VOTE,
    MIN_PLAY_SECONDS_TO_VOTE, VISIBLE, labels_for, summaries, up_percent, visible_by_ids,
};
use crate::{
    AppState,
    http::{ApiJson, ApiQuery, IdPath, Page, parse_flag, rfc3339, rfc3339_opt},
    identity::{
        UserSummary,
        auth::{MaybeViewer, Viewer, limit},
    },
    matchmaker::{Items, PageBody},
    problem::{ApiResult, Problem},
    services::{Activity, Limit},
};

const RATE_LIMIT: Limit = Limit::per_minute("rate_game", 30);

fn valid_genre(g: &str) -> bool {
    let b = g.as_bytes();
    (2..=32).contains(&b.len())
        && b[0].is_ascii_lowercase()
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

fn device_platforms(device: Option<&str>) -> ApiResult<Vec<String>> {
    let list: &[&str] = match device.unwrap_or("desktop") {
        "" | "desktop" => &["windows", "macos", "linux"],
        "mobile" => &["android", "ios"],
        "console" => &[],
        _ => {
            return Err(Problem::invalid(
                "device",
                "invalid",
                "Use desktop, mobile or console.",
            ));
        }
    };
    Ok(list.iter().map(|s| (*s).to_owned()).collect())
}

fn order_by(sort: &str) -> ApiResult<&'static str> {
    Ok(match sort {
        "popular" => "g.playing_snapshot DESC, g.visits DESC, g.id DESC",
        // Wilson lower bound of the up share, z = 1.96 (spec 9.4).
        "top_rated" => {
            "(CASE WHEN coalesce(r.up, 0) + coalesce(r.down, 0) = 0 THEN 0::float8 ELSE               (r.up::float8 / (r.up + r.down) + 1.9208::float8 / (r.up + r.down)                - 1.96::float8 * sqrt(r.up::float8 * r.down / (r.up + r.down) + 0.9604::float8) / (r.up + r.down))               / (1 + 3.8416::float8 / (r.up + r.down)) END) DESC, g.visits DESC, g.id DESC"
        }
        "trending" => {
            "(SELECT count(*) FROM games.play_sessions ps WHERE ps.game_id = g.id AND ps.started_at > now() - interval '7 days') DESC, \
              g.playing_snapshot DESC, g.id DESC"
        }
        "new" => "g.created_at DESC, g.id DESC",
        "recently_updated" => "g.updated_at DESC, g.id DESC",
        _ => {
            return Err(Problem::invalid(
                "sort",
                "invalid",
                "Use popular, top_rated, trending, new or recently_updated.",
            ));
        }
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    genre: Option<String>,
    sort: Option<String>,
    first_party: Option<String>,
    max_players: Option<String>,
    device: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

/// One page of visible games with filters.
#[allow(clippy::too_many_arguments)]
async fn query_games(
    state: &AppState,
    labels: &[String],
    genre: Option<&str>,
    first_party: Option<bool>,
    max_players: Option<i32>,
    platforms: &[String],
    exclude: &[i64],
    order: &str,
    limit: i64,
    offset: i64,
) -> ApiResult<Vec<GameRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} \
           AND ($2::text IS NULL OR $2 = ANY(g.genres)) \
           AND ($3::bool IS NULL OR g.is_first_party = $3) \
           AND ($4::int IS NULL OR g.max_players <= $4) \
           AND g.platforms && $5 \
           AND NOT (g.id = ANY($6)) \
         ORDER BY {order} LIMIT $7 OFFSET $8"
    )))
    .bind(labels)
    .bind(genre)
    .bind(first_party)
    .bind(max_players)
    .bind(platforms)
    .bind(exclude)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?)
}

/// `listGames`
pub async fn list_games(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    ApiQuery(q): ApiQuery<ListQuery>,
) -> ApiResult<Json<PageBody<GameSummary>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let genre = q.genre.filter(|g| !g.is_empty());
    if genre.as_deref().is_some_and(|g| !valid_genre(g)) {
        return Err(Problem::invalid("genre", "invalid", "Unknown genre."));
    }
    let order = order_by(
        q.sort
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or("popular"),
    )?;
    let first_party = parse_flag("firstParty", q.first_party.as_deref())?;
    let max_players = match q.max_players.as_deref() {
        None | Some("") => None,
        Some(v) => Some(
            v.parse::<i32>()
                .ok()
                .filter(|n| (1..=200).contains(n))
                .ok_or_else(|| Problem::invalid("maxPlayers", "out_of_range", "Use 1 to 200."))?,
        ),
    };
    let platforms = device_platforms(q.device.as_deref())?;
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let mut rows = query_games(
        &state,
        &labels_for(band),
        genre.as_deref(),
        first_party,
        max_players,
        &platforms,
        &[],
        order,
        page.limit + 1,
        offset,
    )
    .await?;
    let next_cursor = page.next_offset(offset, rows.len());
    rows.truncate(page.limit as usize);
    Ok(Json(PageBody {
        items: summaries(&state, &rows).await?,
        next_cursor,
    }))
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
    genre: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

/// `searchGames`: Postgres full text plus trigram similarity (typo tolerant), over names, creators and genres.
pub async fn search_games(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    ApiQuery(q): ApiQuery<SearchQuery>,
) -> ApiResult<Json<PageBody<GameSummary>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let text = q.q.unwrap_or_default().trim().to_owned();
    if text.is_empty() || text.chars().count() > 80 {
        return Err(Problem::invalid(
            "q",
            "invalid",
            "Search with 1 to 80 characters.",
        ));
    }
    let genre = q.genre.filter(|g| !g.is_empty());
    if genre.as_deref().is_some_and(|g| !valid_genre(g)) {
        return Err(Problem::invalid("genre", "invalid", "Unknown genre."));
    }
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let lower = text.to_lowercase();
    let mut rows: Vec<GameRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "WITH matched_genres AS (SELECT id FROM games.genres WHERE lower(name) LIKE '%' || $3 || '%' OR id = $2) \
         SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} \
           AND ($4::text IS NULL OR $4 = ANY(g.genres)) \
           AND (g.search @@ websearch_to_tsquery('simple', $2) \
                OR word_similarity($2, lower(g.name)) > 0.35 \
                OR lower(g.name) LIKE '%' || $3 || '%' \
                OR lower(g.creator_name) = $2 \
                OR g.genres && ARRAY(SELECT id FROM matched_genres)) \
         ORDER BY (lower(g.name) = $2) DESC, \
                  (ts_rank(g.search, websearch_to_tsquery('simple', $2)) + word_similarity($2, lower(g.name))) DESC, \
                  g.playing_snapshot DESC, g.id DESC \
         LIMIT $5 OFFSET $6"
    )))
    .bind(labels_for(band))
    .bind(&lower)
    .bind(crate::identity::like_escape(&lower))
    .bind(genre)
    .bind(page.limit + 1)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = page.next_offset(offset, rows.len());
    rows.truncate(page.limit as usize);
    Ok(Json(PageBody {
        items: summaries(&state, &rows).await?,
        next_cursor,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Genre {
    id: String,
    name: String,
    description: String,
    game_count: i64,
}

/// `listGenres`
pub async fn list_genres(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
) -> ApiResult<Json<Items<Genre>>> {
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let rows: Vec<(String, String, String, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT ge.id, ge.name, ge.description, \
                (SELECT count(*) FROM games.games g WHERE {VISIBLE} AND ge.id = ANY(g.genres)) \
         FROM games.genres ge ORDER BY ge.position, ge.id"
    )))
    .bind(labels_for(band))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(Items {
        items: rows
            .into_iter()
            .map(|(id, name, description, game_count)| Genre {
                id,
                name,
                description,
                game_count,
            })
            .collect(),
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerState {
    is_favorite: bool,
    vote: Option<&'static str>,
    can_vote: bool,
    last_played_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDetail {
    #[serde(flatten)]
    summary: GameSummary,
    description: String,
    screenshots: Vec<String>,
    start_place_id: String,
    max_players_per_server: i32,
    platforms: Vec<String>,
    visits: i64,
    favorites: i64,
    created_at: String,
    updated_at: String,
    friends_playing: Vec<UserSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    viewer: Option<ViewerState>,
}

/// `getGame`
pub async fn get_game(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(game_id): IdPath,
) -> ApiResult<Json<GameDetail>> {
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let game = super::viewable(
        &state.db,
        game_id,
        &labels_for(band),
        viewer.as_ref().map(|v| v.user_id),
    )
    .await?
    .ok_or_else(Problem::not_found)?;
    let Some(start_place) = game.start_place_id else {
        return Err(Problem::not_found());
    };
    let summary = summaries(&state, std::slice::from_ref(&game))
        .await?
        .remove(0);
    let screenshots: Vec<String> =
        sqlx::query_scalar("SELECT url FROM games.game_media WHERE game_id = $1 AND kind = 'screenshot' ORDER BY position LIMIT 10")
            .bind(game_id)
            .fetch_all(&state.db)
            .await?;
    let favorites: i64 =
        sqlx::query_scalar("SELECT count(*) FROM games.favorites WHERE game_id = $1")
            .bind(game_id)
            .fetch_one(&state.db)
            .await?;
    let (friends_playing, viewer_state) = match &viewer {
        Some(v) => (
            friends_in_game(&state, v.user_id, game_id).await?,
            Some(viewer_state(&state, v.user_id, game_id).await?),
        ),
        None => (Vec::new(), None),
    };
    Ok(Json(GameDetail {
        summary,
        description: game.description.clone(),
        screenshots,
        start_place_id: start_place.to_string(),
        max_players_per_server: game.max_players,
        platforms: game.platforms.clone(),
        visits: game.visits,
        favorites,
        created_at: rfc3339(game.created_at),
        updated_at: rfc3339(game.updated_at),
        friends_playing,
        viewer: viewer_state,
    }))
}

/// Friends of the viewer currently in this game whose presence the viewer may see (at most 10).
async fn friends_in_game(
    state: &AppState,
    viewer: i64,
    game_id: i64,
) -> ApiResult<Vec<UserSummary>> {
    let friends: Vec<i64> = crate::matchmaker::visible_friends(state, viewer)
        .await?
        .into_iter()
        .collect();
    let presence = state.presence.get_many(&friends).await;
    let playing: Vec<i64> = friends
        .iter()
        .zip(presence)
        .filter(|(_, p)| matches!(p.activity, Some(Activity::InGame { game_id: g, .. }) if g == game_id))
        .map(|(id, _)| *id)
        .take(10)
        .collect();
    crate::identity::summaries(&state.db, &playing).await
}

async fn viewer_state(state: &AppState, user: i64, game: i64) -> ApiResult<ViewerState> {
    let (is_favorite, vote, last_played): (bool, Option<i16>, Option<OffsetDateTime>) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM games.favorites WHERE user_id = $1 AND game_id = $2), \
                (SELECT vote FROM games.ratings WHERE user_id = $1 AND game_id = $2), \
                (SELECT last_played_at FROM games.play_history WHERE user_id = $1 AND game_id = $2 AND NOT hidden)",
    )
    .bind(user)
    .bind(game)
    .fetch_one(&state.db)
    .await?;
    Ok(ViewerState {
        is_favorite,
        vote: vote_name(vote),
        can_vote: cannot_vote_reason(state, user, game).await?.is_none(),
        last_played_at: rfc3339_opt(last_played),
    })
}

fn vote_name(v: Option<i16>) -> Option<&'static str> {
    match v {
        Some(1) => Some("up"),
        Some(-1) => Some("down"),
        _ => None,
    }
}

/// Why the user may not vote yet (spec 9.4), or None.
async fn cannot_vote_reason(
    state: &AppState,
    user: i64,
    game: i64,
) -> ApiResult<Option<&'static str>> {
    let Some(me) = crate::identity::basic(&state.db, user).await? else {
        return Ok(Some("restricted"));
    };
    if me.status != "active" {
        return Ok(Some("restricted"));
    }
    if !me.is_verified() {
        return Ok(Some("verify_email"));
    }
    if OffsetDateTime::now_utc() - me.created_at < time::Duration::days(MIN_ACCOUNT_DAYS_TO_VOTE) {
        return Ok(Some("account_too_new"));
    }
    if super::played_seconds(&state.db, user, game).await? < MIN_PLAY_SECONDS_TO_VOTE {
        return Ok(Some("play_longer"));
    }
    Ok(None)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rating {
    game_id: String,
    up: i64,
    down: i64,
    up_percent: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    my_vote: Option<Option<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    can_vote: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cannot_vote_reason: Option<Option<&'static str>>,
}

async fn rating_body(state: &AppState, game: i64, viewer: Option<i64>) -> ApiResult<Rating> {
    let (up, down): (i64, i64) = sqlx::query_as(
        "SELECT coalesce((SELECT up FROM games.rating_totals WHERE game_id = $1), 0)::bigint, \
                coalesce((SELECT down FROM games.rating_totals WHERE game_id = $1), 0)::bigint",
    )
    .bind(game)
    .fetch_one(&state.db)
    .await?;
    let mut body = Rating {
        game_id: game.to_string(),
        up,
        down,
        up_percent: up_percent(up, down),
        my_vote: None,
        can_vote: None,
        cannot_vote_reason: None,
    };
    if let Some(user) = viewer {
        let vote: Option<i16> = sqlx::query_scalar(
            "SELECT vote FROM games.ratings WHERE user_id = $1 AND game_id = $2",
        )
        .bind(user)
        .bind(game)
        .fetch_optional(&state.db)
        .await?;
        let reason = cannot_vote_reason(state, user, game).await?;
        body.my_vote = Some(vote_name(vote));
        body.can_vote = Some(reason.is_none());
        body.cannot_vote_reason = Some(reason);
    }
    Ok(body)
}

/// `getRating`
pub async fn get_rating(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(game_id): IdPath,
) -> ApiResult<Json<Rating>> {
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let user = viewer.as_ref().map(|v| v.user_id);
    super::viewable(&state.db, game_id, &labels_for(band), user)
        .await?
        .ok_or_else(Problem::not_found)?;
    Ok(Json(rating_body(&state, game_id, user).await?))
}

#[derive(Deserialize)]
pub struct VoteRequest {
    vote: Option<String>,
}

/// `setRating`
pub async fn set_rating(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
    ApiJson(body): ApiJson<VoteRequest>,
) -> ApiResult<Json<Rating>> {
    let vote: i16 = match body.vote.as_deref() {
        Some("up") => 1,
        Some("down") => -1,
        _ => return Err(Problem::invalid("vote", "invalid", "Use up or down.")),
    };
    limit(&state, RATE_LIMIT, &viewer.user_id.to_string()).await?;
    let band = crate::viewer_band(&state, Some(&viewer)).await?;
    super::viewable(&state.db, game_id, &labels_for(band), Some(viewer.user_id))
        .await?
        .ok_or_else(Problem::not_found)?;
    if let Some(reason) = cannot_vote_reason(&state, viewer.user_id, game_id).await? {
        return Err(Problem::forbidden(reason, "You cannot rate this game yet"));
    }
    let mut tx = state.db.begin().await?;
    let old: Option<i16> = sqlx::query_scalar(
        "SELECT vote FROM games.ratings WHERE user_id = $1 AND game_id = $2 FOR UPDATE",
    )
    .bind(viewer.user_id)
    .bind(game_id)
    .fetch_optional(&mut *tx)
    .await?;
    if old != Some(vote) {
        sqlx::query(
            "INSERT INTO games.ratings (user_id, game_id, vote) VALUES ($1, $2, $3) \
             ON CONFLICT (user_id, game_id) DO UPDATE SET vote = EXCLUDED.vote, updated_at = now()",
        )
        .bind(viewer.user_id)
        .bind(game_id)
        .bind(vote)
        .execute(&mut *tx)
        .await?;
        adjust_totals(&mut tx, game_id, old, Some(vote)).await?;
    }
    tx.commit().await?;
    Ok(Json(
        rating_body(&state, game_id, Some(viewer.user_id)).await?,
    ))
}

/// `clearRating`
pub async fn clear_rating(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
) -> ApiResult<StatusCode> {
    let mut tx = state.db.begin().await?;
    let old: Option<i16> = sqlx::query_scalar(
        "DELETE FROM games.ratings WHERE user_id = $1 AND game_id = $2 RETURNING vote",
    )
    .bind(viewer.user_id)
    .bind(game_id)
    .fetch_optional(&mut *tx)
    .await?;
    if old.is_some() {
        adjust_totals(&mut tx, game_id, old, None).await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn adjust_totals(
    conn: &mut sqlx::PgConnection,
    game: i64,
    old: Option<i16>,
    new: Option<i16>,
) -> ApiResult<()> {
    let delta = |v: i16| -> (i32, i32) {
        let up = i32::from(new == Some(v) && v == 1) - i32::from(old == Some(v) && v == 1);
        let down = i32::from(new == Some(v) && v == -1) - i32::from(old == Some(v) && v == -1);
        (up, down)
    };
    let (u1, d1) = delta(1);
    let (u2, d2) = delta(-1);
    sqlx::query(
        "INSERT INTO games.rating_totals (game_id, up, down) VALUES ($1, greatest($2, 0), greatest($3, 0)) \
         ON CONFLICT (game_id) DO UPDATE SET up = greatest(games.rating_totals.up + $2, 0), down = greatest(games.rating_totals.down + $3, 0)",
    )
    .bind(game)
    .bind(u1 + u2)
    .bind(d1 + d2)
    .execute(conn)
    .await?;
    Ok(())
}

#[derive(Deserialize)]
pub struct SimilarQuery {
    limit: Option<String>,
}

/// `listSimilarGames`: P1 heuristic, shared genres then popularity (co-play statistics arrive in P2).
pub async fn list_similar(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(game_id): IdPath,
    ApiQuery(q): ApiQuery<SimilarQuery>,
) -> ApiResult<Json<PageBody<GameSummary>>> {
    let page = Page::parse(q.limit.as_deref(), None)?;
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let labels = labels_for(band);
    let game = super::viewable(
        &state.db,
        game_id,
        &labels,
        viewer.as_ref().map(|v| v.user_id),
    )
    .await?
    .ok_or_else(Problem::not_found)?;
    let rows: Vec<GameRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} AND g.id <> $2 AND g.genres && $3 \
         ORDER BY cardinality(ARRAY(SELECT unnest(g.genres) INTERSECT SELECT unnest($3::text[]))) DESC, \
                  g.playing_snapshot DESC, g.visits DESC, g.id DESC LIMIT $4"
    )))
    .bind(&labels)
    .bind(game_id)
    .bind(&game.genres)
    .bind(page.limit)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(PageBody {
        items: summaries(&state, &rows).await?,
        next_cursor: None,
    }))
}

// ------------------------------------------------------------------ home

#[derive(Serialize)]
pub struct HomeSection {
    id: &'static str,
    kind: &'static str,
    title: &'static str,
    reason: String,
    items: Vec<GameSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFeed {
    generated_at: String,
    sections: Vec<HomeSection>,
}

#[derive(Deserialize)]
pub struct HomeQuery {
    device: Option<String>,
}

const ROW: i64 = 12;

/// `getHome`: rows in the spec's order, each with its reason line (spec 9.4). Empty rows are left out.
pub async fn get_home(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    ApiQuery(q): ApiQuery<HomeQuery>,
) -> ApiResult<Json<HomeFeed>> {
    let platforms = device_platforms(q.device.as_deref())?;
    let band = crate::viewer_band(&state, viewer.as_ref()).await?;
    let labels = labels_for(band);
    let mut sections = Vec::new();
    let user = viewer.as_ref().map(|v| v.user_id);

    if let Some(user) = user {
        let recent: Vec<i64> = sqlx::query_scalar(
            "SELECT game_id FROM games.play_history WHERE user_id = $1 AND NOT hidden ORDER BY last_played_at DESC LIMIT $2",
        )
        .bind(user)
        .bind(ROW)
        .fetch_all(&state.db)
        .await?;
        let rows = visible_by_ids(&state.db, &recent, &labels).await?;
        push(
            &state,
            &mut sections,
            "continue",
            "continue",
            "Continue playing",
            "You played these recently".into(),
            rows,
        )
        .await?;

        let friends: Vec<i64> = crate::matchmaker::visible_friends(&state, user)
            .await?
            .into_iter()
            .collect();
        let mut seen = HashSet::new();
        let friend_games: Vec<i64> = state
            .presence
            .get_many(&friends)
            .await
            .into_iter()
            .filter_map(|p| match p.activity {
                Some(Activity::InGame { game_id, .. }) => Some(game_id),
                _ => None,
            })
            .filter(|g| seen.insert(*g))
            .take(ROW as usize)
            .collect();
        let rows = visible_by_ids(&state.db, &friend_games, &labels).await?;
        push(
            &state,
            &mut sections,
            "friends_playing",
            "friends_playing",
            "Friends are playing",
            "Your friends are in these games now".into(),
            rows,
        )
        .await?;
    }

    let featured: Vec<i64> =
        sqlx::query_scalar("SELECT game_id FROM discovery.featured ORDER BY position LIMIT $1")
            .bind(ROW)
            .fetch_all(&state.db)
            .await?;
    let rows = visible_by_ids(&state.db, &featured, &labels).await?;
    push(
        &state,
        &mut sections,
        "featured",
        "featured",
        "Featured",
        "Picked by the Metallic team".into(),
        rows,
    )
    .await?;

    if let Some(user) = user {
        // P1 heuristic: popular games in the genres the user plays or favourites, not played yet.
        let genres: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT unnest(g.genres) FROM games.games g WHERE g.id IN ( \
                SELECT game_id FROM games.play_history WHERE user_id = $1 AND NOT hidden \
                UNION SELECT game_id FROM games.favorites WHERE user_id = $1)",
        )
        .bind(user)
        .fetch_all(&state.db)
        .await?;
        if !genres.is_empty() {
            let played: Vec<i64> =
                sqlx::query_scalar("SELECT game_id FROM games.play_history WHERE user_id = $1")
                    .bind(user)
                    .fetch_all(&state.db)
                    .await?;
            let rows: Vec<GameRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
                "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} AND g.genres && $2 AND NOT (g.id = ANY($3)) AND g.platforms && $4 \
                 ORDER BY g.playing_snapshot DESC, g.visits DESC, g.id DESC LIMIT $5"
            )))
            .bind(&labels)
            .bind(&genres)
            .bind(&played)
            .bind(&platforms)
            .bind(ROW)
            .fetch_all(&state.db)
            .await?;
            push(
                &state,
                &mut sections,
                "recommended",
                "recommended",
                "Recommended for you",
                "Based on the genres you play".into(),
                rows,
            )
            .await?;
        }
    }

    let rows = query_games(
        &state,
        &labels,
        None,
        Some(true),
        None,
        &platforms,
        &[],
        "g.playing_snapshot DESC, g.visits DESC, g.id DESC",
        ROW,
        0,
    )
    .await?;
    push(
        &state,
        &mut sections,
        "first_party",
        "first_party",
        "Made by Metallic",
        "Games from the Metallic team".into(),
        rows,
    )
    .await?;

    let rows = query_games(
        &state,
        &labels,
        None,
        None,
        None,
        &platforms,
        &[],
        order_by("popular")?,
        ROW,
        0,
    )
    .await?;
    push(
        &state,
        &mut sections,
        "popular",
        "popular",
        "Popular now",
        "Most players right now".into(),
        rows,
    )
    .await?;

    if user.is_some() {
        let rows = query_games(
            &state,
            &labels,
            None,
            None,
            None,
            &platforms,
            &[],
            order_by("trending")?,
            ROW,
            0,
        )
        .await?;
        push(
            &state,
            &mut sections,
            "trending",
            "trending",
            "Trending",
            "Most played this week".into(),
            rows,
        )
        .await?;
        let rows: Vec<GameRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} AND g.created_at > now() - interval '14 days' AND g.platforms && $2 \
             ORDER BY g.playing_snapshot DESC, g.created_at DESC LIMIT $3"
        )))
        .bind(&labels)
        .bind(&platforms)
        .bind(ROW)
        .fetch_all(&state.db)
        .await?;
        push(
            &state,
            &mut sections,
            "new_and_rising",
            "new_and_rising",
            "New and rising",
            "New in the last two weeks".into(),
            rows,
        )
        .await?;
    }

    Ok(Json(HomeFeed {
        generated_at: rfc3339(OffsetDateTime::now_utc()),
        sections,
    }))
}

async fn push(
    state: &AppState,
    sections: &mut Vec<HomeSection>,
    id: &'static str,
    kind: &'static str,
    title: &'static str,
    reason: String,
    rows: Vec<GameRow>,
) -> ApiResult<()> {
    if rows.is_empty() {
        return Ok(());
    }
    sections.push(HomeSection {
        id,
        kind,
        title,
        reason,
        items: summaries(state, &rows).await?,
    });
    Ok(())
}
