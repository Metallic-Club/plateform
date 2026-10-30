//! Pluggable services behind traits, with in-memory implementations for dev and tests (design spec D5: Valkey in
//! production). Hot state may be lost on restart; callers degrade instead of failing (spec section 11).

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use async_trait::async_trait;
use time::OffsetDateTime;

// ------------------------------------------------------------------ rate limits

/// A limit: at most `max` hits per `window`.
#[derive(Debug, Clone, Copy)]
pub struct Limit {
    pub name: &'static str,
    pub max: u32,
    pub window: Duration,
}

impl Limit {
    pub const fn per_minute(name: &'static str, max: u32) -> Self {
        Self {
            name,
            max,
            window: Duration::from_secs(60),
        }
    }
    pub const fn per_hour(name: &'static str, max: u32) -> Self {
        Self {
            name,
            max,
            window: Duration::from_secs(3600),
        }
    }
}

/// Outcome of one hit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Decision {
    pub allowed: bool,
    pub remaining: u32,
    /// Seconds until the window resets.
    pub reset_secs: u64,
}

#[async_trait]
pub trait RateLimiter: Send + Sync {
    /// Counts one hit for `key` under `limit`.
    async fn hit(&self, limit: Limit, key: &str) -> Decision;
}

/// Fixed-window counters in process memory.
#[derive(Debug, Default)]
pub struct MemoryRateLimiter {
    windows: Mutex<HashMap<String, (Instant, u32)>>,
}

const MAX_TRACKED_KEYS: usize = 200_000;

#[async_trait]
impl RateLimiter for MemoryRateLimiter {
    async fn hit(&self, limit: Limit, key: &str) -> Decision {
        let now = Instant::now();
        let mut map = self.windows.lock().unwrap_or_else(|e| e.into_inner());
        if map.len() >= MAX_TRACKED_KEYS {
            map.retain(|_, (start, _)| now.duration_since(*start) < Duration::from_secs(3600));
        }
        let entry = map
            .entry(format!("{}:{key}", limit.name))
            .or_insert((now, 0));
        if now.duration_since(entry.0) >= limit.window {
            *entry = (now, 0);
        }
        entry.1 = entry.1.saturating_add(1);
        let reset = limit
            .window
            .saturating_sub(now.duration_since(entry.0))
            .as_secs()
            .max(1);
        Decision {
            allowed: entry.1 <= limit.max,
            remaining: limit.max.saturating_sub(entry.1),
            reset_secs: reset,
        }
    }
}

// ------------------------------------------------------------------ presence

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Activity {
    Online,
    InGame { game_id: i64, server_id: i64 },
    InStudio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PresenceRecord {
    /// None when the user is offline (no beat within the TTL).
    pub activity: Option<Activity>,
    pub last_online_at: Option<OffsetDateTime>,
}

#[async_trait]
pub trait PresenceStore: Send + Sync {
    /// Marks the user active. An in-game beat is not overwritten by plain website activity within the TTL.
    async fn beat(&self, user_id: i64, activity: Activity);
    /// Marks the user as having left a game server.
    async fn leave_game(&self, user_id: i64, server_id: i64);
    async fn get_many(&self, user_ids: &[i64]) -> Vec<PresenceRecord>;
    /// Users with any activity within the TTL.
    async fn online_count(&self) -> u64;
}

/// Presence in process memory with a TTL (spec: `presence:{user}` with a 60 s TTL in Valkey).
#[derive(Debug)]
pub struct MemoryPresence {
    ttl: Duration,
    map: Mutex<HashMap<i64, (Activity, Instant, OffsetDateTime)>>,
}

impl MemoryPresence {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            map: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for MemoryPresence {
    fn default() -> Self {
        Self::new(Duration::from_secs(60))
    }
}

#[async_trait]
impl PresenceStore for MemoryPresence {
    async fn beat(&self, user_id: i64, activity: Activity) {
        let now = Instant::now();
        let mut map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((existing, at, _)) = map.get(&user_id).copied()
            && matches!(existing, Activity::InGame { .. })
            && !matches!(activity, Activity::InGame { .. })
            && now.duration_since(at) < self.ttl
        {
            map.insert(user_id, (existing, at, OffsetDateTime::now_utc()));
            return;
        }
        map.insert(user_id, (activity, now, OffsetDateTime::now_utc()));
    }

    async fn leave_game(&self, user_id: i64, server_id: i64) {
        let mut map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = map.get_mut(&user_id)
            && matches!(entry.0, Activity::InGame { server_id: s, .. } if s == server_id)
        {
            entry.0 = Activity::Online;
        }
    }

    async fn get_many(&self, user_ids: &[i64]) -> Vec<PresenceRecord> {
        let now = Instant::now();
        let map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        user_ids
            .iter()
            .map(|id| match map.get(id) {
                Some((activity, at, wall)) if now.duration_since(*at) < self.ttl => {
                    PresenceRecord {
                        activity: Some(*activity),
                        last_online_at: Some(*wall),
                    }
                }
                Some((_, _, wall)) => PresenceRecord {
                    activity: None,
                    last_online_at: Some(*wall),
                },
                None => PresenceRecord {
                    activity: None,
                    last_online_at: None,
                },
            })
            .collect()
    }

    async fn online_count(&self) -> u64 {
        let now = Instant::now();
        let map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        map.values()
            .filter(|(_, at, _)| now.duration_since(*at) < self.ttl)
            .count() as u64
    }
}

// ------------------------------------------------------------------ email

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmailKind {
    Verify,
    ParentConsent,
}

impl EmailKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Verify => "verify",
            Self::ParentConsent => "parent_consent",
        }
    }
}

