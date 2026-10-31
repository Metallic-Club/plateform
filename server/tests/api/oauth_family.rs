//! Family revocation must serialize with minting, including inserts made while a revoker waits.

use axum::http::StatusCode;
use metallic_platform::crypto::token_hash;
use serde_json::{Value, json};
use sqlx::{Connection, Executor};
use std::time::Duration;

use crate::{auth::device_tokens, support::TestApp};

/// How long a request may take to reach an observed lock. Generous: under a parallel `cargo test` (template copies,
/// password hashing in other tests) a request can take seconds before it gets there.
const LOCK_WAIT: Duration = Duration::from_secs(30);
/// Deadlock guard around a whole race, including its setup (database copy, signups) and one or more lock waits.
const RACE_GUARD: Duration = Duration::from_secs(120);
/// An operation that must not wait on the held lock; it still has to finish under load.
const UNBLOCKED: Duration = Duration::from_secs(15);

/// A held request waits for the race's lock waits (up to `LOCK_WAIT`, then `UNBLOCKED`) before it may finish, which
/// is longer than the default 10 s request timeout under a parallel `cargo test`; these apps allow 60 s.
async fn race_app() -> TestApp {
    let mut config = crate::support::test_config();
    config.request_timeout = Duration::from_secs(60);
    TestApp::with_config(config).await
}

fn refresh(token: &str) -> Value {
    json!({ "grant_type": "refresh_token", "refresh_token": token, "client_id": "metallic-studio" })
}

