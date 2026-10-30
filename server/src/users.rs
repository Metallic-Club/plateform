//! Profile endpoints: own account, settings, social links, public profiles and people search.

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;

use crate::{
    AppState, crypto,
    http::{ApiJson, ApiQuery, IdPath, Page, rfc3339, rfc3339_opt},
    identity::{
        AgeBand, UserBasic, UserSummary,
        auth::{MaybeViewer, Viewer},
        names,
    },
    matchmaker::PageBody,
    problem::{ApiResult, Problem, Validator},
    social::{self, Settings, SocialLink, api::Presence, audience_allows},
    text,
};

/// The `UserProfile` schema.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    id: String,
    username: String,
    display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    bio: Option<String>,
    avatar_headshot_url: Option<String>,
    created_at: String,
    friend_count: i64,
    is_first_party: bool,
    social_links: Vec<SocialLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    relationship: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    presence: Option<Presence>,
}

#[derive(Serialize)]
pub struct Verification {
    status: &'static str,
    #[serde(rename = "deleteAfter")]
    delete_after: Option<String>,
}

/// The `Me` schema.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Me {
    #[serde(flatten)]
    profile: UserProfile,
    email_masked: String,
    verification: Verification,
    age_band: &'static str,
    account_status: &'static str,
    settings: Settings,
}