/// An email to send. `link` carries a one-time token: never log it.
#[derive(Clone)]
pub struct Email {
    pub to: String,
    pub kind: EmailKind,
    pub subject: String,
    pub body: String,
    pub link: String,
}

impl std::fmt::Debug for Email {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Email")
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send(&self, email: Email) -> Result<(), String>;
}

/// Dev mailer: logs that an email went out (no address, no link) and, when a folder is set, writes the full message
/// there so a developer can click the link. Refused outside dev (see `main.rs`).
#[derive(Debug)]
pub struct DevMailer {
    pub dir: Option<PathBuf>,
}

#[async_trait]
impl Mailer for DevMailer {
    async fn send(&self, email: Email) -> Result<(), String> {
        let Some(dir) = &self.dir else {
            tracing::info!(
                kind = email.kind.as_str(),
                "dev mailer: email not delivered (set METALLIC_DEV_MAIL_DIR to keep it)"
            );
            return Ok(());
        };
        tokio_fs_write(dir, &email).await?;
        tracing::info!(
            kind = email.kind.as_str(),
            "dev mailer: email written to the dev mail folder"
        );
        Ok(())
    }
}

async fn tokio_fs_write(dir: &std::path::Path, email: &Email) -> Result<(), String> {
    let dir = dir.to_owned();
    let name = format!(
        "{}-{}.txt",
        OffsetDateTime::now_utc().unix_timestamp_nanos(),
        email.kind.as_str()
    );
    let text = format!(
        "To: {}\nSubject: {}\n\n{}\n",
        email.to, email.subject, email.body
    );
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(name), text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Keeps emails in memory; tests read them back.
#[derive(Debug, Default)]
pub struct MemoryMailer {
    pub sent: Mutex<Vec<Email>>,
}

#[async_trait]
impl Mailer for MemoryMailer {
    async fn send(&self, email: Email) -> Result<(), String> {
        self.sent
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(email);
        Ok(())
    }
}

// ------------------------------------------------------------------ captcha

#[async_trait]
pub trait CaptchaVerifier: Send + Sync {
    async fn verify(&self, token: &str) -> bool;
}

/// No captcha vendor yet (spec section 15). Accepts nothing, so a sign-up that needs a captcha is refused until one
/// is configured. Dev and tests can use [`AcceptingCaptcha`].
#[derive(Debug, Default)]
pub struct NoCaptcha;

#[async_trait]
impl CaptchaVerifier for NoCaptcha {
    async fn verify(&self, _token: &str) -> bool {
        false
    }
}

/// Accepts the literal token `dev-captcha-ok`. Dev and tests only.
#[derive(Debug, Default)]
pub struct AcceptingCaptcha;

#[async_trait]
impl CaptchaVerifier for AcceptingCaptcha {
    async fn verify(&self, token: &str) -> bool {
        token == "dev-captcha-ok"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rate_limiter_counts_per_key() {
        let limiter = MemoryRateLimiter::default();
        let limit = Limit::per_minute("t", 2);
        assert!(limiter.hit(limit, "a").await.allowed);
        assert!(limiter.hit(limit, "a").await.allowed);
        let third = limiter.hit(limit, "a").await;
        assert!(!third.allowed);
        assert_eq!(third.remaining, 0);
        assert!(limiter.hit(limit, "b").await.allowed);
    }

    #[tokio::test]
    async fn presence_expires_and_keeps_game_over_web_activity() {
        let presence = MemoryPresence::new(Duration::from_millis(200));
        let game = Activity::InGame {
            game_id: 1,
            server_id: 2,
        };
        presence.beat(7, game).await;
        presence.beat(7, Activity::Online).await;
        assert_eq!(presence.get_many(&[7]).await[0].activity, Some(game));
        assert_eq!(presence.online_count().await, 1);
        presence.leave_game(7, 2).await;
        assert_eq!(
            presence.get_many(&[7]).await[0].activity,
            Some(Activity::Online)
        );
        tokio::time::sleep(Duration::from_millis(250)).await;
        let rec = presence.get_many(&[7, 8]).await;
        assert_eq!(rec[0].activity, None);
        assert!(rec[0].last_online_at.is_some());
        assert_eq!(
            rec[1],
            PresenceRecord {
                activity: None,
                last_online_at: None
            }
        );
    }
}
