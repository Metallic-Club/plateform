//! social: friends, requests, blocks, privacy settings and social links. Presence lives in [`crate::services`].
//! Defaults are private for minors (spec 9.2, CLAUDE.md "Children"); under-13 privacy is capped server-side.

pub mod api;

use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgExecutor};

use crate::{identity::AgeBand, problem::ApiResult};

/// Friend limit (spec 9.2, assistant's call).
pub const MAX_FRIENDS: i64 = 500;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Privacy {
    pub presence_visibility: String,
    pub join_policy: String,
    pub friend_requests: String,
    pub social_links_visibility: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Settings {
    pub theme: String,
    pub language: String,
    pub privacy: Privacy,
}

/// Defaults per age band. Everyone starts with friends-only presence and joins; under-13s also start with
/// friend requests from friends of friends only and hidden social links.
pub fn default_privacy(band: AgeBand) -> Privacy {
    let minor = band.is_under_16();
    Privacy {
        presence_visibility: "friends".into(),
        join_policy: "friends".into(),
        friend_requests: if band == AgeBand::Under13 || band == AgeBand::Unknown {
            "friends_of_friends"
        } else {
            "everyone"
        }
        .into(),
        social_links_visibility: if minor { "nobody" } else { "friends" }.into(),
    }
}

/// Caps privacy for under-13 accounts (and unknown ages): nothing visible to everyone, no requests from strangers.
pub fn cap_privacy(band: AgeBand, mut p: Privacy) -> Privacy {
    if matches!(band, AgeBand::Under13 | AgeBand::Unknown) {
        for field in [
            &mut p.presence_visibility,
            &mut p.join_policy,
            &mut p.social_links_visibility,
        ] {
            if field == "everyone" {
                *field = "friends".into();
            }
        }
        if p.friend_requests == "everyone" {
            p.friend_requests = "friends_of_friends".into();
        }
    }
    p
}

pub async fn create_default_settings(
    conn: &mut PgConnection,
    user_id: i64,
    band: AgeBand,
) -> ApiResult<()> {
    let p = default_privacy(band);
    sqlx::query(
        "INSERT INTO social.user_settings (user_id, presence_visibility, join_policy, friend_requests, social_links_visibility) \
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(&p.presence_visibility)
    .bind(&p.join_policy)
    .bind(&p.friend_requests)
    .bind(&p.social_links_visibility)
    .execute(conn)
    .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct SettingsRow {
    theme: String,
    language: String,
    presence_visibility: String,
    join_policy: String,
    friend_requests: String,
    social_links_visibility: String,
}

pub async fn settings(db: impl PgExecutor<'_>, user_id: i64, band: AgeBand) -> ApiResult<Settings> {
    let row: Option<SettingsRow> = sqlx::query_as(
        "SELECT theme, language, presence_visibility, join_policy, friend_requests, social_links_visibility \
         FROM social.user_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(match row {
        Some(r) => Settings {
            theme: r.theme,
            language: r.language,
            privacy: cap_privacy(
                band,
                Privacy {
                    presence_visibility: r.presence_visibility,
                    join_policy: r.join_policy,
                    friend_requests: r.friend_requests,
                    social_links_visibility: r.social_links_visibility,
                },
            ),
        },
        None => Settings {
            theme: "graphite".into(),
            language: "en".into(),
            privacy: default_privacy(band),
        },
    })
}

pub async fn save_settings(db: impl PgExecutor<'_>, user_id: i64, s: &Settings) -> ApiResult<()> {
    sqlx::query(
        "INSERT INTO social.user_settings (user_id, theme, language, presence_visibility, join_policy, friend_requests, social_links_visibility) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme, language = EXCLUDED.language, \
             presence_visibility = EXCLUDED.presence_visibility, join_policy = EXCLUDED.join_policy, \
             friend_requests = EXCLUDED.friend_requests, social_links_visibility = EXCLUDED.social_links_visibility, \
             updated_at = now()",
    )
    .bind(user_id)
    .bind(&s.theme)
    .bind(&s.language)
    .bind(&s.privacy.presence_visibility)
    .bind(&s.privacy.join_policy)
    .bind(&s.privacy.friend_requests)
    .bind(&s.privacy.social_links_visibility)
    .execute(db)
    .await?;
    Ok(())
}

/// Privacy of many users at once (missing rows read as the strictest defaults).
pub async fn privacy_many(
    db: impl PgExecutor<'_>,
    ids: &[i64],
) -> ApiResult<std::collections::HashMap<i64, Privacy>> {
    let rows: Vec<(i64, String, String, String, String)> = sqlx::query_as(
        "SELECT user_id, presence_visibility, join_policy, friend_requests, social_links_visibility \
         FROM social.user_settings WHERE user_id = ANY($1)",
    )
    .bind(ids)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, a, b, c, d)| {
            (
                id,
                Privacy {
                    presence_visibility: a,
                    join_policy: b,
                    friend_requests: c,
                    social_links_visibility: d,
                },
            )
        })
        .collect())
}

