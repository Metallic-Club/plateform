//! identity: accounts, credentials, sessions, native-app tokens, email verification, username rules, persons.
//! Other modules read users only through the functions here, never through SQL on `identity.*`.

pub mod account;
pub mod auth;
pub mod names;
pub mod oauth;
pub mod web_session;

use std::collections::HashMap;

use serde::Serialize;
use sqlx::PgExecutor;
use time::{Date, OffsetDateTime};

use crate::problem::ApiResult;

/// Age band from the self-declared birth date (spec 9.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgeBand {
    Under13,
    Age13To15,
    Age16To17,
    Adult,
    Unknown,
}

impl AgeBand {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Under13 => "under_13",
            Self::Age13To15 => "13_15",
            Self::Age16To17 => "16_17",
            Self::Adult => "adult",
            Self::Unknown => "unknown",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "under_13" => Self::Under13,
            "13_15" => Self::Age13To15,
            "16_17" => Self::Age16To17,
            "adult" => Self::Adult,
            _ => Self::Unknown,
        }
    }

    pub fn from_age(age: i32) -> Self {
        match age {
            ..13 => Self::Under13,
            13..=15 => Self::Age13To15,
            16..=17 => Self::Age16To17,
            _ => Self::Adult,
        }
    }

    /// Under 16 or not known: social links stay hidden and settings stay private (spec 9.2).
    pub fn is_under_16(self) -> bool {
        matches!(self, Self::Under13 | Self::Age13To15 | Self::Unknown)
    }

    /// Content labels this band may see. Signed-out viewers use [`AgeBand::Under13`]'s set.
    pub fn allowed_labels(self) -> &'static [&'static str] {
        match self {
            Self::Under13 | Self::Unknown => &["everyone", "mild"],
            Self::Age13To15 | Self::Age16To17 | Self::Adult => &["everyone", "mild", "moderate"],
        }
    }
}

/// Whole years between `birth` and `today`.
pub fn age_on(birth: Date, today: Date) -> i32 {
    let mut age = today.year() - birth.year();
    if (today.month() as u8, today.day()) < (birth.month() as u8, birth.day()) {
        age -= 1;
    }
    age
}

/// The `UserSummary` schema.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar_headshot_url: Option<String>,
}

/// What other modules need to know about a user.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserBasic {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub age_band: String,
    pub status: String,
    pub created_at: OffsetDateTime,
    pub email_verified_at: Option<OffsetDateTime>,
    pub is_first_party: bool,
    pub avatar_headshot_url: Option<String>,
}

impl UserBasic {
    pub fn band(&self) -> AgeBand {
        AgeBand::parse(&self.age_band)
    }

    pub fn summary(&self) -> UserSummary {
        UserSummary {
            id: self.id.to_string(),
            username: self.username.clone(),
            display_name: self.display_name.clone(),
            avatar_headshot_url: self.avatar_headshot_url.clone(),
        }
    }

    /// Visible to others: not banned, not being deleted.
    pub fn is_visible(&self) -> bool {
        matches!(self.status.as_str(), "active" | "limited" | "suspended")
    }

    pub fn is_verified(&self) -> bool {
        self.email_verified_at.is_some()
    }
}

const BASIC_COLUMNS: &str = "id, username::text AS username, display_name, bio, age_band, status, created_at, \
                             email_verified_at, is_first_party, avatar_headshot_url";

pub async fn basic(db: impl PgExecutor<'_>, id: i64) -> ApiResult<Option<UserBasic>> {
    Ok(sqlx::query_as::<_, UserBasic>(sqlx::AssertSqlSafe(format!(
        "SELECT {BASIC_COLUMNS} FROM identity.users WHERE id = $1"
    )))
    .bind(id)
    .fetch_optional(db)
    .await?)
}

pub async fn basic_by_username(
    db: impl PgExecutor<'_>,
    username: &str,
) -> ApiResult<Option<UserBasic>> {
    Ok(sqlx::query_as::<_, UserBasic>(sqlx::AssertSqlSafe(format!(
        "SELECT {BASIC_COLUMNS} FROM identity.users WHERE username = $1::citext"
    )))
    .bind(username)
    .fetch_optional(db)
    .await?)
}

