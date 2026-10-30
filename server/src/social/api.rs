//! Friends, friend requests, blocks and presence endpoints.

use std::collections::HashSet;

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use super::{MAX_FRIENDS, audience_allows};
use crate::{
    AppState,
    http::{ApiJson, ApiQuery, Cursor, IdPath, Page, parse_id_list, rfc3339, rfc3339_opt},
    identity::{
        AgeBand, UserSummary,
        auth::{MaybeViewer, Viewer, limit},
    },
    matchmaker::{Items, PageBody},
    problem::{ApiResult, Problem},
    services::{Activity, Limit},
};

const FRIEND_REQUEST_LIMIT: Limit = Limit::per_hour("friend_request", 30);

// ------------------------------------------------------------------ presence

#[derive(Debug, Clone, Serialize)]
pub struct GameRef {
    pub id: String,
    pub name: String,
}

/// The `Presence` schema.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub user_id: String,
    pub status: &'static str,
    pub game: Option<GameRef>,
    pub joinable: bool,
    pub last_online_at: Option<String>,
}

impl Presence {
    fn offline(id: i64, last: Option<OffsetDateTime>) -> Self {
        Self {
            user_id: id.to_string(),
            status: "offline",
            game: None,
            joinable: false,
            last_online_at: rfc3339_opt(last),
        }
    }
}