fn pair(a: i64, b: i64) -> (i64, i64) {
    if a < b { (a, b) } else { (b, a) }
}

pub async fn are_friends(db: impl PgExecutor<'_>, a: i64, b: i64) -> ApiResult<bool> {
    let (lo, hi) = pair(a, b);
    Ok(sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM social.friendships WHERE user_low = $1 AND user_high = $2)",
    )
    .bind(lo)
    .bind(hi)
    .fetch_one(db)
    .await?)
}

/// All friend ids of `user` (bounded by the friend limit).
pub async fn friend_ids(db: impl PgExecutor<'_>, user: i64) -> ApiResult<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END FROM social.friendships \
         WHERE user_low = $1 OR user_high = $1",
    )
    .bind(user)
    .fetch_all(db)
    .await?)
}

/// Friend ids with the date each friendship started.
pub async fn friends_since(
    db: impl PgExecutor<'_>,
    user: i64,
) -> ApiResult<Vec<(i64, time::OffsetDateTime)>> {
    Ok(sqlx::query_as(
        "SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END, since FROM social.friendships \
         WHERE user_low = $1 OR user_high = $1",
    )
    .bind(user)
    .fetch_all(db)
    .await?)
}

pub async fn friend_count(db: impl PgExecutor<'_>, user: i64) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "SELECT count(*) FROM social.friendships WHERE user_low = $1 OR user_high = $1",
    )
    .bind(user)
    .fetch_one(db)
    .await?)
}

/// Number of friends `a` and `b` have in common.
pub async fn mutual_count(db: impl PgExecutor<'_>, a: i64, b: i64) -> ApiResult<i64> {
    Ok(sqlx::query_scalar(
        "WITH fa AS (SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END AS f FROM social.friendships WHERE user_low = $1 OR user_high = $1), \
              fb AS (SELECT CASE WHEN user_low = $2 THEN user_high ELSE user_low END AS f FROM social.friendships WHERE user_low = $2 OR user_high = $2) \
         SELECT count(*) FROM fa JOIN fb USING (f)",
    )
    .bind(a)
    .bind(b)
    .fetch_one(db)
    .await?)
}

/// (a blocked b, b blocked a)
pub async fn blocks_between(db: impl PgExecutor<'_>, a: i64, b: i64) -> ApiResult<(bool, bool)> {
    let rows: Vec<i64> = sqlx::query_scalar(
        "SELECT blocker FROM social.blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1)",
    )
    .bind(a)
    .bind(b)
    .fetch_all(db)
    .await?;
    Ok((rows.contains(&a), rows.contains(&b)))
}

/// Users hidden from `viewer` because of a block in either direction.
pub async fn hidden_for(db: impl PgExecutor<'_>, viewer: i64) -> ApiResult<Vec<i64>> {
    Ok(sqlx::query_scalar(
        "SELECT blocked FROM social.blocks WHERE blocker = $1 UNION SELECT blocker FROM social.blocks WHERE blocked = $1",
    )
    .bind(viewer)
    .fetch_all(db)
    .await?)
}

