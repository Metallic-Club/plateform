//! Redemption must check expiry after acquiring the code row, without weakening single use.

use axum::http::StatusCode;
use metallic_platform::crypto::token_hash;
use serde_json::{Value, json};
use std::time::Duration;
use time::OffsetDateTime;

use crate::{
    auth::device_tokens,
    support::{Client, TestApp},
};

async fn issue_code(app: &TestApp, owner: &Client<'_>) -> String {
    let pair = device_tokens(app, owner).await;
    let native = owner.with_bearer(pair["access_token"].as_str().expect("fixture access"));
    let issued = native.op("createWebSessionCode", &[], Value::Null).await;
    assert_eq!(issued.status, StatusCode::OK);
    assert_eq!(issued.header("cache-control"), Some("no-store"));
    issued.body["code"]
        .as_str()
        .expect("fixture code")
        .to_owned()
}

async fn session_count(app: &TestApp, user: i64) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM identity.sessions WHERE user_id=$1")
        .bind(user)
        .fetch_one(&app.db)
        .await
        .expect("owned fixture session count")
}

/// Time a request has, from shortening the code's validity, to begin and reach the held row lock. Generous: under a
/// parallel `cargo test` a request can take seconds to get there. The request then waits up to this long on the lock.
const LOCK_WINDOW_SECS: f64 = 20.0;

/// An app whose request timeout outlasts a full lock window.
async fn app_for_lock_waits() -> TestApp {
    let mut config = crate::support::test_config();
    config.request_timeout = Duration::from_secs_f64(LOCK_WINDOW_SECS * 3.0);
    TestApp::with_config(config).await
}

async fn release_after_observed_expiry(
    app: &TestApp,
    blocker_pid: i32,
    expires_at: OffsetDateTime,
) {
    tokio::time::timeout(Duration::from_secs_f64(LOCK_WINDOW_SECS * 2.0), async {
        loop {
            let waiting: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() \
                 AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) \
                 AND xact_start < $2 AND query LIKE '%identity.web_session_codes%')",
            )
            .bind(blocker_pid)
            .bind(expires_at)
            .fetch_one(&app.db)
            .await
            .expect("observe only this owned database's exact blocker");
            if waiting {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        loop {
            let expired: bool = sqlx::query_scalar("SELECT clock_timestamp() > $1")
                .bind(expires_at)
                .fetch_one(&app.db)
                .await
                .expect("database wall clock");
            if expired {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("request must begin before expiry and wait on the known row lock");
}

async fn expiry_during_row_wait(changed_tuple: bool) {
    // Deadlock guard around setup, the lock window and the request.
    tokio::time::timeout(Duration::from_secs(120), async {
        let app = app_for_lock_waits().await;
        let owner = app.user(if changed_tuple { "web_expiry_update" } else { "web_expiry_lock" }, "1990-05-05").await;
        let code = issue_code(&app, &owner).await;
        let hash = token_hash(&code);
        let before = session_count(&app, owner.user_id()).await;
        let expires: OffsetDateTime = sqlx::query_scalar(
            "UPDATE identity.web_session_codes SET expires_at=clock_timestamp()+make_interval(secs => $2::float8) WHERE code_hash=$1 RETURNING expires_at",
        ).bind(&hash).bind(LOCK_WINDOW_SECS).fetch_one(&app.db).await.expect("shorten only the owned fixture's validity");
        let mut blocker = app.db.begin().await.expect("owned blocking transaction");
        let blocker_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&mut *blocker).await.expect("known blocker pid");
        if changed_tuple {
            sqlx::query("UPDATE identity.web_session_codes SET client_id=client_id WHERE code_hash=$1")
                .bind(&hash).execute(&mut *blocker).await.expect("hold an updated version of the owned row");
        } else {
            sqlx::query("SELECT code_hash FROM identity.web_session_codes WHERE code_hash=$1 FOR UPDATE")
                .bind(&hash).fetch_one(&mut *blocker).await.expect("hold the unchanged owned code row");
        }
        let anon = app.anon();
        let release = async {
            release_after_observed_expiry(&app, blocker_pid, expires).await;
            blocker.commit().await.expect("release only after database expiry");
        };
        let (response, ()) = tokio::join!(
            anon.op("redeemWebSessionCode", &[], json!({"code":code})), release
        );
        let after = session_count(&app, owner.user_id()).await;
        let state: (bool, OffsetDateTime) = sqlx::query_as(
            "SELECT used_at IS NULL, expires_at FROM identity.web_session_codes WHERE code_hash=$1",
        ).bind(&hash).fetch_one(&app.db).await.expect("inspect the owned code's final state");
        let observation = (response.status, response.header("set-cookie").is_some(), after-before, state.0, state.1==expires);
        let error_code = response.body.get("code").cloned();
        let no_store = response.header("cache-control")==Some("no-store");
        // Clean up even a deliberately failing red observation; no tokens or connection values are logged.
        app.finish().await;
        assert_eq!(observation, (StatusCode::BAD_REQUEST, false, 0, true, true),
            "expiry after a verified lock wait must not claim a code, mint a session, or extend validity");
        assert_eq!(error_code, Some(json!("invalid_code")));
        assert!(no_store);
    }).await.expect("bounded web-session expiry reproduction");
}

#[tokio::test]
async fn expiry_after_unchanged_code_row_lock_cannot_mint_a_session() {
    expiry_during_row_wait(false).await;
}

#[tokio::test]
async fn expiry_after_updated_code_row_lock_cannot_mint_a_session() {
    expiry_during_row_wait(true).await;
}

#[tokio::test]
async fn concurrent_valid_redemptions_have_exactly_one_session_winner() {
    let app = TestApp::new().await;
    let owner = app.user("web_single_winner", "1990-05-05").await;
    let code = issue_code(&app, &owner).await;
    let before = session_count(&app, owner.user_id()).await;
    let anon = app.anon();
    let (first, second) = tokio::time::timeout(Duration::from_secs(30), async {
        tokio::join!(
            anon.op("redeemWebSessionCode", &[], json!({"code":code})),
            anon.op("redeemWebSessionCode", &[], json!({"code":code}))
        )
    })
    .await
    .expect("concurrent redemption must not deadlock");
    let after = session_count(&app, owner.user_id()).await;
    let statuses = [first.status, second.status];
    let winners = statuses
        .iter()
        .filter(|&&status| status == StatusCode::OK)
        .count();
    let invalid = statuses
        .iter()
        .filter(|&&status| status == StatusCode::BAD_REQUEST)
        .count();
    let cookies = [&first, &second]
        .iter()
        .filter(|r| r.header("set-cookie").is_some())
        .count();
    let loser = if first.status == StatusCode::BAD_REQUEST {
        &first
    } else {
        &second
    };
    let loser_code = loser.body.get("code").cloned();
    let no_store = [&first, &second]
        .iter()
        .all(|r| r.header("cache-control") == Some("no-store"));
    app.finish().await;
    assert_eq!((winners, invalid, cookies, after - before), (1, 1, 1, 1));
    assert_eq!(loser_code, Some(json!("invalid_code")));
    assert!(no_store);
}
