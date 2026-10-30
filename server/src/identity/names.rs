//! Username rules (spec 9.2): 3-20 characters, letters, digits and single underscores, not at either end,
//! case-insensitive unique, filtered, and protected against sniping by holds on freed names.

use serde::Serialize;
use sqlx::PgExecutor;
use time::OffsetDateTime;

use crate::{problem::ApiResult, text};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Unavailable {
    Taken,
    Reserved,
    ReleasedRecently,
    NotAllowed,
    Invalid,
}

/// Format check matching the contract's `Username` pattern plus "one underscore at a time".
pub fn valid_format(name: &str) -> bool {
    let b = name.as_bytes();
    (3..=20).contains(&b.len())
        && b[0].is_ascii_alphanumeric()
        && b[b.len() - 1].is_ascii_alphanumeric()
        && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
        && !name.contains("__")
}

/// Names that impersonate staff or the product, or fail the word filter.
pub fn filtered(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let squashed: String = lower.chars().filter(|c| *c != '_').collect();
    const IMPERSONATION: [&str; 6] = [
        "metallic",
        "admin",
        "moderator",
        "official",
        "staffteam",
        "support_team",
    ];
    IMPERSONATION
        .iter()
        .any(|w| squashed.contains(&w.replace('_', "")))
        || text::is_offensive(&squashed)
}

/// Why `name` cannot be taken right now, or None if it can.
pub async fn check(db: impl PgExecutor<'_> + Copy, name: &str) -> ApiResult<Option<Unavailable>> {
    if !valid_format(name) {
        return Ok(Some(Unavailable::Invalid));
    }
    let hold: Option<(String, Option<OffsetDateTime>)> = sqlx::query_as(
        "SELECT reason, release_after FROM identity.name_holds WHERE name_lower = $1::citext",
    )
    .bind(name)
    .fetch_optional(db)
    .await?;
    if let Some((reason, release_after)) = hold {
        match (reason.as_str(), release_after) {
            ("reserved" | "brand" | "staff", _) => return Ok(Some(Unavailable::Reserved)),
            (_, Some(at)) if at > OffsetDateTime::now_utc() => {
                return Ok(Some(Unavailable::ReleasedRecently));
            }
            _ => {}
        }
    }
    if filtered(name) {
        return Ok(Some(Unavailable::NotAllowed));
    }
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM identity.users WHERE username = $1::citext)",
    )
    .bind(name)
    .fetch_one(db)
    .await?;
    Ok(taken.then_some(Unavailable::Taken))
}

/// Puts `name` on hold for `days`, then releases it at a random moment within `jitter_days` (anti-sniping).
pub async fn hold(
    db: impl PgExecutor<'_>,
    name: &str,
    reason: &str,
    holder: Option<i64>,
    days: i64,
    jitter_days: i64,
) -> ApiResult<()> {
    let jitter_secs = if jitter_days > 0 {
        let max = jitter_days * 86_400;
        (u64::from_le_bytes(crate::crypto::random_bytes::<8>()) % max as u64) as i64
    } else {
        0
    };
    sqlx::query(
        "INSERT INTO identity.name_holds (name_lower, reason, holder_user_id, hold_until, release_after) \
         VALUES ($1::citext, $2, $3, now() + make_interval(days => $4::int), \
                 now() + make_interval(days => $4::int) + make_interval(secs => $5::double precision)) \
         ON CONFLICT (name_lower) DO UPDATE SET reason = EXCLUDED.reason, holder_user_id = EXCLUDED.holder_user_id, \
             hold_until = EXCLUDED.hold_until, release_after = EXCLUDED.release_after \
         WHERE identity.name_holds.hold_until IS NOT NULL",
    )
    .bind(name)
    .bind(reason)
    .bind(holder)
    .bind(days as i32)
    .bind(jitter_secs as f64)
    .execute(db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_format() {
        for ok in ["kit", "ferro_kit", "A1b2C3", "abcdefghijklmnopqrst"] {
            assert!(valid_format(ok), "{ok}");
        }
        for bad in [
            "ab",
            "_kit",
            "kit_",
            "ki__t",
            "kit!",
            "abcdefghijklmnopqrstu",
            "kït",
            "",
        ] {
            assert!(!valid_format(bad), "{bad}");
        }
    }

    #[test]
    fn impersonation_is_filtered() {
        assert!(filtered("metallic_admin"));
        assert!(filtered("Meta_llic"));
        assert!(filtered("the_official"));
        assert!(!filtered("ferro_kit"));
    }
}