/// The `Relationship` of `target` as seen by `viewer`.
pub async fn relationship(db: &sqlx::PgPool, viewer: i64, target: i64) -> ApiResult<&'static str> {
    if viewer == target {
        return Ok("self");
    }
    if blocks_between(db, viewer, target).await?.0 {
        return Ok("blocked");
    }
    if are_friends(db, viewer, target).await? {
        return Ok("friend");
    }
    let dir: Option<i64> = sqlx::query_scalar(
        "SELECT from_user FROM social.friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1) LIMIT 1",
    )
    .bind(viewer)
    .bind(target)
    .fetch_optional(db)
    .await?;
    Ok(match dir {
        Some(from) if from == viewer => "request_sent",
        Some(_) => "request_received",
        None => "none",
    })
}

/// True if `audience` lets `viewer` see something of `owner` (`friend` = they are friends).
pub fn audience_allows(audience: &str, is_self: bool, friend: bool) -> bool {
    is_self || audience == "everyone" || (audience == "friends" && friend)
}

/// The `SocialLink` schema.
#[derive(Debug, Clone, Serialize)]
pub struct SocialLink {
    pub platform: String,
    pub handle: String,
    pub url: Option<String>,
    pub verified: bool,
}

/// Public profile URL built from a handle (no free-form links, spec 9.2). Discord has none.
pub fn social_url(platform: &str, handle: &str) -> Option<String> {
    let h = handle.trim_start_matches('@');
    Some(match platform {
        "youtube" => format!("https://www.youtube.com/@{h}"),
        "twitch" => format!("https://www.twitch.tv/{h}"),
        "tiktok" => format!("https://www.tiktok.com/@{h}"),
        "x" => format!("https://x.com/{h}"),
        "bluesky" => format!("https://bsky.app/profile/{h}"),
        "instagram" => format!("https://www.instagram.com/{h}"),
        "github" => format!("https://github.com/{h}"),
        _ => return None,
    })
}

/// Checks a handle against the platform's own rules; returns the normalised handle.
pub fn normalize_handle(platform: &str, handle: &str) -> Option<String> {
    let h = handle.trim();
    let bare = h.trim_start_matches('@');
    let all = |s: &str, extra: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || extra.contains(c))
    };
    let len = bare.len();
    let ok = match platform {
        "discord" => {
            (2..=32).contains(&len)
                && all(bare, "._")
                && bare.chars().all(|c| !c.is_ascii_uppercase())
        }
        "youtube" => (3..=30).contains(&len) && all(bare, "._-"),
        "twitch" => (4..=25).contains(&len) && all(bare, "_"),
        "tiktok" => (2..=24).contains(&len) && all(bare, "._"),
        "x" => (1..=15).contains(&len) && all(bare, "_"),
        "bluesky" => {
            (3..=64).contains(&len)
                && all(bare, ".-")
                && bare.contains('.')
                && !bare.starts_with('.')
                && !bare.ends_with('.')
        }
        "instagram" => (1..=30).contains(&len) && all(bare, "._"),
        "github" => {
            (1..=39).contains(&len)
                && all(bare, "-")
                && !bare.starts_with('-')
                && !bare.ends_with('-')
        }
        _ => false,
    };
    ok.then(|| {
        if platform == "youtube" {
            format!("@{bare}")
        } else {
            bare.to_owned()
        }
    })
}

pub async fn social_links(db: impl PgExecutor<'_>, user: i64) -> ApiResult<Vec<SocialLink>> {
    let rows: Vec<(String, String, Option<time::OffsetDateTime>)> =
        sqlx::query_as("SELECT platform, handle, verified_at FROM social.social_links WHERE user_id = $1 ORDER BY position")
            .bind(user)
            .fetch_all(db)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(platform, handle, verified_at)| SocialLink {
            url: social_url(&platform, &handle),
            platform,
            handle,
            verified: verified_at.is_some(),
        })
        .collect())
}