/// Presence of `targets` as `viewer` may see it: hidden by privacy or a block reads as offline with no time.
pub async fn presence_for(
    state: &AppState,
    viewer: Option<i64>,
    targets: &[i64],
) -> ApiResult<Vec<Presence>> {
    let friends: HashSet<i64> = match viewer {
        Some(v) => super::friend_ids(&state.db, v).await?.into_iter().collect(),
        None => HashSet::new(),
    };
    let hidden: HashSet<i64> = match viewer {
        Some(v) => super::hidden_for(&state.db, v).await?.into_iter().collect(),
        None => HashSet::new(),
    };
    let privacy = super::privacy_many(&state.db, targets).await?;
    let records = state.presence.get_many(targets).await;
    let game_ids: Vec<i64> = records
        .iter()
        .filter_map(|r| match r.activity {
            Some(Activity::InGame { game_id, .. }) => Some(game_id),
            _ => None,
        })
        .collect();
    let names = crate::games::names(&state.db, &game_ids).await?;
    Ok(targets
        .iter()
        .zip(records)
        .map(|(&id, rec)| {
            let is_self = viewer == Some(id);
            let friend = friends.contains(&id);
            let Some(p) = privacy.get(&id) else {
                return Presence::offline(id, None);
            };
            if hidden.contains(&id) || !audience_allows(&p.presence_visibility, is_self, friend) {
                return Presence::offline(id, None);
            }
            match rec.activity {
                None => Presence::offline(id, rec.last_online_at),
                Some(Activity::Online) => Presence {
                    user_id: id.to_string(),
                    status: "online",
                    game: None,
                    joinable: false,
                    last_online_at: None,
                },
                Some(Activity::InStudio) => Presence {
                    user_id: id.to_string(),
                    status: "in_studio",
                    game: None,
                    joinable: false,
                    last_online_at: None,
                },
                Some(Activity::InGame { game_id, .. }) => Presence {
                    user_id: id.to_string(),
                    status: "in_game",
                    game: names.get(&game_id).map(|n| GameRef {
                        id: game_id.to_string(),
                        name: n.clone(),
                    }),
                    joinable: viewer.is_some()
                        && !is_self
                        && audience_allows(&p.join_policy, false, friend),
                    last_online_at: None,
                },
            }
        })
        .collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceQuery {
    user_ids: Option<String>,
}

/// `getPresence`
pub async fn get_presence(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<PresenceQuery>,
) -> ApiResult<Json<Items<Presence>>> {
    let ids = parse_id_list("userIds", q.user_ids.as_deref(), 100)?;
    Ok(Json(Items {
        items: presence_for(&state, Some(viewer.user_id), &ids).await?,
    }))
}

// ------------------------------------------------------------------ friends

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    user: UserSummary,
    since: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    presence: Option<Presence>,
}

#[derive(Deserialize)]
pub struct PageQuery {
    limit: Option<String>,
    cursor: Option<String>,
    direction: Option<String>,
}

/// `listFriends`: own list always; a minor's list only for their friends; an adult's list for everyone.
pub async fn list_friends(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(user_id): IdPath,
    ApiQuery(q): ApiQuery<PageQuery>,
) -> ApiResult<Json<PageBody<Friend>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let target = crate::identity::basic(&state.db, user_id)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(Problem::not_found)?;
    let viewer_id = viewer.as_ref().map(|v| v.user_id);
    let is_self = viewer_id == Some(user_id);
    if let Some(v) = viewer_id
        && !is_self
    {
        let (a, b) = super::blocks_between(&state.db, v, user_id).await?;
        if b {
            return Err(Problem::not_found());
        }
        if a {
            return Err(Problem::forbidden("privacy_restricted", "Not allowed"));
        }
    }
    if !is_self && target.band() != AgeBand::Adult {
        let friend = match viewer_id {
            Some(v) => super::are_friends(&state.db, v, user_id).await?,
            None => false,
        };
        if !friend {
            return Err(Problem::forbidden("privacy_restricted", "Not allowed")
                .with_detail("This friend list is private."));
        }
    }
    let mut all = super::friends_since(&state.db, user_id).await?;
    let people =
        crate::identity::basics(&state.db, &all.iter().map(|f| f.0).collect::<Vec<_>>()).await?;
    let hidden: HashSet<i64> = match viewer_id {
        Some(v) => super::hidden_for(&state.db, v).await?.into_iter().collect(),
        None => HashSet::new(),
    };
    all.retain(|(id, _)| people.contains_key(id) && !hidden.contains(id));
    if is_self {
        all.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));
    } else {
        all.sort_by(|a, b| {
            people[&a.0]
                .username
                .to_lowercase()
                .cmp(&people[&b.0].username.to_lowercase())
        });
    }
    let total = all.len() as i64;
    let slice: Vec<(i64, OffsetDateTime)> = all
        .into_iter()
        .skip(offset as usize)
        .take(page.limit as usize)
        .collect();
    let ids: Vec<i64> = slice.iter().map(|f| f.0).collect();
    let presences = presence_for(&state, viewer_id, &ids).await?;
    let mut items: Vec<Friend> = slice
        .iter()
        .zip(presences)
        .map(|((id, since), p)| Friend {
            user: people[id].summary(),
            since: rfc3339(*since),
            presence: Some(p),
        })
        .collect();
    if is_self {
        // Most recently active first for the owner (spec: "most recently active first").
        items.sort_by_key(|f| match f.presence.as_ref().map(|p| p.status) {
            Some("in_game") => 0,
            Some("online" | "in_studio") => 1,
            _ => 2,
        });
    }
    let next = offset + page.limit;
    let next_cursor = (total > next).then(|| Cursor::Offset(next).encode());
    Ok(Json(PageBody { items, next_cursor }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRequestBody {
    id: String,
    user: UserSummary,
    mutual_friends: i64,
    created_at: String,
}

/// `listFriendRequests`
pub async fn list_requests(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<PageQuery>,
) -> ApiResult<Json<PageBody<FriendRequestBody>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let incoming = match q.direction.as_deref() {
        None | Some("") | Some("incoming") => true,
        Some("outgoing") => false,
        Some(_) => {
            return Err(Problem::invalid(
                "direction",
                "invalid",
                "Use incoming or outgoing.",
            ));
        }
    };
    let (mine, other) = if incoming {
        ("to_user", "from_user")
    } else {
        ("from_user", "to_user")
    };
    let mut rows: Vec<(i64, i64, OffsetDateTime)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT id, {other}, created_at FROM social.friend_requests WHERE {mine} = $1 \
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3)) ORDER BY created_at DESC, id DESC LIMIT $4"
    )))
    .bind(viewer.user_id)
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = if rows.len() as i64 > page.limit {
        rows.truncate(page.limit as usize);
        rows.last().map(|r| Cursor::key_for(r.2, r.0).encode())
    } else {
        None
    };
    let people =
        crate::identity::basics(&state.db, &rows.iter().map(|r| r.1).collect::<Vec<_>>()).await?;
    let mut items = Vec::with_capacity(rows.len());
    for (id, other, created_at) in rows {
        if let Some(u) = people.get(&other) {
            items.push(FriendRequestBody {
                id: id.to_string(),
                user: u.summary(),
                mutual_friends: super::mutual_count(&state.db, viewer.user_id, other).await?,
                created_at: rfc3339(created_at),
            });
        }
    }
    Ok(Json(PageBody { items, next_cursor }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequest {
    user_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
}

/// `sendFriendRequest` (spec 9.2: limit 500, privacy, blocks, mutual requests become friendships).
pub async fn send_request(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(body): ApiJson<SendRequest>,
) -> ApiResult<(StatusCode, Json<SendResult>)> {
    let target_id = body
        .user_id
        .as_deref()
        .and_then(crate::ids::parse_id)
        .ok_or_else(|| Problem::invalid("userId", "invalid", "Not a user id."))?;
    limit(&state, FRIEND_REQUEST_LIMIT, &viewer.user_id.to_string()).await?;
    let me = crate::identity::basic(&state.db, viewer.user_id)
        .await?
        .ok_or_else(Problem::unauthorized)?;
    if target_id == me.id {
        return Err(Problem::invalid(
            "userId",
            "self",
            "You cannot add yourself.",
        ));
    }
    let target = crate::identity::basic(&state.db, target_id)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(|| Problem::invalid("userId", "not_found", "No such user."))?;
    if !me.is_verified() {
        return Err(
            Problem::forbidden("email_unverified", "Confirm your email first")
                .with_detail("Verified accounts can add friends."),
        );
    }
    if me.status == "limited" {
        return Err(Problem::forbidden("account_limited", "Not available yet")
            .with_detail("Your account is waiting for approval."));
    }
    let (i_blocked, they_blocked) = super::blocks_between(&state.db, me.id, target.id).await?;
    if i_blocked {
        return Err(Problem::forbidden("user_blocked", "You blocked this user")
            .with_detail("Unblock them first."));
    }
    if they_blocked {
        // Silently succeed without sending (the contract says so), so a block cannot be detected.
        return Ok((
            StatusCode::CREATED,
            Json(SendResult {
                status: "pending",
                request_id: None,
            }),
        ));
    }
    if super::are_friends(&state.db, me.id, target.id).await? {
        return Ok((
            StatusCode::CREATED,
            Json(SendResult {
                status: "friends",
                request_id: None,
            }),
        ));
    }

    let mut tx = state.db.begin().await?;
    let reverse: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM social.friend_requests WHERE from_user = $1 AND to_user = $2 FOR UPDATE",
    )
    .bind(target.id)
    .bind(me.id)
    .fetch_optional(&mut *tx)
    .await?;
    if super::friend_count(&mut *tx, me.id).await? >= MAX_FRIENDS
        || super::friend_count(&mut *tx, target.id).await? >= MAX_FRIENDS
    {
        return Err(
            Problem::forbidden("friend_limit_reached", "Friend limit reached")
                .with_detail("Each account can have up to 500 friends."),
        );
    }
    if reverse.is_some() {
        super::make_friends(&mut tx, me.id, target.id).await?;
        tx.commit().await?;
        return Ok((
            StatusCode::CREATED,
            Json(SendResult {
                status: "friends",
                request_id: None,
            }),
        ));
    }
    // The target's setting, and under-13 senders only reach friends of friends (no strangers either way).
    let privacy = super::settings(&mut *tx, target.id, target.band())
        .await?
        .privacy;
    let mutual = super::mutual_count(&mut *tx, me.id, target.id).await? > 0;
    let allowed = match privacy.friend_requests.as_str() {
        "everyone" => true,
        "friends_of_friends" => mutual,
        _ => false,
    } && (me.band() != AgeBand::Under13 || mutual);
    if !allowed {
        return Err(
            Problem::forbidden("requests_not_allowed", "Cannot send a request")
                .with_detail("This player only takes requests from people they know."),
        );
    }
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM social.friend_requests WHERE from_user = $1 AND to_user = $2",
    )
    .bind(me.id)
    .bind(target.id)
    .fetch_optional(&mut *tx)
    .await?;
    let id = match existing {
        Some(id) => id,
        None => {
            let id = state.ids.next();
            sqlx::query("INSERT INTO social.friend_requests (id, from_user, to_user) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
                .bind(id)
                .bind(me.id)
                .bind(target.id)
                .execute(&mut *tx)
                .await?;
            id
        }
    };
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(SendResult {
            status: "pending",
            request_id: Some(id.to_string()),
        }),
    ))
}

