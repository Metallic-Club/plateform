//! Background jobs. The worker role runs them; in dev the API runs them too (`METALLIC_RUN_JOBS`).
//! Each job logs only counts.

use std::time::Duration;

use crate::{AppState, games, identity, matchmaker};

/// Stale-server check and live-count snapshot.
const FAST: Duration = Duration::from_secs(30);
/// Purges and cleanup.
const SLOW: Duration = Duration::from_secs(3600);

/// Runs the fast jobs once.
pub async fn run_fast(state: &AppState) {
    match matchmaker::internal::stop_stale_servers(state).await {
        Ok(0) => {}
        Ok(n) => tracing::info!(servers = n, "stopped servers that missed heartbeats"),
        Err(e) => tracing::warn!(error = %e.code, "stale server job failed"),
    }
    if let Err(e) = games::snapshot_playing(state).await {
        tracing::warn!(error = %e.code, "live count snapshot failed");
    }
}

/// Runs the slow jobs once.
pub async fn run_slow(state: &AppState) {
    match identity::account::purge_unverified(state).await {
        Ok(0) => {}
        Ok(n) => tracing::info!(accounts = n, "deleted accounts never verified in time"),
        Err(e) => tracing::warn!(error = %e.code, "unverified purge failed"),
    }
    match identity::cleanup_expired(&state.db).await {
        Ok(n) => tracing::debug!(rows = n, "identity cleanup"),
        Err(e) => tracing::warn!(error = %e.code, "identity cleanup failed"),
    }
    match matchmaker::cleanup_expired(&state.db).await {
        Ok(n) => tracing::debug!(rows = n, "matchmaker cleanup"),
        Err(e) => tracing::warn!(error = %e.code, "matchmaker cleanup failed"),
    }
}

/// Runs all jobs on their schedules until the task is dropped.
pub async fn run_forever(state: AppState) {
    let mut fast = tokio::time::interval(FAST);
    let mut slow = tokio::time::interval(SLOW);
    fast.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    slow.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            _ = fast.tick() => run_fast(&state).await,
            _ = slow.tick() => run_slow(&state).await,
        }
    }
}
