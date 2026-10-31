//! Ticket resolution uses registered facts and the owning native identity, without consuming a ticket.

use crate::support::{Client, PASSWORD, TestApp};
use axum::http::StatusCode;
use metallic_platform::{crypto::token_hash, seed};
use serde_json::{Value, json};

const GAME: &str = "1000000000000101";
const PLACE: &str = "1000000000001101";
const HOST: &str = "game.metallic.example"; // Reserved fixture; no DNS/network connection is made.
const CERT: &str = "abababababababababababababababababababababababababababababababab";

async fn seeded() -> TestApp {
    let app = TestApp::new().await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    app
}

fn registration() -> Value {
    json!({ "gameId": GAME, "placeId": PLACE, "region": "us-east", "maxPlayers": 2,
        "host": HOST, "port": 4433, "certSha256": CERT, "protocolMajor": 1,
        "engineVersion": "0.1.0-dev", "buildId": "fixture-build-1" })
}

async fn register(server: &Client<'_>, body: Value) -> String {
    let response = server.op("registerGameServer", &[], body).await;
    assert_eq!(response.status, StatusCode::CREATED);
    response.body["serverId"]
        .as_str()
        .expect("server id")
        .to_owned()
}

async fn native_token(app: &TestApp, user: &Client<'_>, scope: &str) -> String {
    let anon = app.anon();
    let response = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player", "scope": scope }),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK);
    user.op(
        "approveDeviceAuthorization",
        &[],
        json!({ "userCode": response.body["user_code"], "approve": true }),
    )
    .await;
    let response = anon.op("exchangeToken", &[], json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": response.body["device_code"], "client_id": "metallic-player" })).await;
    assert_eq!(response.status, StatusCode::OK);
    response.body["access_token"]
        .as_str()
        .expect("access token")
        .to_owned()
}

async fn ticket(player: &Client<'_>, server: Option<&str>) -> String {
    let body = server.map_or(json!({}), |id| json!({ "serverId": id }));
    let response = player
        .op("createJoinTicket", &[("gameId", GAME)], body)
        .await;
    assert_eq!(response.status, StatusCode::CREATED);
    assert!(
        response.body["launchUri"]
            .as_str()
            .expect("URI")
            .starts_with("metallic://play?place=")
    );
    assert!(
        !response.body["launchUri"]
            .as_str()
            .expect("URI")
            .contains(HOST)
    );
    response.body["ticket"].as_str().expect("ticket").to_owned()
}

#[tokio::test]
async fn complete_metadata_resolves_without_consuming_and_redemption_adds_identity_context() {
    let app = seeded().await;
    let server = Client::server(&app);
    let owner = app.user("connection_owner", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let id = register(&server, registration()).await;
    let issuance = native
        .op(
            "createJoinTicket",
            &[("gameId", GAME)],
            json!({ "serverId": id }),
        )
        .await;
    assert_eq!(issuance.status, StatusCode::CREATED);
    let issued = issuance.body["ticket"]
        .as_str()
        .expect("issued ticket")
        .to_owned();
    let wire_expiry = issuance.body["expiresAt"].clone();
    let original_expiry: time::OffsetDateTime =
        sqlx::query_scalar("SELECT expires_at FROM matchmaker.join_tickets WHERE ticket_hash = $1")
            .bind(token_hash(&issued))
            .fetch_one(&app.db)
            .await
            .expect("ticket expiry");
    for _ in 0..2 {
        let response = native
            .op("connectJoinTicket", &[], json!({ "ticket": issued }))
            .await;
        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(response.header("cache-control"), Some("no-store"));
        assert_eq!(response.body["serverId"], id);
        assert_eq!(response.body["host"], HOST);
        assert_eq!(response.body["port"], 4433);
        assert_eq!(response.body["certSha256"], CERT);
        assert_eq!(response.body["protocol"], "metallic/1");
        assert_eq!(response.body["engineVersion"], "0.1.0-dev");
        assert_eq!(response.body["buildId"], "fixture-build-1");
        // The established API serializer uses whole-second RFC3339; compare to the issuance response,
        // while the separate database assertion below preserves the exact stored microsecond timestamp.
        assert_eq!(response.body["expiresAt"], wire_expiry);
        assert!(!response.body.to_string().contains(&issued));
    }
    let unused: bool = sqlx::query_scalar(
        "SELECT redeemed_at IS NULL FROM matchmaker.join_tickets WHERE ticket_hash = $1",
    )
    .bind(token_hash(&issued))
    .fetch_one(&app.db)
    .await
    .expect("test fixture");
    assert!(unused);
    let current_expiry: time::OffsetDateTime =
        sqlx::query_scalar("SELECT expires_at FROM matchmaker.join_tickets WHERE ticket_hash = $1")
            .bind(token_hash(&issued))
            .fetch_one(&app.db)
            .await
            .expect("unchanged expiry");
    assert_eq!(current_expiry, original_expiry);
    let public_servers = app
        .anon()
        .op("listServers", &[("gameId", GAME)], Value::Null)
        .await;
    assert!(!public_servers.body.to_string().contains(HOST));
    assert!(!public_servers.body.to_string().contains(CERT));
    let response = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": id }),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["userId"], owner.id_str());
    assert_eq!(response.body["ageBand"], "adult");
    assert_eq!(response.body.get("partyId"), Some(&Value::Null));
    assert_eq!(
        native
            .op("connectJoinTicket", &[], json!({ "ticket": issued }))
            .await
            .status,
        StatusCode::GONE
    );
    assert_eq!(
        server
            .op(
                "redeemJoinTicket",
                &[],
                json!({ "ticket": issued, "serverId": id })
            )
            .await
            .status,
        StatusCode::GONE
    );
    app.finish().await;
}

#[tokio::test]
async fn resolution_requires_native_play_scope_and_ticket_owner_with_uniform_private_errors() {
    let app = seeded().await;
    let owner = app.user("ticket_native", "1990-01-01").await;
    let other = app.user("ticket_other", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let other_token = native_token(&app, &other, "profile play").await;
    let profile = native_token(&app, &owner, "profile").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    for (caller, expected) in [
        (app.anon(), StatusCode::UNAUTHORIZED),
        (owner.with_bearer(&profile), StatusCode::FORBIDDEN),
        (
            owner.with_bearer("invalid-access-token"),
            StatusCode::UNAUTHORIZED,
        ),
    ] {
        let response = caller
            .op("connectJoinTicket", &[], json!({ "ticket": issued }))
            .await;
        assert_eq!(response.status, expected);
        assert_eq!(response.header("cache-control"), Some("no-store"));
        assert!(!response.body.to_string().contains(&issued));
    }
    assert_eq!(
        owner
            .op("connectJoinTicket", &[], json!({ "ticket": issued }))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    let wrong_owner = other
        .with_bearer(&other_token)
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    let unknown = native
        .op(
            "connectJoinTicket",
            &[],
            json!({ "ticket": "jt_unknown_fixture" }),
        )
        .await;
    sqlx::query("UPDATE matchmaker.join_tickets SET expires_at = now() - interval '1 second' WHERE ticket_hash = $1")
        .bind(token_hash(&issued)).execute(&app.db).await.expect("test fixture");
    let expired = native
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    for response in [&wrong_owner, &unknown, &expired] {
        assert_eq!(response.status, StatusCode::GONE);
        assert_eq!(response.body["code"], "ticket_invalid");
        assert_eq!(response.header("cache-control"), Some("no-store"));
        assert!(!response.body.to_string().contains(&issued));
        assert!(!response.body.to_string().contains(HOST));
    }
    assert_eq!(wrong_owner.body, unknown.body);
    assert_eq!(unknown.body, expired.body);
    app.finish().await;
}

#[tokio::test]
async fn unbound_tickets_bind_once_and_never_redirect_after_the_bound_server_stops() {
    let app = seeded().await;
    let server = Client::server(&app);
    let owner = app.user("binding_native", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    let first = register(&server, registration()).await;
    let response = native
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["serverId"], first);
    let second = register(&server, registration()).await;
    server
        .op("stopGameServer", &[("serverId", &first)], Value::Null)
        .await;
    let response = native
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    assert_eq!(response.status, StatusCode::CONFLICT);
    assert_eq!(response.body["code"], "server_unavailable");
    assert_eq!(response.header("cache-control"), Some("no-store"));
    let bound: i64 =
        sqlx::query_scalar("SELECT server_id FROM matchmaker.join_tickets WHERE ticket_hash = $1")
            .bind(token_hash(&issued))
            .fetch_one(&app.db)
            .await
            .expect("test fixture");
    assert_eq!(bound.to_string(), first);
    assert_ne!(bound.to_string(), second);
    app.finish().await;
}

#[tokio::test]
async fn legacy_registrations_remain_valid_but_cannot_resolve_or_redirect() {
    let app = seeded().await;
    let server = Client::server(&app);
    let owner = app.user("legacy_native", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let legacy = register(
        &server,
        json!({ "gameId": GAME, "placeId": PLACE, "region": "us-east", "maxPlayers": 2 }),
    )
    .await;
    let issued = ticket(&native, Some(&legacy)).await;
    register(&server, registration()).await;
    assert_eq!(
        native
            .op("connectJoinTicket", &[], json!({ "ticket": issued }))
            .await
            .status,
        StatusCode::CONFLICT
    );
    let redeemed = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": legacy }),
        )
        .await;
    assert_eq!(redeemed.status, StatusCode::OK);
    assert_eq!(redeemed.body["ageBand"], "adult");
    app.finish().await;
}

#[tokio::test]
async fn registration_connection_fields_are_all_or_none_and_reject_hostile_values() {
    let app = seeded().await;
    let server = Client::server(&app);
    for field in [
        "host",
        "port",
        "certSha256",
        "protocolMajor",
        "engineVersion",
        "buildId",
    ] {
        let mut partial = registration();
        partial.as_object_mut().expect("test fixture").remove(field);
        assert_eq!(
            server.op("registerGameServer", &[], partial).await.status,
            StatusCode::BAD_REQUEST
        );
        let mut null = registration();
        null[field] = Value::Null;
        assert_eq!(
            server.op("registerGameServer", &[], null).await.status,
            StatusCode::BAD_REQUEST
        );
    }
    for (field, value) in [
        ("host", json!("https://sensitive.invalid/path")),
        ("host", json!("user@sensitive.invalid")),
        ("host", json!("999.999.999.999")),
        ("host", json!("bad..example")),
        ("host", json!("[2001:db8::1]")),
        ("host", json!("x".repeat(254))),
        ("port", json!(0)),
        ("port", json!(65536)),
        ("port", json!("sensitive.invalid")),
        ("port", json!(1.5)),
        ("certSha256", json!("x".repeat(64))),
        ("certSha256", json!("a".repeat(63))),
        ("protocolMajor", json!(0)),
        ("protocolMajor", json!(-1)),
        ("protocolMajor", json!(2147483648_i64)),
        ("engineVersion", json!("v".repeat(65))),
        ("engineVersion", json!("bad version")),
        ("buildId", json!("b".repeat(129))),
        ("buildId", json!("bad/build")),
    ] {
        let mut invalid = registration();
        invalid[field] = value;
        let response = server.op("registerGameServer", &[], invalid).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        assert!(!response.body.to_string().contains("sensitive.invalid"));
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM matchmaker.servers")
        .fetch_one(&app.db)
        .await
        .expect("test fixture");
    assert_eq!(count, 0, "rejected registrations must not write rows");
    let mut valid = registration();
    valid["host"] = json!("2001:db8::1"); // Documentation-only IPv6 fixture.
    valid["certSha256"] = json!(CERT.to_uppercase());
    valid["port"] = json!(65535);
    let id = register(&server, valid).await;
    let stored: (String, String) =
        sqlx::query_as("SELECT host, cert_sha256 FROM matchmaker.servers WHERE id = $1")
            .bind(id.parse::<i64>().expect("test fixture"))
            .fetch_one(&app.db)
            .await
            .expect("test fixture");
    assert_eq!(stored, ("2001:db8::1".to_owned(), CERT.to_owned()));
    app.finish().await;
}

#[tokio::test]
async fn concurrent_connects_bind_to_one_server_and_redemption_is_single_use() {
    let app = seeded().await;
    let server = Client::server(&app);
    let owner = app.user("concurrent_native", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    register(&server, registration()).await;
    register(&server, registration()).await;
    let (first, second) = tokio::join!(
        native.op("connectJoinTicket", &[], json!({ "ticket": issued })),
        native.op("connectJoinTicket", &[], json!({ "ticket": issued }))
    );
    assert_eq!(first.status, StatusCode::OK);
    assert_eq!(second.status, StatusCode::OK);
    assert_eq!(first.body["serverId"], second.body["serverId"]);
    let id = first.body["serverId"].as_str().expect("test fixture");
    let (first, second) = tokio::join!(
        server.op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": id })
        ),
        server.op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": id })
        )
    );
    let mut statuses = [first.status.as_u16(), second.status.as_u16()];
    statuses.sort();
    assert_eq!(statuses, [200, 410]);
    app.finish().await;
}

#[tokio::test]
async fn privileged_redemption_uses_existing_minor_band_without_changing_private_defaults() {
    let app = seeded().await;
    let server = Client::server(&app);
    let child = app.signup("metadata_child", "2017-01-01").await;
    let consent = app.last_email_token("parent.metadata_child@example.com");
    assert_eq!(
        app.anon()
            .op("verifyEmail", &[], json!({ "token": consent }))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    let before = child.op("getMe", &[], Value::Null).await;
    let id = register(&server, registration()).await;
    let issued = ticket(&child, Some(&id)).await;
    let response = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": id }),
        )
        .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["ageBand"], "under_13");
    assert_eq!(response.body.get("partyId"), Some(&Value::Null));
    // M2 (spec 8): chat and voice are explicit and stay off for under-13 accounts.
    assert_eq!(response.body["chatAllowed"], false);
    assert_eq!(response.body["voiceAllowed"], false);
    for field in ["birthDate", "email", "isPlaceEditor"] {
        assert!(response.body.get(field).is_none());
    }
    let after = child.op("getMe", &[], Value::Null).await;
    assert_eq!(before.body["settings"], after.body["settings"]);
    let public = app
        .anon()
        .op("getUser", &[("userId", &child.id_str())], Value::Null)
        .await;
    assert!(public.body.get("ageBand").is_none());
    assert_eq!(public.body["id"], child.id_str());
    app.finish().await;
}

#[tokio::test]
async fn unbound_resolution_requires_live_joinable_capacity_and_exact_game_place() {
    let app = seeded().await;
    let server = Client::server(&app);
    let owner = app.user("eligible_native", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    for query in [
        "UPDATE matchmaker.servers SET last_heartbeat_at = now() - interval '1 minute' WHERE id = $1",
        "UPDATE matchmaker.servers SET status = 'draining' WHERE id = $1",
        "UPDATE matchmaker.servers SET status = 'starting' WHERE id = $1",
        "UPDATE matchmaker.servers SET joinable = false WHERE id = $1",
        "UPDATE matchmaker.servers SET player_ids = ARRAY[1,2]::bigint[] WHERE id = $1",
        "UPDATE matchmaker.servers SET place_id = place_id + 1 WHERE id = $1",
        "UPDATE matchmaker.servers SET game_id = game_id + 1 WHERE id = $1",
    ] {
        let id = register(&server, registration()).await;
        app.sql(query, id.parse().expect("test fixture")).await;
    }
    let response = native
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    assert_eq!(response.status, StatusCode::CONFLICT);
    assert_eq!(response.body["code"], "server_unavailable");
    let unbound: bool = sqlx::query_scalar(
        "SELECT server_id IS NULL FROM matchmaker.join_tickets WHERE ticket_hash = $1",
    )
    .bind(token_hash(&issued))
    .fetch_one(&app.db)
    .await
    .expect("test fixture");
    assert!(unbound);
    let eligible = register(&server, registration()).await;
    let response = native
        .op("connectJoinTicket", &[], json!({ "ticket": issued }))
        .await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["serverId"], eligible);
    app.finish().await;
}

#[tokio::test]
async fn lock_waiting_cannot_revive_an_expired_ticket_or_extend_its_lifetime() {
    let app = seeded_for_lock_waits().await;
    let server = Client::server(&app);
    let owner = app.user("expiry_waiter", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    register(&server, registration()).await;
    let hash = token_hash(&issued);
    let expires: time::OffsetDateTime = sqlx::query_scalar("UPDATE matchmaker.join_tickets SET expires_at = clock_timestamp() + make_interval(secs => $2::float8) WHERE ticket_hash = $1 RETURNING expires_at")
        .bind(&hash).bind(LOCK_WINDOW_SECS).fetch_one(&app.db).await.expect("short expiry");
    let (blocker, pid) = hold_row(
        &app,
        "SELECT ticket_hash FROM matchmaker.join_tickets WHERE ticket_hash = $1 FOR UPDATE",
        hash.clone(),
    )
    .await;
    let release_after_expiry = async {
        wait_for_blocked_transaction_then_wall_clock(&app, pid, expires).await;
        blocker.commit().await.expect("release expired ticket");
    };
    let (response, ()) = tokio::join!(
        native.op("connectJoinTicket", &[], json!({ "ticket": issued })),
        release_after_expiry
    );
    assert_eq!(response.status, StatusCode::GONE);
    assert_eq!(response.body["code"], "ticket_invalid");
    let unchanged: bool = sqlx::query_scalar("SELECT server_id IS NULL AND redeemed_at IS NULL AND expires_at = $2 FROM matchmaker.join_tickets WHERE ticket_hash = $1")
        .bind(&hash).bind(expires).fetch_one(&app.db).await.expect("expired ticket state");
    assert!(unchanged);
    app.finish().await;
}

/// How long a request has, from the moment a test sets a time boundary, to start its transaction and reach the held
/// row lock. Generous on purpose: under a parallel `cargo test` a request can take seconds to get there.
const LOCK_WINDOW_SECS: f64 = 20.0;

/// A seeded app whose request timeout outlasts a full lock window (the request may wait that long on the lock).
async fn seeded_for_lock_waits() -> TestApp {
    let mut config = crate::support::test_config();
    config.request_timeout = std::time::Duration::from_secs_f64(LOCK_WINDOW_SECS * 3.0);
    let app = TestApp::with_config(config).await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    app
}

/// Starts a transaction holding `lock_sql` (a `SELECT ... FOR UPDATE` on one unchanged row) and returns it with its
/// backend pid, so the waiter can be found exactly with `pg_blocking_pids`.
async fn hold_row<'a, T>(
    app: &'a TestApp,
    lock_sql: &'static str,
    key: T,
) -> (sqlx::Transaction<'a, sqlx::Postgres>, i32)
where
    T: for<'q> sqlx::Encode<'q, sqlx::Postgres> + sqlx::Type<sqlx::Postgres> + Send + 'a,
{
    let mut blocker = app.db.begin().await.expect("blocker transaction");
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *blocker)
        .await
        .expect("blocker pid");
    sqlx::query(lock_sql)
        .bind(key)
        .execute(&mut *blocker)
        .await
        .expect("hold unchanged row");
    (blocker, pid)
}

/// Waits (on real conditions, no fixed sleep) until a request is blocked behind `blocker_pid` in a transaction that
/// began before `boundary`, then until the database clock has passed `boundary`.
async fn wait_for_blocked_transaction_then_wall_clock(
    app: &TestApp,
    blocker_pid: i32,
    boundary: time::OffsetDateTime,
) {
    let deadline = std::time::Duration::from_secs_f64(LOCK_WINDOW_SECS * 2.0);
    tokio::time::timeout(deadline, async {
        loop {
            let waiter: Option<bool> = sqlx::query_scalar(
                "SELECT xact_start < $2 FROM pg_stat_activity WHERE datname = current_database() \
                 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid)) ORDER BY pid LIMIT 1",
            )
            .bind(blocker_pid)
            .bind(boundary)
            .fetch_optional(&app.db)
            .await
            .expect("inspect only this test database's waiters");
            match waiter {
                Some(true) => break,
                Some(false) => panic!(
                    "the request reached the lock after the boundary; it needs more than {LOCK_WINDOW_SECS} s"
                ),
                None => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
            }
        }
        loop {
            let crossed: bool = sqlx::query_scalar("SELECT clock_timestamp() >= $1")
                .bind(boundary)
                .fetch_one(&app.db)
                .await
                .expect("database wall clock");
            if crossed {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("the request must reach the held lock, and the clock pass the boundary, within the window");
}

#[tokio::test]
async fn server_lock_wait_rechecks_heartbeat_freshness_before_binding() {
    let app = seeded_for_lock_waits().await;
    let server = Client::server(&app);
    let owner = app.user("server_waiter", "1990-01-01").await;
    let token = native_token(&app, &owner, "profile play").await;
    let native = owner.with_bearer(&token);
    let issued = ticket(&native, None).await;
    let id = register(&server, registration()).await;
    let id: i64 = id.parse().expect("server id");
    // Fresh for LOCK_WINDOW_SECS more (servers are live for 30 s after a heartbeat).
    let stale_at: time::OffsetDateTime = sqlx::query_scalar("UPDATE matchmaker.servers SET last_heartbeat_at = clock_timestamp() - make_interval(secs => 30 - $2::float8) WHERE id = $1 RETURNING last_heartbeat_at + interval '30 seconds'")
        .bind(id).bind(LOCK_WINDOW_SECS).fetch_one(&app.db).await.expect("near-stale heartbeat");
    let (blocker, pid) = hold_row(
        &app,
        "SELECT id FROM matchmaker.servers WHERE id = $1 FOR UPDATE",
        id,
    )
    .await;
    let release = async {
        wait_for_blocked_transaction_then_wall_clock(&app, pid, stale_at).await;
        blocker.commit().await.expect("release stale server");
    };
    let (response, ()) = tokio::join!(
        native.op("connectJoinTicket", &[], json!({ "ticket": issued })),
        release
    );
    assert_eq!(response.status, StatusCode::CONFLICT);
    assert_eq!(response.body["code"], "server_unavailable");
    let unbound: bool = sqlx::query_scalar("SELECT server_id IS NULL AND redeemed_at IS NULL FROM matchmaker.join_tickets WHERE ticket_hash = $1")
        .bind(token_hash(&issued)).fetch_one(&app.db).await.expect("unbound ticket");
    assert!(unbound);
    app.finish().await;
}

#[tokio::test]
async fn redeem_lock_wait_cannot_consume_a_ticket_that_expired_while_blocked() {
    let app = seeded_for_lock_waits().await;
    let server = Client::server(&app);
    let owner = app.user("redeem_waiter", "1990-01-01").await;
    let id = register(&server, registration()).await;
    let issued = ticket(&owner, Some(&id)).await;
    let hash = token_hash(&issued);
    let expires: time::OffsetDateTime = sqlx::query_scalar("UPDATE matchmaker.join_tickets SET expires_at = clock_timestamp() + make_interval(secs => $2::float8) WHERE ticket_hash = $1 RETURNING expires_at")
        .bind(&hash).bind(LOCK_WINDOW_SECS).fetch_one(&app.db).await.expect("near ticket expiry");
    let (blocker, pid) = hold_row(
        &app,
        "SELECT ticket_hash FROM matchmaker.join_tickets WHERE ticket_hash = $1 FOR UPDATE",
        hash.clone(),
    )
    .await;
    let release = async {
        wait_for_blocked_transaction_then_wall_clock(&app, pid, expires).await;
        blocker.commit().await.expect("release expired ticket");
    };
    let (response, ()) = tokio::join!(
        server.op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": issued, "serverId": id })
        ),
        release
    );
    assert_eq!(response.status, StatusCode::GONE);
    assert_eq!(response.body["code"], "ticket_invalid");
    let unused: bool = sqlx::query_scalar(
        "SELECT redeemed_at IS NULL FROM matchmaker.join_tickets WHERE ticket_hash = $1",
    )
    .bind(&hash)
    .fetch_one(&app.db)
    .await
    .expect("not consumed");
    assert!(unused);
    app.finish().await;
}