async fn me_body(state: &AppState, user_id: i64) -> ApiResult<Me> {
    let u = crate::identity::basic(&state.db, user_id)
        .await?
        .ok_or_else(Problem::unauthorized)?;
    let (email_ct, delete_after): (Option<Vec<u8>>, Option<OffsetDateTime>) =
        sqlx::query_as("SELECT email_ciphertext, delete_after FROM identity.users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;
    let email = email_ct
        .and_then(|c| crypto::decrypt(&state.secrets.data_key, "email", &c))
        .and_then(|b| String::from_utf8(b).ok())
        .map(|e| crypto::mask_email(&e))
        .unwrap_or_else(|| "***".into());
    let band = u.band();
    let settings = social::settings(&state.db, user_id, band).await?;
    let profile = UserProfile {
        id: u.id.to_string(),
        username: u.username.clone(),
        display_name: u.display_name.clone(),
        bio: Some(u.bio.clone()),
        avatar_headshot_url: u.avatar_headshot_url.clone(),
        created_at: rfc3339(u.created_at),
        friend_count: social::friend_count(&state.db, user_id).await?,
        is_first_party: u.is_first_party,
        social_links: social::social_links(&state.db, user_id).await?,
        relationship: Some("self"),
        presence: social::api::presence_for(state, Some(user_id), &[user_id])
            .await?
            .pop(),
    };
    Ok(Me {
        profile,
        email_masked: email,
        verification: Verification {
            status: if u.is_verified() {
                "verified"
            } else {
                "unverified"
            },
            delete_after: if u.is_verified() {
                None
            } else {
                rfc3339_opt(delete_after)
            },
        },
        age_band: band.as_str(),
        account_status: match u.status.as_str() {
            "limited" => "limited",
            "suspended" => "suspended",
            _ => "active",
        },
        settings,
    })
}

/// `getMe`
pub async fn get_me(State(state): State<AppState>, viewer: Viewer) -> ApiResult<Json<Me>> {
    Ok(Json(me_body(&state, viewer.user_id).await?))
}

/// `updateMe`: display name (changeable once every 7 days) and bio, both filtered.
pub async fn update_me(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(body): ApiJson<Value>,
) -> ApiResult<Json<Me>> {
    let obj = body
        .as_object()
        .ok_or_else(|| Problem::bad_request("Send a JSON object."))?;
    let display = obj.get("displayName");
    let bio = obj.get("bio");
    if display.is_none() && bio.is_none() {
        return Err(Problem::invalid(
            "displayName",
            "required",
            "Change at least one field.",
        ));
    }
    let me = crate::identity::basic(&state.db, viewer.user_id)
        .await?
        .ok_or_else(Problem::unauthorized)?;
    let mut v = Validator::new();
    let new_display = match display {
        None => None,
        Some(Value::String(s)) => match text::single_line(s, 1, 32) {
            Ok(clean) => Some(clean),
            Err(code) => {
                v.add(
                    "displayName",
                    code,
                    "Use 1 to 32 characters without hidden symbols.",
                );
                None
            }
        },
        Some(_) => {
            v.add("displayName", "invalid", "Must be text.");
            None
        }
    };
    let new_bio = match bio {
        None => None,
        Some(Value::String(s)) => {
            match text::multi_line(s, 1000, me.band() == AgeBand::Under13) {
                Ok(clean) => Some(clean),
                Err(code) => {
                    v.add("bio", code, "Use up to 1,000 characters; no links or contact details for players under 13.");
                    None
                }
            }
        }
        Some(_) => {
            v.add("bio", "invalid", "Must be text.");
            None
        }
    };
    v.finish()?;

    let mut tx = state.db.begin().await?;
    if let Some(name) = new_display.filter(|n| *n != me.display_name) {
        let last: Option<OffsetDateTime> = sqlx::query_scalar(
            "SELECT display_name_changed_at FROM identity.users WHERE id = $1 FOR UPDATE",
        )
        .bind(me.id)
        .fetch_one(&mut *tx)
        .await?;
        if let Some(last) = last {
            let wait = time::Duration::days(7) - (OffsetDateTime::now_utc() - last);
            if wait.is_positive() {
                return Err(Problem::rate_limited(wait.whole_seconds().max(1) as u64)
                    .with_detail("Display names can change once every 7 days."));
            }
        }
        sqlx::query("UPDATE identity.users SET display_name = $2, display_name_changed_at = now() WHERE id = $1")
            .bind(me.id)
            .bind(name)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(bio) = new_bio {
        sqlx::query("UPDATE identity.users SET bio = $2 WHERE id = $1")
            .bind(me.id)
            .bind(bio)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(me_body(&state, viewer.user_id).await?))
}

/// `getSettings`
pub async fn get_settings(
    State(state): State<AppState>,
    viewer: Viewer,
) -> ApiResult<Json<Settings>> {
    let band = crate::viewer_band(&state, Some(&viewer))
        .await?
        .unwrap_or(AgeBand::Unknown);
    Ok(Json(
        social::settings(&state.db, viewer.user_id, band).await?,
    ))
}

/// `updateSettings`: under-13 privacy is capped (the response shows what was applied).
pub async fn update_settings(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(body): ApiJson<Value>,
) -> ApiResult<Json<Settings>> {
    let obj = body
        .as_object()
        .filter(|o| !o.is_empty())
        .ok_or_else(|| Problem::invalid("theme", "required", "Change at least one setting."))?;
    let band = crate::viewer_band(&state, Some(&viewer))
        .await?
        .unwrap_or(AgeBand::Unknown);
    let mut s = social::settings(&state.db, viewer.user_id, band).await?;
    let mut v = Validator::new();
    let str_of = |key: &str, val: &Value, allowed: &[&str], v: &mut Validator| -> Option<String> {
        match val.as_str() {
            Some(x) if allowed.contains(&x) => Some(x.to_owned()),
            _ => {
                v.add(
                    key,
                    "invalid",
                    format!("Use one of: {}.", allowed.join(", ")),
                );
                None
            }
        }
    };
    if let Some(t) = obj.get("theme").and_then(|t| {
        str_of(
            "theme",
            t,
            &["system", "graphite", "titanium", "light"],
            &mut v,
        )
    }) {
        s.theme = t;
    }
    if let Some(lang) = obj.get("language") {
        match lang.as_str() {
            Some(l) if valid_language(l) => s.language = l.to_owned(),
            _ => v.add(
                "language",
                "invalid",
                "Use a language tag such as en or pt-BR.",
            ),
        }
    }
    if let Some(p) = obj.get("privacy") {
        match p.as_object().filter(|o| !o.is_empty()) {
            None => v.add("privacy", "invalid", "Change at least one privacy setting."),
            Some(p) => {
                let aud = ["everyone", "friends", "nobody"];
                if let Some(x) = p
                    .get("presenceVisibility")
                    .and_then(|x| str_of("privacy.presenceVisibility", x, &aud, &mut v))
                {
                    s.privacy.presence_visibility = x;
                }
                if let Some(x) = p
                    .get("joinPolicy")
                    .and_then(|x| str_of("privacy.joinPolicy", x, &aud, &mut v))
                {
                    s.privacy.join_policy = x;
                }
                if let Some(x) = p.get("friendRequests").and_then(|x| {
                    str_of(
                        "privacy.friendRequests",
                        x,
                        &["everyone", "friends_of_friends", "nobody"],
                        &mut v,
                    )
                }) {
                    s.privacy.friend_requests = x;
                }
                if let Some(x) = p
                    .get("socialLinksVisibility")
                    .and_then(|x| str_of("privacy.socialLinksVisibility", x, &aud, &mut v))
                {
                    s.privacy.social_links_visibility = x;
                }
            }
        }
    }
    v.finish()?;
    s.privacy = social::cap_privacy(band, s.privacy);
    social::save_settings(&state.db, viewer.user_id, &s).await?;
    Ok(Json(s))
}

fn valid_language(l: &str) -> bool {
    let b = l.as_bytes();
    match b.len() {
        2 => b.iter().all(u8::is_ascii_lowercase),
        5 => {
            b[..2].iter().all(u8::is_ascii_lowercase)
                && b[2] == b'-'
                && b[3..].iter().all(u8::is_ascii_uppercase)
        }
        _ => false,
    }
}

#[derive(Deserialize)]
pub struct LinksRequest {
    links: Option<Vec<LinkInput>>,
}

#[derive(Deserialize)]
pub struct LinkInput {
    platform: Option<String>,
    handle: Option<String>,
}

/// `replaceSocialLinks`: 16+ only (spec 9.2); handles only, the server builds URLs.
pub async fn replace_links(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiJson(body): ApiJson<LinksRequest>,
) -> ApiResult<Json<Vec<SocialLink>>> {
    let links = body
        .links
        .ok_or_else(|| Problem::invalid("links", "required", "Send the list of links."))?;
    let band = crate::viewer_band(&state, Some(&viewer))
        .await?
        .unwrap_or(AgeBand::Unknown);
    if band.is_under_16() {
        return Err(
            Problem::forbidden("age_restricted", "Not available for your age")
                .with_detail("Social links are for players 16 and older."),
        );
    }
    if links.len() > 8 {
        return Err(Problem::invalid(
            "links",
            "too_many",
            "Add at most 8 links.",
        ));
    }
    let mut v = Validator::new();
    let mut clean: Vec<(String, String)> = Vec::new();
    for (i, link) in links.iter().enumerate() {
        let platform = link.platform.clone().unwrap_or_default();
        let handle = link.handle.clone().unwrap_or_default();
        if ![
            "discord",
            "youtube",
            "twitch",
            "tiktok",
            "x",
            "bluesky",
            "instagram",
            "github",
        ]
        .contains(&platform.as_str())
        {
            v.add(
                &format!("links[{i}].platform"),
                "invalid",
                "Unknown platform.",
            );
            continue;
        }
        if clean.iter().any(|(p, _)| *p == platform) {
            v.add(
                &format!("links[{i}].platform"),
                "duplicate",
                "One link per platform.",
            );
            continue;
        }
        match social::normalize_handle(&platform, &handle) {
            Some(h) if !text::is_offensive(&h) => clean.push((platform, h)),
            _ => v.add(
                &format!("links[{i}].handle"),
                "invalid",
                "That is not a valid handle for this platform.",
            ),
        }
    }
    v.finish()?;
    let mut tx = state.db.begin().await?;
    social::replace_social_links(&mut tx, viewer.user_id, &clean).await?;
    tx.commit().await?;
    Ok(Json(social::social_links(&state.db, viewer.user_id).await?))
}

/// A profile as `viewer` may see it. None = hidden (blocked by the target, or not visible).
async fn profile_for(
    state: &AppState,
    viewer: Option<&Viewer>,
    u: &UserBasic,
) -> ApiResult<Option<UserProfile>> {
    if !u.is_visible() {
        return Ok(None);
    }
    let viewer_id = viewer.map(|v| v.user_id);
    let is_self = viewer_id == Some(u.id);
    let (relationship, friend) = match viewer_id {
        Some(v) if !is_self => {
            if social::blocks_between(&state.db, v, u.id).await?.1 {
                return Ok(None);
            }
            let r = social::relationship(&state.db, v, u.id).await?;
            (Some(r), r == "friend")
        }
        Some(_) => (Some("self"), false),
        None => (None, false),
    };
    let band = u.band();
    let settings = social::settings(&state.db, u.id, band).await?;
    // Links: 16+ only, and only to the audience the owner chose.
    let links = if !band.is_under_16()
        && audience_allows(&settings.privacy.social_links_visibility, is_self, friend)
    {
        social::social_links(&state.db, u.id).await?
    } else {
        Vec::new()
    };
    // Under-13 bios are for friends only.
    let bio = (band != AgeBand::Under13 || is_self || friend).then(|| u.bio.clone());
    let presence = match viewer_id {
        Some(_) => social::api::presence_for(state, viewer_id, &[u.id])
            .await?
            .pop(),
        None => None,
    };
    Ok(Some(UserProfile {
        id: u.id.to_string(),
        username: u.username.clone(),
        display_name: u.display_name.clone(),
        bio,
        avatar_headshot_url: u.avatar_headshot_url.clone(),
        created_at: rfc3339(u.created_at),
        friend_count: social::friend_count(&state.db, u.id).await?,
        is_first_party: u.is_first_party,
        social_links: links,
        relationship,
        presence,
    }))
}

/// `getUser`
pub async fn get_user(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    IdPath(id): IdPath,
) -> ApiResult<Json<UserProfile>> {
    let u = crate::identity::basic(&state.db, id)
        .await?
        .ok_or_else(Problem::not_found)?;
    profile_for(&state, viewer.as_ref(), &u)
        .await?
        .map(Json)
        .ok_or_else(Problem::not_found)
}

/// `getUserByUsername`
pub async fn get_user_by_username(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    axum::extract::Path(username): axum::extract::Path<String>,
) -> ApiResult<Json<UserProfile>> {
    if !names::valid_format(&username) {
        return Err(Problem::not_found());
    }
    let u = crate::identity::basic_by_username(&state.db, &username)
        .await?
        .ok_or_else(Problem::not_found)?;
    profile_for(&state, viewer.as_ref(), &u)
        .await?
        .map(Json)
        .ok_or_else(Problem::not_found)
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

/// `searchUsers`: under-13 accounts only appear to their friends; blocked users never appear.
pub async fn search_users(
    State(state): State<AppState>,
    MaybeViewer(viewer): MaybeViewer,
    ApiQuery(q): ApiQuery<SearchQuery>,
) -> ApiResult<Json<PageBody<UserSummary>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let offset = page.offset()?;
    let text = q.q.unwrap_or_default().trim().to_owned();
    let len = text.chars().count();
    if !(3..=32).contains(&len) {
        return Err(Problem::invalid(
            "q",
            "invalid",
            "Search with 3 to 32 characters.",
        ));
    }
    let viewer_id = viewer.as_ref().map(|v| v.user_id);
    let (friends, hidden) = match viewer_id {
        Some(v) => (
            social::friend_ids(&state.db, v).await?,
            social::hidden_for(&state.db, v).await?,
        ),
        None => (Vec::new(), Vec::new()),
    };
    // Over-fetch so filtering minors and blocks still fills the page; the cursor resumes after the last row used.
    let fetch = (page.limit + 1) * 2;
    let raw = crate::identity::search(&state.db, &text, fetch, offset).await?;
    let eligible = |u: &UserBasic| {
        !hidden.contains(&u.id)
            && (u.band() != AgeBand::Under13 || friends.contains(&u.id) || Some(u.id) == viewer_id)
    };
    let mut rows: Vec<&UserBasic> = Vec::new();
    let mut consumed = 0usize;
    for (i, u) in raw.iter().enumerate() {
        if rows.len() as i64 == page.limit {
            break;
        }
        consumed = i + 1;
        if eligible(u) {
            rows.push(u);
        }
    }
    let more = raw.len() as i64 == fetch || raw[consumed..].iter().any(eligible);
    let next = offset + consumed as i64;
    let next_cursor = (more && next <= crate::http::MAX_OFFSET)
        .then(|| crate::http::Cursor::Offset(next).encode());
    Ok(Json(PageBody {
        items: rows.into_iter().map(UserBasic::summary).collect(),
        next_cursor,
    }))
}
