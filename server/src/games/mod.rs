//! games: games, genres, ratings, favourites and play history, plus the discovery read models built on them.

pub mod api;
pub mod library;

use std::collections::HashMap;

use serde::Serialize;
use sqlx::{PgConnection, PgExecutor};
use time::OffsetDateTime;

use crate::{AppState, identity::AgeBand, problem::ApiResult};

/// Votes needed before the percentage shows (spec 9.4).
pub const MIN_VOTES_FOR_PERCENT: i64 = 20;
/// Total play needed before voting (spec 9.4).
pub const MIN_PLAY_SECONDS_TO_VOTE: i64 = 10 * 60;
/// Account age needed before voting (spec 9.4).
pub const MIN_ACCOUNT_DAYS_TO_VOTE: i64 = 3;
/// Favourites cap (spec 9.4).
pub const MAX_FAVORITES: i64 = 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorRef {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub name: String,
    pub is_first_party: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingSummary {
    pub up_percent: Option<i64>,
    pub votes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub id: String,
    pub name: String,
    pub creator: CreatorRef,
    pub icon_url: String,
    pub thumbnail_url: String,
    pub genres: Vec<String>,
    pub playing: i64,
    pub rating: RatingSummary,
    pub content_label: String,
    pub is_first_party: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GameRow {
    pub id: i64,
    pub name: String,
    pub owner_kind: String,
    pub owner_id: i64,
    pub creator_name: String,
    pub is_first_party: bool,
    pub icon_url: String,
    pub thumbnail_url: String,
    pub genres: Vec<String>,
    pub content_label: Option<String>,
    pub status: String,
    pub up: i64,
    pub down: i64,
    pub description: String,
    pub start_place_id: Option<i64>,
    pub max_players: i32,
    pub platforms: Vec<String>,
    pub visits: i64,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

/// Columns for [`GameRow`]; the query must alias `games.games` as `g` and LEFT JOIN `games.rating_totals r`.
pub const GAME_COLUMNS: &str = "g.id, g.name, g.owner_kind, g.owner_id, g.creator_name, g.is_first_party, g.icon_url, \
    g.thumbnail_url, g.genres, g.content_label, g.status, coalesce(r.up, 0)::bigint AS up, coalesce(r.down, 0)::bigint AS down, \
    g.description, g.start_place_id, g.max_players, g.platforms, g.visits, g.created_at, g.updated_at";
pub const GAME_FROM: &str = "games.games g LEFT JOIN games.rating_totals r ON r.game_id = g.id";
/// Listed and playable: public with a content label the viewer may see ($1 = allowed labels).
pub const VISIBLE: &str = "g.status = 'public' AND g.content_label = ANY($1)";

pub fn up_percent(up: i64, down: i64) -> Option<i64> {
    let votes = up + down;
    (votes >= MIN_VOTES_FOR_PERCENT).then(|| ((up * 100) as f64 / votes as f64).round() as i64)
}

/// Labels a viewer may see; signed-out visitors get the youngest set.
pub fn labels_for(band: Option<AgeBand>) -> Vec<String> {
    band.unwrap_or(AgeBand::Under13)
        .allowed_labels()
        .iter()
        .map(|s| (*s).to_owned())
        .collect()
}

impl GameRow {
    pub fn summary(&self, playing: i64) -> GameSummary {
        GameSummary {
            id: self.id.to_string(),
            name: self.name.clone(),
            creator: CreatorRef {
                kind: self.owner_kind.clone(),
                id: self.owner_id.to_string(),
                name: self.creator_name.clone(),
                is_first_party: self.is_first_party,
            },
            icon_url: self.icon_url.clone(),
            thumbnail_url: self.thumbnail_url.clone(),
            genres: self.genres.clone(),
            playing,
            rating: RatingSummary {
                up_percent: up_percent(self.up, self.down),
                votes: self.up + self.down,
            },
            content_label: self
                .content_label
                .clone()
                .unwrap_or_else(|| "everyone".into()),
            is_first_party: self.is_first_party,
        }
    }
}

/// Summaries with live player counts from the matchmaker, in row order.
pub async fn summaries(state: &AppState, rows: &[GameRow]) -> ApiResult<Vec<GameSummary>> {
    let ids: Vec<i64> = rows.iter().map(|r| r.id).collect();
    let live = crate::matchmaker::live_counts(&state.db, &ids).await?;
    Ok(rows
        .iter()
        .map(|r| r.summary(live.get(&r.id).map(|l| l.0).unwrap_or(0)))
        .collect())
}

/// Visible games by id, in the order given (missing or hidden games are skipped).
pub async fn visible_by_ids(
    db: impl PgExecutor<'_>,
    ids: &[i64],
    labels: &[String],
) -> ApiResult<Vec<GameRow>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows: Vec<GameRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE {VISIBLE} AND g.id = ANY($2)"
    )))
    .bind(labels)
    .bind(ids)
    .fetch_all(db)
    .await?;
    let mut map: HashMap<i64, GameRow> = rows.into_iter().map(|r| (r.id, r)).collect();
    Ok(ids.iter().filter_map(|id| map.remove(id)).collect())
}

/// A game the viewer may open: public and labelled for them, or their own.
pub async fn viewable(
    db: impl PgExecutor<'_>,
    id: i64,
    labels: &[String],
    viewer: Option<i64>,
) -> ApiResult<Option<GameRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS} FROM {GAME_FROM} WHERE g.id = $2 AND (({VISIBLE}) OR (g.owner_kind = 'user' AND g.owner_id = $3 AND g.status <> 'removed'))"
    )))
    .bind(labels)
    .bind(id)
    .bind(viewer.unwrap_or(0))
    .fetch_optional(db)
    .await?)
}