/// Visible users by id. Missing, banned or deleted users are absent from the map.
pub async fn basics(db: impl PgExecutor<'_>, ids: &[i64]) -> ApiResult<HashMap<i64, UserBasic>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query_as::<_, UserBasic>(sqlx::AssertSqlSafe(format!(
        "SELECT {BASIC_COLUMNS} FROM identity.users \
         WHERE id = ANY($1) AND status IN ('active', 'limited', 'suspended')"
    )))
    .bind(ids)
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(|u| (u.id, u)).collect())
}

/// Summaries in the order of `ids`, skipping users that are not visible.
pub async fn summaries(db: impl PgExecutor<'_>, ids: &[i64]) -> ApiResult<Vec<UserSummary>> {
    let map = basics(db, ids).await?;
    Ok(ids
        .iter()
        .filter_map(|id| map.get(id).map(UserBasic::summary))
        .collect())
}

/// Search visible users by username or display name (trigram similarity plus prefix).
pub async fn search(
    db: impl PgExecutor<'_>,
    q: &str,
    limit: i64,
    offset: i64,
) -> ApiResult<Vec<UserBasic>> {
    let pattern = format!("{}%", like_escape(&q.to_lowercase()));
    Ok(sqlx::query_as::<_, UserBasic>(sqlx::AssertSqlSafe(format!(
        "SELECT {BASIC_COLUMNS} FROM identity.users \
         WHERE status IN ('active', 'limited', 'suspended') \
           AND (lower(username::text) LIKE $2 OR lower(display_name) LIKE $2 \
                OR lower(username::text) % lower($1) OR lower(display_name) % lower($1)) \
         ORDER BY (lower(username::text) = lower($1)) DESC, (lower(username::text) LIKE $2) DESC, \
                  greatest(similarity(lower(username::text), lower($1)), similarity(lower(display_name), lower($1))) DESC, \
                  id \
         LIMIT $3 OFFSET $4"
    )))
    .bind(q)
    .bind(pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?)
}

/// Escapes `%`, `_` and `\` for LIKE patterns.
pub fn like_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Deletes expired sessions, tokens, device codes and email tokens (hourly job). Refresh tokens stay a day past
/// expiry so a late reuse is still recognised. Returns how many rows went.
pub async fn cleanup_expired(db: &sqlx::PgPool) -> ApiResult<u64> {
    let mut n = 0;
    for sql in [
        "DELETE FROM identity.sessions WHERE expires_at < now() OR revoked_at < now() - interval '1 day'",
        "DELETE FROM identity.access_tokens WHERE expires_at < now()",
        "DELETE FROM identity.refresh_tokens WHERE expires_at < now() - interval '1 day'",
        "DELETE FROM identity.device_authorizations WHERE expires_at < now() - interval '1 hour'",
        "DELETE FROM identity.web_session_codes WHERE expires_at < now() - interval '1 hour'",
        "DELETE FROM identity.email_tokens WHERE expires_at < now() - interval '1 day'",
        "DELETE FROM identity.name_holds WHERE release_after < now()",
    ] {
        n += sqlx::query(sql).execute(db).await?.rows_affected();
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    #[test]
    fn ages_and_bands() {
        assert_eq!(age_on(date!(2010 - 04 - 17), date!(2026 - 04 - 16)), 15);
        assert_eq!(age_on(date!(2010 - 04 - 17), date!(2026 - 04 - 17)), 16);
        assert_eq!(AgeBand::from_age(12), AgeBand::Under13);
        assert_eq!(AgeBand::from_age(13), AgeBand::Age13To15);
        assert_eq!(AgeBand::from_age(17), AgeBand::Age16To17);
        assert_eq!(AgeBand::from_age(18), AgeBand::Adult);
        assert!(AgeBand::Age13To15.is_under_16());
        assert!(!AgeBand::Age16To17.is_under_16());
    }

    #[test]
    fn like_patterns_are_escaped() {
        assert_eq!(like_escape("a_b%c\\"), "a\\_b\\%c\\\\");
    }
}