pub async fn replace_social_links(
    conn: &mut PgConnection,
    user: i64,
    links: &[(String, String)],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM social.social_links WHERE user_id = $1")
        .bind(user)
        .execute(&mut *conn)
        .await?;
    for (i, (platform, handle)) in links.iter().enumerate() {
        sqlx::query("INSERT INTO social.social_links (user_id, platform, handle, position) VALUES ($1, $2, $3, $4)")
            .bind(user)
            .bind(platform)
            .bind(handle)
            .bind(i as i16)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

/// Erases a user's social data (account deletion).
pub async fn purge_user(conn: &mut PgConnection, user: i64) -> ApiResult<()> {
    for sql in [
        "DELETE FROM social.friendships WHERE user_low = $1 OR user_high = $1",
        "DELETE FROM social.friend_requests WHERE from_user = $1 OR to_user = $1",
        "DELETE FROM social.blocks WHERE blocker = $1 OR blocked = $1",
        "DELETE FROM social.user_settings WHERE user_id = $1",
        "DELETE FROM social.social_links WHERE user_id = $1",
    ] {
        sqlx::query(sql).bind(user).execute(&mut *conn).await?;
    }
    Ok(())
}

/// Makes `a` and `b` friends (idempotent).
pub async fn make_friends(
    conn: &mut PgConnection,
    a: i64,
    b: i64,
) -> ApiResult<time::OffsetDateTime> {
    let (lo, hi) = pair(a, b);
    sqlx::query("INSERT INTO social.friendships (user_low, user_high) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(lo)
        .bind(hi)
        .execute(&mut *conn)
        .await?;
    sqlx::query("DELETE FROM social.friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)")
        .bind(a)
        .bind(b)
        .execute(&mut *conn)
        .await?;
    Ok(sqlx::query_scalar(
        "SELECT since FROM social.friendships WHERE user_low = $1 AND user_high = $2",
    )
    .bind(lo)
    .bind(hi)
    .fetch_one(&mut *conn)
    .await?)
}

pub async fn unfriend(conn: &mut PgConnection, a: i64, b: i64) -> ApiResult<bool> {
    let (lo, hi) = pair(a, b);
    Ok(
        sqlx::query("DELETE FROM social.friendships WHERE user_low = $1 AND user_high = $2")
            .bind(lo)
            .bind(hi)
            .execute(conn)
            .await?
            .rows_affected()
            > 0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minors_get_private_defaults_and_caps() {
        let kid = default_privacy(AgeBand::Under13);
        assert_eq!(kid.friend_requests, "friends_of_friends");
        assert_eq!(kid.social_links_visibility, "nobody");
        let adult = default_privacy(AgeBand::Adult);
        assert_eq!(adult.friend_requests, "everyone");
        let open = Privacy {
            presence_visibility: "everyone".into(),
            join_policy: "everyone".into(),
            friend_requests: "everyone".into(),
            social_links_visibility: "everyone".into(),
        };
        let capped = cap_privacy(AgeBand::Under13, open.clone());
        assert_eq!(capped.presence_visibility, "friends");
        assert_eq!(capped.friend_requests, "friends_of_friends");
        assert_eq!(cap_privacy(AgeBand::Adult, open.clone()), open);
    }

    #[test]
    fn handles_and_urls() {
        assert_eq!(
            normalize_handle("youtube", "ferrokit").as_deref(),
            Some("@ferrokit")
        );
        assert_eq!(
            normalize_handle("twitch", "ferrokit").as_deref(),
            Some("ferrokit")
        );
        assert_eq!(normalize_handle("twitch", "fk"), None);
        assert_eq!(normalize_handle("discord", "Ferro"), None);
        assert_eq!(
            normalize_handle("bluesky", "kit.example.com").as_deref(),
            Some("kit.example.com")
        );
        assert_eq!(normalize_handle("x", "javascript:alert(1)"), None);
        assert_eq!(
            social_url("youtube", "@ferrokit").as_deref(),
            Some("https://www.youtube.com/@ferrokit")
        );
        assert_eq!(social_url("discord", "ferro"), None);
        assert!(audience_allows("friends", false, true));
        assert!(!audience_allows("friends", false, false));
        assert!(audience_allows("nobody", true, false));
    }
}