/// `acceptFriendRequest`
pub async fn accept_request(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(request_id): IdPath,
) -> ApiResult<Json<Friend>> {
    let mut tx = state.db.begin().await?;
    let from: Option<i64> = sqlx::query_scalar(
        "SELECT from_user FROM social.friend_requests WHERE id = $1 AND to_user = $2 FOR UPDATE",
    )
    .bind(request_id)
    .bind(viewer.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let from = from.ok_or_else(Problem::not_found)?;
    let other = crate::identity::basic(&mut *tx, from)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(Problem::not_found)?;
    if super::friend_count(&mut *tx, viewer.user_id).await? >= MAX_FRIENDS
        || super::friend_count(&mut *tx, from).await? >= MAX_FRIENDS
    {
        return Err(Problem::forbidden(
            "friend_limit_reached",
            "Friend limit reached",
        ));
    }
    let since = super::make_friends(&mut tx, viewer.user_id, from).await?;
    tx.commit().await?;
    let presence = presence_for(&state, Some(viewer.user_id), &[from])
        .await?
        .pop();
    Ok(Json(Friend {
        user: other.summary(),
        since: rfc3339(since),
        presence,
    }))
}

/// `deleteFriendRequest`: decline incoming or cancel outgoing.
pub async fn delete_request(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(request_id): IdPath,
) -> ApiResult<StatusCode> {
    let n = sqlx::query(
        "DELETE FROM social.friend_requests WHERE id = $1 AND (from_user = $2 OR to_user = $2)",
    )
    .bind(request_id)
    .bind(viewer.user_id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        Err(Problem::not_found())
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

/// `removeFriend`
pub async fn remove_friend(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(user_id): IdPath,
) -> ApiResult<StatusCode> {
    let mut conn = state.db.acquire().await?;
    if super::unfriend(&mut conn, viewer.user_id, user_id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Problem::not_found())
    }
}

/// `listBlocks`
pub async fn list_blocks(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<PageQuery>,
) -> ApiResult<Json<PageBody<UserSummary>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let mut rows: Vec<(i64, OffsetDateTime)> = sqlx::query_as(
        "SELECT blocked, created_at FROM social.blocks WHERE blocker = $1 \
         AND ($2::timestamptz IS NULL OR (created_at, blocked) < ($2, $3)) ORDER BY created_at DESC, blocked DESC LIMIT $4",
    )
    .bind(viewer.user_id)
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = if rows.len() as i64 > page.limit {
        rows.truncate(page.limit as usize);
        rows.last().map(|r| Cursor::key_for(r.1, r.0).encode())
    } else {
        None
    };
    let items =
        crate::identity::summaries(&state.db, &rows.iter().map(|r| r.0).collect::<Vec<_>>())
            .await?;
    Ok(Json(PageBody { items, next_cursor }))
}

/// `blockUser`: also ends friendship and pending requests both ways.
pub async fn block_user(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(user_id): IdPath,
) -> ApiResult<StatusCode> {
    if user_id == viewer.user_id {
        return Err(Problem::not_found());
    }
    crate::identity::basic(&state.db, user_id)
        .await?
        .filter(|u| u.is_visible())
        .ok_or_else(Problem::not_found)?;
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO social.blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(viewer.user_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    super::unfriend(&mut tx, viewer.user_id, user_id).await?;
    sqlx::query("DELETE FROM social.friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)")
        .bind(viewer.user_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `unblockUser` (friendship is not restored).
pub async fn unblock_user(
    State(state): State<AppState>,
    viewer: Viewer,
    IdPath(user_id): IdPath,
) -> ApiResult<StatusCode> {
    sqlx::query("DELETE FROM social.blocks WHERE blocker = $1 AND blocked = $2")
        .bind(viewer.user_id)
        .bind(user_id)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