async fn waiting_pid(app: &TestApp, blocker: Option<i32>) -> i32 {
    tokio::time::timeout(LOCK_WAIT, async {
        loop {
            let pid: Option<i32> = sqlx::query_scalar(
                "SELECT pid FROM pg_stat_activity WHERE datname = current_database() \
                 AND wait_event_type = 'Lock' AND ($1::int IS NULL OR $1 = ANY(pg_blocking_pids(pid))) \
                 ORDER BY pid LIMIT 1",
            )
            .bind(blocker)
            .fetch_optional(&app.db)
            .await
            .expect("inspect only this test database's waiters");
            if let Some(pid) = pid {
                return pid;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("request must reach the observed database lock within the lock-wait deadline")
}

/// A test-only BEFORE INSERT trigger pauses a descendant rotation after its parent row is locked. The two-int
/// advisory-lock key uses this database's OID and a negative high half. Issued positive IDs have nonnegative high halves;
/// other tests use a different database OID. Bigint advisory locks occupy PostgreSQL's separate key space.
async fn pause_descendant(app: &TestApp, parent: &str) -> sqlx::PgConnection {
    let hash: String = token_hash(parent)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert!(hash.bytes().all(|b| b.is_ascii_hexdigit()));
    app.db
        .execute(sqlx::AssertSqlSafe(format!(
            "CREATE FUNCTION identity.pause_test_rotation() RETURNS trigger LANGUAGE plpgsql AS $$ \
             BEGIN IF NEW.parent_hash = decode('{hash}', 'hex') THEN \
               PERFORM pg_advisory_xact_lock(-1296389185, \
                 (SELECT oid::int FROM pg_database WHERE datname = current_database())); \
             END IF; RETURN NEW; END $$; \
             CREATE TRIGGER pause_test_rotation BEFORE INSERT ON identity.refresh_tokens \
             FOR EACH ROW EXECUTE FUNCTION identity.pause_test_rotation();"
        )))
        .await
        .expect("install a trigger only in this test's disposable database");
    let mut conn = app.db.acquire().await.expect("test connection").detach();
    conn.execute("SELECT pg_advisory_lock(-1296389185, (SELECT oid::int FROM pg_database WHERE datname=current_database()))")
        .await
        .expect("pause rotation");
    conn
}

async fn release_pause(mut conn: sqlx::PgConnection) {
    conn.execute("SELECT pg_advisory_unlock(-1296389185, (SELECT oid::int FROM pg_database WHERE datname=current_database()))")
        .await
        .expect("release this test's rotation");
    conn.close().await.expect("close probe connection");
}

#[derive(Clone, Copy)]
enum Revocation {
    Replay,
    Explicit,
    Logout,
}

async fn rotation_overlapping_revocation(mode: Revocation) {
    tokio::time::timeout(RACE_GUARD, async {
        let app = race_app().await;
        let user = app.user("family_race", "1990-05-05").await;
        let tokens = device_tokens(&app, &user).await;
        let old_refresh = tokens["refresh_token"].as_str().expect("refresh");
        let old_access = tokens["access_token"].as_str().expect("access");
        let anon = app.anon();
        let current = anon.op("exchangeToken", &[], refresh(old_refresh)).await;
        assert_eq!(current.status, StatusCode::OK);
        let current_refresh = current.body["refresh_token"].as_str().expect("refresh");
        let current_access = current.body["access_token"].as_str().expect("access");
        let unrelated = device_tokens(&app, &user).await;
        let pause = pause_descendant(&app, current_refresh).await;
        let rotate_client = app.anon();
        let revoke_client = user.with_bearer(old_access);

        let rotate = rotate_client.op("exchangeToken", &[], refresh(current_refresh));
        let orchestration = async {
            let rotation_pid = waiting_pid(&app, None).await;
            let revoke = async {
                match mode {
                    Revocation::Replay => {
                        let r = anon.op("exchangeToken", &[], refresh(old_refresh)).await;
                        assert_eq!(r.body["error"], "invalid_grant");
                    }
                    Revocation::Explicit => {
                        let r = anon
                            .op(
                                "revokeToken",
                                &[],
                                json!({"token": old_refresh, "client_id": "metallic-studio"}),
                            )
                            .await;
                        assert_eq!(r.status, StatusCode::OK);
                    }
                    Revocation::Logout => {
                        let r = revoke_client.op("logOut", &[], Value::Null).await;
                        assert_eq!(r.status, StatusCode::NO_CONTENT);
                    }
                }
            };
            let release = async {
                waiting_pid(&app, Some(rotation_pid)).await;
                let independent = tokio::time::timeout(
                    UNBLOCKED,
                    anon.op(
                        "exchangeToken",
                        &[],
                        refresh(unrelated["refresh_token"].as_str().expect("refresh")),
                    ),
                )
                .await
                .expect("another family must rotate while this family is blocked");
                assert_eq!(independent.status, StatusCode::OK);
                release_pause(pause).await;
            };
            tokio::join!(revoke, release);
        };
        let (rotated, ()) = tokio::join!(rotate, orchestration);
        assert_eq!(
            rotated.status,
            StatusCode::OK,
            "rotation completes before the waiting revoker"
        );
        let surviving = anon
            .op(
                "exchangeToken",
                &[],
                refresh(rotated.body["refresh_token"].as_str().expect("refresh")),
            )
            .await;
        assert_eq!(
            surviving.status,
            StatusCode::BAD_REQUEST,
            "a descendant refresh must not survive completed family revocation"
        );
        assert_eq!(surviving.body["error"], "invalid_grant");
        for access in [
            old_access,
            current_access,
            rotated.body["access_token"].as_str().expect("access"),
        ] {
            assert_eq!(
                user.with_bearer(access)
                    .op("getMe", &[], Value::Null)
                    .await
                    .status,
                StatusCode::UNAUTHORIZED
            );
        }
        assert_eq!(
            user.with_bearer(unrelated["access_token"].as_str().expect("access"))
                .op("getMe", &[], Value::Null)
                .await
                .status,
            StatusCode::OK,
            "a different family remains usable"
        );
        app.finish().await;
    })
    .await
    .expect("family race must finish without deadlock");
}

#[tokio::test]
async fn ancestor_replay_cannot_leave_a_concurrently_minted_refresh_alive() {
    rotation_overlapping_revocation(Revocation::Replay).await;
}

#[tokio::test]
async fn explicit_revocation_cannot_leave_a_concurrently_minted_refresh_alive() {
    rotation_overlapping_revocation(Revocation::Explicit).await;
}

#[tokio::test]
async fn native_logout_cannot_leave_a_concurrently_minted_refresh_alive() {
    rotation_overlapping_revocation(Revocation::Logout).await;
}

#[tokio::test]
async fn duplicate_concurrent_refresh_is_replay_but_distinct_families_both_rotate() {
    tokio::time::timeout(RACE_GUARD, async {
        let app = race_app().await;
        let user = app.user("parallel_family", "1990-05-05").await;
        let first = device_tokens(&app, &user).await;
        let second = device_tokens(&app, &user).await;
        let a = app.anon();
        let b = app.anon();
        let (left, right) = tokio::join!(
            a.op(
                "exchangeToken",
                &[],
                refresh(first["refresh_token"].as_str().expect("refresh"))
            ),
            b.op(
                "exchangeToken",
                &[],
                refresh(second["refresh_token"].as_str().expect("refresh"))
            )
        );
        assert_eq!(left.status, StatusCode::OK);
        assert_eq!(right.status, StatusCode::OK);
        let grant = left.body["refresh_token"].as_str().expect("refresh");
        let (one, two) = tokio::join!(
            a.op("exchangeToken", &[], refresh(grant)),
            b.op("exchangeToken", &[], refresh(grant))
        );
        let (success, replay) = if one.status == StatusCode::OK {
            (one, two)
        } else {
            (two, one)
        };
        assert_eq!(success.status, StatusCode::OK);
        assert_eq!(replay.status, StatusCode::BAD_REQUEST);
        assert_eq!(replay.body["error"], "invalid_grant");
        assert_eq!(
            a.op(
                "exchangeToken",
                &[],
                refresh(success.body["refresh_token"].as_str().expect("refresh"))
            )
            .await
            .body["error"],
            "invalid_grant"
        );
        assert_eq!(
            user.with_bearer(success.body["access_token"].as_str().expect("access"))
                .op("getMe", &[], Value::Null)
                .await
                .status,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            a.op(
                "exchangeToken",
                &[],
                refresh(right.body["refresh_token"].as_str().expect("refresh"))
            )
            .await
            .status,
            StatusCode::OK
        );
        app.finish().await;
    })
    .await
    .expect("concurrent rotation/replay must finish without deadlock");
}

#[tokio::test]
async fn failed_family_revocation_rolls_back_both_tables_and_releases_its_lock() {
    let app = TestApp::new().await;
    let user = app.user("revoke_rollback", "1990-05-05").await;
    let pair = device_tokens(&app, &user).await;
    let anon = app.anon();
    app.db.execute("CREATE FUNCTION identity.fail_test_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test revocation failure'; END $$; CREATE TRIGGER fail_test_revocation BEFORE UPDATE OF revoked_at ON identity.access_tokens FOR EACH ROW EXECUTE FUNCTION identity.fail_test_revocation();").await.expect("inject failure only in the owned test database");
    let failed = anon
        .op(
            "revokeToken",
            &[],
            json!({"token": pair["refresh_token"], "client_id": "metallic-studio"}),
        )
        .await;
    assert_eq!(failed.status, StatusCode::INTERNAL_SERVER_ERROR);
    app.db.execute("DROP TRIGGER fail_test_revocation ON identity.access_tokens; DROP FUNCTION identity.fail_test_revocation();").await.expect("remove injected failure");
    let revoked: i64 = sqlx::query_scalar("SELECT (SELECT count(*) FROM identity.refresh_tokens WHERE revoked_at IS NOT NULL) + (SELECT count(*) FROM identity.access_tokens WHERE revoked_at IS NOT NULL)").fetch_one(&app.db).await.expect("inspect rollback");
    assert_eq!(revoked, 0, "no partial family revocation may commit");
    assert_eq!(
        user.with_bearer(pair["access_token"].as_str().expect("access"))
            .op("getMe", &[], Value::Null)
            .await
            .status,
        StatusCode::OK
    );
    let retry = tokio::time::timeout(
        UNBLOCKED,
        anon.op(
            "exchangeToken",
            &[],
            refresh(pair["refresh_token"].as_str().expect("refresh")),
        ),
    )
    .await
    .expect("failed revocation must release its family lock");
    assert_eq!(retry.status, StatusCode::OK);
    app.finish().await;
}

#[tokio::test]
async fn access_only_revocation_and_wrong_client_keep_existing_semantics() {
    let app = TestApp::new().await;
    let user = app.user("revoke_scope", "1990-05-05").await;
    let pair = device_tokens(&app, &user).await;
    let anon = app.anon();
    let access = pair["access_token"].as_str().expect("access");
    let refresh_token = pair["refresh_token"].as_str().expect("refresh");
    for hint in ["access_token", "refresh_token"] {
        let wrong_client = anon.op("revokeToken", &[], json!({"token": refresh_token, "client_id": "metallic-player", "token_type_hint": hint})).await;
        assert_eq!(
            wrong_client.status,
            StatusCode::OK,
            "wrong-client lookup remains opaque"
        );
    }
    assert_eq!(anon.op("revokeToken", &[], json!({"token": access, "client_id": "metallic-studio", "token_type_hint": "refresh_token"})).await.status, StatusCode::OK, "hint does not override the stored token kind");
    assert_eq!(
        user.with_bearer(access)
            .op("getMe", &[], Value::Null)
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    let rotated = anon.op("exchangeToken", &[], refresh(refresh_token)).await;
    assert_eq!(
        rotated.status,
        StatusCode::OK,
        "access-only revocation does not revoke its refresh family"
    );
    let profile = user
        .with_bearer(rotated.body["access_token"].as_str().expect("access"))
        .op("getMe", &[], Value::Null)
        .await;
    assert_eq!(profile.status, StatusCode::OK);
    assert_eq!(profile.body["id"], user.id_str());
    assert_eq!(
        anon.op(
            "revokeToken",
            &[],
            json!({"token": "mrt_unknown_fixture", "client_id": "metallic-studio"})
        )
        .await
        .status,
        StatusCode::OK
    );
    app.finish().await;
}

#[tokio::test]
async fn refresh_expiry_is_validated_after_waiting_for_the_family_lock() {
    tokio::time::timeout(RACE_GUARD, async {
        let app = race_app().await;
        let user = app.user("wait_expiry", "1990-05-05").await;
        let pair = device_tokens(&app, &user).await;
        let token = pair["refresh_token"].as_str().expect("refresh");
        let family: i64 = sqlx::query_scalar("SELECT family_id FROM identity.refresh_tokens WHERE token_hash=$1").bind(token_hash(token)).fetch_one(&app.db).await.expect("family");
        let mut hold = app.db.acquire().await.expect("test connection").detach();
        let blocker: i32 = sqlx::query_scalar("SELECT pg_backend_pid()").fetch_one(&mut hold).await.expect("blocker pid");
        sqlx::query("SELECT pg_advisory_lock($1::int, $2::int)").bind((family >> 32) as i32).bind(family as i32).execute(&mut hold).await.expect("hold family");
        let anon = app.anon();
        let change = async {
            waiting_pid(&app, Some(blocker)).await;
            sqlx::query("UPDATE identity.refresh_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1").bind(token_hash(token)).execute(&app.db).await.expect("expire only owned fixture");
            sqlx::query("SELECT pg_advisory_unlock($1::int, $2::int)").bind((family >> 32) as i32).bind(family as i32).execute(&mut hold).await.expect("release family");
            hold.close().await.expect("close blocker");
        };
        let (response, ()) = tokio::join!(anon.op("exchangeToken", &[], refresh(token)), change);
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        assert_eq!(response.body["error"], "invalid_grant");
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM identity.refresh_tokens WHERE family_id=$1").bind(family).fetch_one(&app.db).await.expect("no mint");
        assert_eq!(count, 1);
        app.finish().await;
    }).await.expect("expiry waiter must finish without deadlock");
}