/// Names of games by id (for presence).
pub async fn names(db: impl PgExecutor<'_>, ids: &[i64]) -> ApiResult<HashMap<i64, String>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, name FROM games.games WHERE id = ANY($1)")
            .bind(ids)
            .fetch_all(db)
            .await?;
    Ok(rows.into_iter().collect())
}

/// Seconds the user has played the game.
pub async fn played_seconds(db: impl PgExecutor<'_>, user: i64, game: i64) -> ApiResult<i64> {
    Ok(sqlx::query_scalar("SELECT coalesce((SELECT seconds FROM games.play_history WHERE user_id = $1 AND game_id = $2), 0)")
        .bind(user)
        .bind(game)
        .fetch_one(db)
        .await?)
}

/// Records a finished play session into history (called by the matchmaker when a player leaves a server).
pub async fn record_play(
    conn: &mut PgConnection,
    user: i64,
    game: i64,
    seconds: i64,
    at: OffsetDateTime,
) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO games.play_history (user_id, game_id, last_played_at, seconds) VALUES ($1, $2, $3, $4) \
         ON CONFLICT (user_id, game_id) DO UPDATE SET last_played_at = greatest(games.play_history.last_played_at, EXCLUDED.last_played_at), \
             seconds = games.play_history.seconds + EXCLUDED.seconds, hidden = false",
    )
    .bind(user)
    .bind(game)
    .bind(at)
    .bind(seconds.max(0))
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn place_in_game(db: impl PgExecutor<'_>, place: i64, game: i64) -> ApiResult<bool> {
    Ok(sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM games.places WHERE id = $1 AND game_id = $2)",
    )
    .bind(place)
    .bind(game)
    .fetch_one(db)
    .await?)
}

/// Opens play sessions for players who joined a server and counts their visits.
pub async fn start_sessions(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    game: i64,
    server: i64,
    users: &[i64],
) -> ApiResult<()> {
    if users.is_empty() {
        return Ok(());
    }
    let session_ids: Vec<i64> = users.iter().map(|_| ids.next()).collect();
    sqlx::query(
        "INSERT INTO games.play_sessions (id, user_id, game_id, server_id)          SELECT s, u, $3, $4 FROM unnest($1::bigint[], $2::bigint[]) AS x(s, u)",
    )
    .bind(&session_ids)
    .bind(users)
    .bind(game)
    .bind(server)
    .execute(&mut *conn)
    .await?;
    sqlx::query("UPDATE games.games SET visits = visits + $2 WHERE id = $1")
        .bind(game)
        .bind(users.len() as i64)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Ends open sessions of players who left a server and adds the time to their play history.
pub async fn end_sessions(
    conn: &mut PgConnection,
    game: i64,
    server: i64,
    users: &[i64],
) -> ApiResult<()> {
    if users.is_empty() {
        return Ok(());
    }
    let closed: Vec<(Option<i64>, OffsetDateTime, OffsetDateTime)> = sqlx::query_as(
        "UPDATE games.play_sessions SET ended_at = now()          WHERE server_id = $1 AND user_id = ANY($2) AND ended_at IS NULL RETURNING user_id, started_at, ended_at",
    )
    .bind(server)
    .bind(users)
    .fetch_all(&mut *conn)
    .await?;
    for (user, started, ended) in closed {
        if let Some(user) = user {
            record_play(conn, user, game, (ended - started).whole_seconds(), ended).await?;
        }
    }
    Ok(())
}

/// Erases a user's game data (account deletion). Play sessions stay without the user id.
pub async fn purge_user(conn: &mut PgConnection, user: i64) -> ApiResult<()> {
    sqlx::query(
        "UPDATE games.rating_totals t SET up = t.up - (r.vote = 1)::int, down = t.down - (r.vote = -1)::int \
         FROM games.ratings r WHERE r.user_id = $1 AND r.game_id = t.game_id",
    )
    .bind(user)
    .execute(&mut *conn)
    .await?;
    for sql in [
        "DELETE FROM games.ratings WHERE user_id = $1",
        "DELETE FROM games.favorites WHERE user_id = $1",
        "DELETE FROM games.play_history WHERE user_id = $1",
        "UPDATE games.play_sessions SET user_id = NULL WHERE user_id = $1",
    ] {
        sqlx::query(sql).bind(user).execute(&mut *conn).await?;
    }
    Ok(())
}

/// Copies live player counts into `games.playing_snapshot` for popularity sorting (worker job, every minute).
pub async fn snapshot_playing(state: &AppState) -> ApiResult<()> {
    let live = crate::matchmaker::all_live_counts(&state.db).await?;
    let ids: Vec<i64> = live.keys().copied().collect();
    let counts: Vec<i32> = ids.iter().map(|id| live[id].0 as i32).collect();
    sqlx::query(
        "UPDATE games.games g SET playing_snapshot = coalesce(c.playing, 0) \
         FROM (SELECT g2.id, x.playing FROM games.games g2 \
               LEFT JOIN unnest($1::bigint[], $2::int[]) AS x(id, playing) ON x.id = g2.id) c \
         WHERE c.id = g.id AND g.playing_snapshot IS DISTINCT FROM coalesce(c.playing, 0)",
    )
    .bind(&ids)
    .bind(&counts)
    .execute(&state.db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_shows_from_twenty_votes() {
        assert_eq!(up_percent(19, 0), None);
        assert_eq!(up_percent(4710, 410), Some(92));
        assert_eq!(up_percent(10, 10), Some(50));
    }
}
