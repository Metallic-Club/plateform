//! The signed-in user's favourites and play history.

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use super::{GAME_COLUMNS, GameRow, GameSummary, MAX_FAVORITES, labels_for, summaries};
use crate::{
    AppState,
    http::{ApiQuery, Cursor, IdPath, Page, rfc3339},
    identity::auth::Viewer,
    matchmaker::PageBody,
    problem::{ApiResult, Problem},
};

#[derive(Deserialize)]
pub struct PageQuery {
    limit: Option<String>,
    cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Favorite {
    game: GameSummary,
    favorited_at: String,
}

#[derive(sqlx::FromRow)]
struct Timed {
    #[sqlx(flatten)]
    game: GameRow,
    at: OffsetDateTime,
    seconds: i64,
}

/// `listFavorites`: newest first, keyset-paginated. Games the viewer can no longer see are left out.
pub async fn list_favorites(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<PageQuery>,
) -> ApiResult<Json<PageBody<Favorite>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let band = crate::viewer_band(&state, Some(&viewer)).await?;
    let mut rows: Vec<Timed> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS}, f.created_at AS at, 0::bigint AS seconds \
         FROM games.favorites f JOIN games.games g ON g.id = f.game_id LEFT JOIN games.rating_totals r ON r.game_id = g.id \
         WHERE f.user_id = $1 AND g.status = 'public' AND g.content_label = ANY($2) \
           AND ($3::timestamptz IS NULL OR (f.created_at, f.game_id) < ($3, $4)) \
         ORDER BY f.created_at DESC, f.game_id DESC LIMIT $5"
    )))
    .bind(viewer.user_id)
    .bind(labels_for(band))
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = next_key(&mut rows, page.limit);
    let games: Vec<GameRow> = rows.iter().map(|r| r.game.clone()).collect();
    let items = summaries(&state, &games)
        .await?
        .into_iter()
        .zip(&rows)
        .map(|(game, r)| Favorite {
            game,
            favorited_at: rfc3339(r.at),
        })
        .collect();
    Ok(Json(PageBody { items, next_cursor }))
}

fn next_key(rows: &mut Vec<Timed>, limit: i64) -> Option<String> {
    if rows.len() as i64 > limit {
        rows.truncate(limit as usize);
        rows.last()
            .map(|r| Cursor::key_for(r.at, r.game.id).encode())
    } else {
        None
    }
}

/// `addFavorite` (idempotent; at most 1,000).
pub async fn add_favorite(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
) -> ApiResult<StatusCode> {
    let band = crate::viewer_band(&state, Some(&viewer)).await?;
    super::viewable(&state.db, game_id, &labels_for(band), Some(viewer.user_id))
        .await?
        .ok_or_else(Problem::not_found)?;
    let mut tx = state.db.begin().await?;
    // Serialise this user's favourite writes so the cap cannot be raced past.
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('favorites:' || $1::text, 0))")
        .bind(viewer.user_id)
        .execute(&mut *tx)
        .await?;
    let (exists, count): (bool, i64) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM games.favorites WHERE user_id = $1 AND game_id = $2), \
                (SELECT count(*) FROM games.favorites WHERE user_id = $1)",
    )
    .bind(viewer.user_id)
    .bind(game_id)
    .fetch_one(&mut *tx)
    .await?;
    if !exists {
        if count >= MAX_FAVORITES {
            return Err(
                Problem::conflict("favorite_limit_reached", "Favourites full")
                    .with_detail("You can keep up to 1,000 favourites. Remove some first."),
            );
        }
        sqlx::query(
            "INSERT INTO games.favorites (user_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(viewer.user_id)
        .bind(game_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `removeFavorite` (idempotent).
pub async fn remove_favorite(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
) -> ApiResult<StatusCode> {
    sqlx::query("DELETE FROM games.favorites WHERE user_id = $1 AND game_id = $2")
        .bind(viewer.user_id)
        .bind(game_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    game: GameSummary,
    last_played_at: String,
    minutes_played: i64,
}

/// `listPlayHistory`
pub async fn list_history(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<PageQuery>,
) -> ApiResult<Json<PageBody<HistoryEntry>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let band = crate::viewer_band(&state, Some(&viewer)).await?;
    let mut rows: Vec<Timed> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {GAME_COLUMNS}, h.last_played_at AS at, h.seconds \
         FROM games.play_history h JOIN games.games g ON g.id = h.game_id LEFT JOIN games.rating_totals r ON r.game_id = g.id \
         WHERE h.user_id = $1 AND NOT h.hidden AND g.status = 'public' AND g.content_label = ANY($2) \
           AND ($3::timestamptz IS NULL OR (h.last_played_at, h.game_id) < ($3, $4)) \
         ORDER BY h.last_played_at DESC, h.game_id DESC LIMIT $5"
    )))
    .bind(viewer.user_id)
    .bind(labels_for(band))
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = next_key(&mut rows, page.limit);
    let games: Vec<GameRow> = rows.iter().map(|r| r.game.clone()).collect();
    let items = summaries(&state, &games)
        .await?
        .into_iter()
        .zip(&rows)
        .map(|(game, r)| HistoryEntry {
            game,
            last_played_at: rfc3339(r.at),
            minutes_played: r.seconds / 60,
        })
        .collect();
    Ok(Json(PageBody { items, next_cursor }))
}

/// `removePlayHistoryEntry`: hides the game from history and from recommendations.
pub async fn remove_history(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(game_id): IdPath,
) -> ApiResult<StatusCode> {
    sqlx::query("UPDATE games.play_history SET hidden = true WHERE user_id = $1 AND game_id = $2")
        .bind(viewer.user_id)
        .bind(game_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
