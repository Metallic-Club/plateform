//! M2 multiplayer backend: host tokens, host agent register/heartbeat/orders, matchmaker allocation (race-safe),
//! signed tickets verified with the published keys, knock tokens, drain and liveness.

use std::{
    future::{Future, poll_fn},
    net::IpAddr,
    pin::Pin,
    task::Poll,
};

use axum::http::StatusCode;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use metallic_platform::{
    matchmaker::{hosts, internal::stop_stale_servers, ticket},
    seed,
};
use serde_json::{Value, json};

use crate::support::{Auth, Client, PASSWORD, Resp, TestApp};

const GAME: &str = "1000000000000101";
const PLACE: &str = "1000000000001101";
const CERT: &str = "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";

async fn seeded() -> TestApp {
    let app = TestApp::new().await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    app
}

/// Polls all futures on this task so their database work overlaps (no extra crate needed).
async fn join_all<F: Future>(futures: Vec<F>) -> Vec<F::Output> {
    let mut futures: Vec<Pin<Box<F>>> = futures.into_iter().map(Box::pin).collect();
    let mut out: Vec<Option<F::Output>> = futures.iter().map(|_| None).collect();
    poll_fn(|cx| {
        let mut done = true;
        for (i, f) in futures.iter_mut().enumerate() {
            if out[i].is_none() {
                match f.as_mut().poll(cx) {
                    Poll::Ready(v) => out[i] = Some(v),
                    Poll::Pending => done = false,
                }
            }
        }
        if done { Poll::Ready(()) } else { Poll::Pending }
    })
    .await;
    out.into_iter().map(|o| o.expect("finished")).collect()
}

/// A client on its own address that authenticates with `token` (a host agent).
fn bearer<'a>(app: &'a TestApp, token: &str) -> Client<'a> {
    Client {
        app,
        auth: Auth::Bearer(token.to_owned()),
        ip: app.next_ip(),
        user: None,
        peer: None,
    }
}

/// Creates a host with the admin function and returns (id, a client authenticated with its token).
async fn host<'a>(app: &'a TestApp, name: &str, max_servers: i32) -> (String, Client<'a>) {
    let (id, token) = hosts::add_host(&app.db, &app.state.ids, name, "us-east", max_servers, 500)
        .await
        .expect("host add");
    assert!(token.starts_with("mht_") && token.len() == 47);
    let stored: Vec<u8> =
        sqlx::query_scalar("SELECT token_hash FROM matchmaker.hosts WHERE id = $1")
            .bind(id)
            .fetch_one(&app.db)
            .await
            .expect("hash");
    assert_ne!(stored, token.as_bytes(), "only the hash is stored");
    (id.to_string(), bearer(app, &token))
}

fn registration() -> Value {
    json!({ "region": "us-east", "agentVersion": "0.2.0", "engineVersion": "0.2.0-dev", "protocolMajor": 1,
        "engineBuilds": ["fixture-build-2"],
        "capacity": { "cores": 8, "memoryMiB": 32768, "maxServers": 4, "maxPlayers": 400 },
        "edge": { "port": 47000, "certSha256": CERT } })
}

async fn register(h: &Client<'_>) -> Resp {
    let r = h.op("registerHost", &[], registration()).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r
}

fn beat_body(servers: Value) -> Value {
    json!({ "load": { "cpu": 12.5, "memoryMiB": 2048, "upMbps": 3.5 }, "edge": { "certSha256": CERT }, "servers": servers })
}

async fn beat(h: &Client<'_>, host_id: &str, servers: Value) -> Vec<Value> {
    let r = h
        .op("heartbeatHost", &[("hostId", host_id)], beat_body(servers))
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.header("cache-control"), Some("no-store"));
    r.body["orders"].as_array().expect("orders").clone()
}

fn ready(server: &str, players: &[String]) -> Value {
    json!({ "serverId": server, "kind": "play", "status": "ready", "players": players, "joinable": true, "tickP99Ms": 4.2 })
}

fn start_ids(orders: &[Value]) -> Vec<String> {
    orders
        .iter()
        .filter(|o| o["type"] == "start")
        .map(|o| o["serverId"].as_str().expect("id").to_owned())
        .collect()
}

async fn join(player: &Client<'_>) -> Resp {
    player
        .op("createJoinTicket", &[("gameId", GAME)], json!({}))
        .await
}

async fn native_token(app: &TestApp, user: &Client<'_>) -> String {
    let anon = app.anon();
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player", "scope": "play" }),
        )
        .await;
    user.op(
        "approveDeviceAuthorization",
        &[],
        json!({ "userCode": r.body["user_code"], "approve": true }),
    )
    .await;
    let r = anon.op("exchangeToken", &[], json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": r.body["device_code"], "client_id": "metallic-player" })).await;
    r.body["access_token"].as_str().expect("token").to_owned()
}

/// A published key as the edge keeps it: kid, key and validity window (Unix seconds).
type Published = (String, VerifyingKey, Option<i64>, Option<i64>);

fn window(k: &Value, field: &str) -> Option<i64> {
    k[field].as_str().map(|t| {
        time::OffsetDateTime::parse(t, &time::format_description::well_known::Rfc3339)
            .expect("RFC 3339")
            .unix_timestamp()
    })
}

/// The lookup an offline verifier does: by kid, with the published window.
fn lookup<'k>(published: &'k [Published], kid: &str) -> Option<ticket::KeyRef<'k>> {
    published
        .iter()
        .find(|(k, ..)| k == kid)
        .map(|(_, key, not_before, not_after)| ticket::KeyRef {
            key,
            not_before: *not_before,
            not_after: *not_after,
        })
}

async fn keys(app: &TestApp) -> Vec<Published> {
    let r = app.anon().op("getNetKeys", &[], Value::Null).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.header("cache-control"), Some("public, max-age=300"));
    r.body["keys"]
        .as_array()
        .expect("keys")
        .iter()
        .map(|k| {
            assert_eq!(
                (k["alg"].as_str(), k["kty"].as_str()),
                (Some("Ed25519"), Some("OKP"))
            );
            let x: [u8; 32] = URL_SAFE_NO_PAD
                .decode(k["x"].as_str().expect("x"))
                .expect("b64")
                .try_into()
                .expect("32 bytes");
            (
                k["kid"].as_str().expect("kid").to_owned(),
                VerifyingKey::from_bytes(&x).expect("key"),
                window(k, "notBefore"),
                window(k, "notAfter"),
            )
        })
        .collect()
}

/// Live servers of the test game, as `getLiveCounts` reports them.
async fn live(app: &TestApp) -> i64 {
    app.anon()
        .op("getLiveCounts", &[("?gameIds", GAME)], Value::Null)
        .await
        .body["items"][0]["servers"]
        .as_i64()
        .expect("servers")
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

async fn servers_of_place(app: &TestApp) -> i64 {
    sqlx::query_scalar(
        "SELECT count(*) FROM matchmaker.servers WHERE place_id = $1 AND status <> 'stopped'",
    )
    .bind(PLACE.parse::<i64>().expect("id"))
    .fetch_one(&app.db)
    .await
    .expect("count")
}

#[tokio::test]
async fn host_agent_allocates_starts_and_issues_tickets_verified_offline() {
    let app = seeded().await;
    let (host_id, h) = host(&app, "home-1", 4).await;
    let player = app.user("m2_ada", "1990-01-01").await;

    // Heartbeat before registration: 410, register again.
    let r = h
        .op(
            "heartbeatHost",
            &[("hostId", &host_id)],
            beat_body(json!([])),
        )
        .await;
    assert_eq!(r.status, StatusCode::GONE);
    let r = register(&h).await;
    assert_eq!(r.body["hostId"], host_id.as_str());
    assert_eq!(r.body["observedAddress"], h.ip.as_str());

    // No server: the matchmaker allocates one and answers pending; a second join does not allocate again.
    let r = join(&player).await;
    assert_eq!(r.status, StatusCode::ACCEPTED, "{}", r.body);
    assert_eq!(r.body["status"], "pending");
    assert_eq!(r.header("retry-after"), Some("2"));
    assert_eq!(join(&player).await.status, StatusCode::ACCEPTED);
    assert_eq!(servers_of_place(&app).await, 1);

    // The order rides back on the heartbeat (outbound only) and repeats until the agent reports the server.
    let orders = beat(&h, &host_id, json!([])).await;
    let started = start_ids(&orders);
    assert_eq!(started.len(), 1, "{orders:?}");
    let order = orders.iter().find(|o| o["type"] == "start").expect("start");
    assert_eq!(
        (order["gameId"].as_str(), order["placeId"].as_str()),
        (Some(GAME), Some(PLACE))
    );
    assert_eq!(
        (order["kind"].as_str(), order["region"].as_str()),
        (Some("play"), Some("us-east"))
    );
    let sid = started[0].clone();
    assert_eq!(
        start_ids(&beat(&h, &host_id, json!([])).await),
        std::slice::from_ref(&sid)
    );
    let starting = json!([{ "serverId": sid, "kind": "play", "status": "starting", "players": [], "joinable": false }]);
    assert!(
        beat(&h, &host_id, starting).await.is_empty(),
        "reported: no more start orders"
    );
    assert_eq!(
        join(&player).await.status,
        StatusCode::ACCEPTED,
        "still starting"
    );
    assert!(
        beat(&h, &host_id, json!([ready(&sid, &[])]))
            .await
            .is_empty()
    );

    // Ready: a signed ticket bound to that server, verifiable offline with the published key.
    let r = join(&player).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["status"], "ready");
    assert_eq!(r.body["serverId"], sid.as_str());
    let t = r.body["ticket"].as_str().expect("ticket").to_owned();
    assert!(t.starts_with("mjt1.") && t.len() <= 512);
    assert!(r.body["launchUri"].as_str().expect("uri").ends_with(&t));
    let published = keys(&app).await;
    let claims =
        ticket::verify(&t, now(), |kid| lookup(&published, kid)).expect("verifies offline");
    assert_eq!(claims.server.to_string(), sid);
    assert_eq!(claims.user, player.user_id());
    assert_eq!(claims.place.to_string(), PLACE);
    assert_eq!(
        (claims.aud.as_str(), claims.kind),
        (ticket::AUDIENCE, ticket::Kind::Play)
    );
    assert_eq!((claims.region.as_str(), claims.ip), ("us-east", None));
    assert!(claims.exp - claims.iat <= 60);
    assert_eq!(
        URL_SAFE_NO_PAD.encode(claims.jti),
        r.body["ticketId"].as_str().expect("jti")
    );

    // Connect: the host's edge (observed address), not a process; sni and an IP-bound knock token.
    let native = player.with_bearer(&native_token(&app, &player).await);
    let r = native
        .op("connectJoinTicket", &[], json!({ "ticket": t }))
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["host"], h.ip.as_str());
    assert_eq!(r.body["port"], 47000);
    assert_eq!(r.body["certSha256"], CERT);
    assert_eq!(r.body["sni"], &CERT[..16]);
    assert_eq!(r.body["buildId"], "fixture-build-2");
    assert_eq!(r.body["protocol"], "metallic/1");
    let knock = ticket::verify_knock(
        r.body["knockToken"].as_str().expect("knock"),
        now(),
        |kid| lookup(&published, kid),
    )
    .expect("knock verifies");
    assert_eq!(knock.ip, native.ip.parse::<IpAddr>().expect("ip"));
    assert_eq!(knock.server.to_string(), sid);

    // The deprecated shared secret cannot redeem a host's ticket; the host can, once.
    let legacy = Client::server(&app);
    let r = legacy
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t, "serverId": sid }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let r = h
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t, "serverId": sid }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    assert_eq!(r.body["kind"], "play");
    assert_eq!(r.body["canEdit"], false);
    assert_eq!(r.body["accountStatus"], "active");
    assert_eq!(r.body["chatAllowed"], false, "off until the policy switch");
    assert_eq!(r.body["voiceAllowed"], false);
    let r = h
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t, "serverId": sid }),
        )
        .await;
    assert_eq!(r.status, StatusCode::GONE, "single use");

    // The player shows up in the next heartbeat: live counts include the server.
    beat(&h, &host_id, json!([ready(&sid, &[player.id_str()])])).await;
    let r = app
        .anon()
        .op("getLiveCounts", &[("?gameIds", GAME)], Value::Null)
        .await;
    assert_eq!(r.body["items"][0]["playing"], 1);
    app.finish().await;
}

#[tokio::test]
async fn concurrent_quick_joins_never_overfill_or_overallocate() {
    let app = seeded().await;
    let (host_id, h) = host(&app, "home-2", 2).await;
    register(&h).await;
    let mut players = Vec::new();
    for i in 0..12 {
        players.push(app.user(&format!("m2_racer{i}"), "1990-01-01").await);
    }

    // 12 simultaneous joins on an empty place allocate exactly one server.
    let results = join_all(players.iter().map(join).collect()).await;
    assert!(results.iter().all(|r| r.status == StatusCode::ACCEPTED));
    assert_eq!(servers_of_place(&app).await, 1);
    let sid = start_ids(&beat(&h, &host_id, json!([])).await).remove(0);
    // A 4-slot server (no friend reserve under 8 slots) so the race is on capacity.
    app.sql(
        "UPDATE matchmaker.servers SET max_players = 4 WHERE id = $1",
        sid.parse().expect("id"),
    )
    .await;
    beat(&h, &host_id, json!([ready(&sid, &[])])).await;

    // 12 simultaneous joins on a 4-slot server: 4 tickets bound to it, everyone else pending on ONE new server.
    let results = join_all(players.iter().map(join).collect()).await;
    let bound: Vec<&Resp> = results
        .iter()
        .filter(|r| r.status == StatusCode::CREATED)
        .collect();
    assert_eq!(
        bound.len(),
        4,
        "{:?}",
        results.iter().map(|r| r.status).collect::<Vec<_>>()
    );
    assert!(bound.iter().all(|r| r.body["serverId"] == sid.as_str()));
    assert!(
        results
            .iter()
            .all(|r| r.status == StatusCode::CREATED || r.status == StatusCode::ACCEPTED)
    );
    assert_eq!(
        servers_of_place(&app).await,
        2,
        "one more server, not eight"
    );
    let reserved: i64 = sqlx::query_scalar(
        "SELECT count(DISTINCT user_id) FROM matchmaker.join_tickets WHERE server_id = $1 AND redeemed_at IS NULL",
    )
    .bind(sid.parse::<i64>().expect("id"))
    .fetch_one(&app.db)
    .await
    .expect("count");
    assert_eq!(reserved, 4);

    // The host is now at its 2-server limit: with both servers closed to joins, a newcomer cannot be placed.
    sqlx::query("UPDATE matchmaker.servers SET status = 'running', joinable = false WHERE status = 'starting'")
        .execute(&app.db)
        .await
        .expect("sql");
    let late = app.user("m2_late", "1990-01-01").await;
    let r = join(&late).await;
    assert_eq!(r.status, StatusCode::SERVICE_UNAVAILABLE, "{}", r.body);
    assert_eq!(r.body["code"], "no_capacity");
    assert_eq!(r.header("retry-after"), Some("10"));
    app.finish().await;
}

#[tokio::test]
async fn hosts_are_scoped_to_their_own_servers_and_tokens_rotate() {
    let app = seeded().await;
    let (a_id, a) = host(&app, "host-a", 4).await;
    let (b_id, b) = host(&app, "host-b", 4).await;
    register(&a).await;
    register(&b).await;
    let player = app.user("m2_bo", "1990-01-01").await;
    assert_eq!(join(&player).await.status, StatusCode::ACCEPTED);
    // One of them got the allocation; call it `owner`.
    let mut owner = (&a_id, &a, &b_id, &b);
    let mut sid = start_ids(&beat(&a, &a_id, json!([])).await);
    if sid.is_empty() {
        owner = (&b_id, &b, &a_id, &a);
        sid = start_ids(&beat(&b, &b_id, json!([])).await);
    }
    let (o_id, o, x_id, x) = owner;
    let sid = sid.remove(0);
    beat(o, o_id, json!([ready(&sid, &[])])).await;
    let r = join(&player).await;
    assert_eq!(r.status, StatusCode::CREATED);
    let t = r.body["ticket"].as_str().expect("ticket").to_owned();

    // The other host cannot see, redeem, beat or stop it; reporting it gets a stop order and changes nothing.
    let r = x
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t, "serverId": sid }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let orders = beat(x, x_id, json!([ready(&sid, &[player.id_str()])])).await;
    assert!(orders.contains(&json!({ "type": "stop", "serverId": sid })));
    assert_eq!(
        x.op(
            "heartbeatGameServer",
            &[("serverId", &sid)],
            json!({ "players": [] })
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        x.op("stopGameServer", &[("serverId", &sid)], Value::Null)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let legacy = Client::server(&app);
    assert_eq!(
        legacy
            .op("stopGameServer", &[("serverId", &sid)], Value::Null)
            .await
            .status,
        StatusCode::NOT_FOUND,
        "the shared secret only reaches servers without a host"
    );
    // A host can only address its own host id.
    let r = x
        .op("heartbeatHost", &[("hostId", o_id)], beat_body(json!([])))
        .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    assert_eq!(
        x.op("rotateHostToken", &[("hostId", o_id)], Value::Null)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        legacy.op("registerHost", &[], registration()).await.status,
        StatusCode::UNAUTHORIZED
    );

    // Invalid input is rejected before anything is written, without echoing values.
    let mut bad = registration();
    bad["edge"]["publicHost"] = json!("http://evil.example/x");
    let r = o.op("registerHost", &[], bad).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(!r.body.to_string().contains("evil"));
    let mut bad = registration();
    bad["region"] = json!("eu-central");
    assert_eq!(
        o.op("registerHost", &[], bad).await.status,
        StatusCode::BAD_REQUEST
    );
    let r = o
        .op("heartbeatHost", &[("hostId", o_id)], json!({ "load": { "cpu": 500, "memoryMiB": 1, "upMbps": 1 }, "edge": { "certSha256": CERT }, "servers": [] }))
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    // Bad tokens: one uniform 401 that echoes nothing; repeated failures from one address: 429.
    let fake = bearer(&app, &format!("mht_{}", "A".repeat(43)));
    let r = fake.op("registerHost", &[], registration()).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    assert!(!r.body.to_string().contains("AAAA"));
    let mut limited = false;
    for _ in 0..25 {
        limited |= fake.op("registerHost", &[], registration()).await.status
            == StatusCode::TOO_MANY_REQUESTS;
    }
    assert!(limited);

    // Rotation: the agent is ordered to rotate, gets a new token once, and the old one keeps working 10 minutes.
    hosts::request_rotation(&app.db, "host-a")
        .await
        .expect("rotate");
    let orders = beat(&a, &a_id, json!([])).await;
    assert!(
        orders.contains(&json!({ "type": "rotateToken" })),
        "{orders:?}"
    );
    let r = a
        .op("rotateHostToken", &[("hostId", &a_id)], Value::Null)
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.header("cache-control"), Some("no-store"));
    let fresh = bearer(&app, r.body["token"].as_str().expect("token"));
    assert!(
        !beat(&a, &a_id, json!([]))
            .await
            .contains(&json!({ "type": "rotateToken" }))
    );
    beat(&fresh, &a_id, json!([])).await;
    sqlx::query("UPDATE matchmaker.hosts SET prev_token_expires_at = now() - interval '1 second' WHERE name = 'host-a'")
        .execute(&app.db)
        .await
        .expect("sql");
    let r = a
        .op("heartbeatHost", &[("hostId", &a_id)], beat_body(json!([])))
        .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED, "old token expired");
    // Reset and disable stop a token at once.
    let reset = hosts::reset_token(&app.db, "host-a").await.expect("reset");
    assert_eq!(
        fresh
            .op("heartbeatHost", &[("hostId", &a_id)], beat_body(json!([])))
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    let reset = bearer(&app, &reset);
    beat(&reset, &a_id, json!([])).await;
    hosts::set_host_status(&app.db, "host-a", "disabled")
        .await
        .expect("disable");
    assert_eq!(
        reset
            .op("heartbeatHost", &[("hostId", &a_id)], beat_body(json!([])))
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    app.finish().await;
}

#[tokio::test]
async fn drain_and_silent_hosts_leave_counts_and_allocation() {
    let app = seeded().await;
    let (host_id, h) = host(&app, "home-3", 4).await;
    register(&h).await;
    let ada = app.user("m2_cy", "1990-01-01").await;
    assert_eq!(join(&ada).await.status, StatusCode::ACCEPTED);
    let sid = start_ids(&beat(&h, &host_id, json!([])).await).remove(0);
    beat(&h, &host_id, json!([ready(&sid, &[ada.id_str()])])).await;
    assert_eq!(live(&app).await, 1);

    // Admin drain: a drain order, no new joins (a new server is allocated instead), out of the live counts.
    hosts::set_server_desired(&app.db, sid.parse().expect("id"), "drain")
        .await
        .expect("drain");
    let orders = beat(&h, &host_id, json!([ready(&sid, &[ada.id_str()])])).await;
    assert!(
        orders.contains(
            &json!({ "type": "drain", "serverId": sid, "reason": "admin", "deadlineSecs": 300 })
        ),
        "{orders:?}"
    );
    assert_eq!(live(&app).await, 0);
    let bo = app.user("m2_dee", "1990-01-01").await;
    assert_eq!(join(&bo).await.status, StatusCode::ACCEPTED);
    let next = start_ids(&beat(&h, &host_id, json!([ready(&sid, &[ada.id_str()])])).await);
    assert_eq!(next.len(), 1);
    assert_ne!(next[0], sid);
    // Draining and empty: stop.
    let draining = json!([{ "serverId": sid, "kind": "play", "status": "draining", "players": [], "joinable": false }]);
    let orders = beat(&h, &host_id, draining).await;
    assert!(
        orders.contains(&json!({ "type": "stop", "serverId": sid })),
        "{orders:?}"
    );
    let stopped = json!([{ "serverId": sid, "kind": "play", "status": "stopped", "players": [], "joinable": false, "exitCode": 0 }]);
    beat(&h, &host_id, stopped).await;
    let status: String = sqlx::query_scalar("SELECT status FROM matchmaker.servers WHERE id = $1")
        .bind(sid.parse::<i64>().expect("id"))
        .fetch_one(&app.db)
        .await
        .expect("status");
    assert_eq!(status, "stopped");

    // The second server comes up; then the host goes silent: out of counts at 30 s, stopped at 120 s.
    let second = next[0].clone();
    beat(&h, &host_id, json!([ready(&second, &[bo.id_str()])])).await;
    assert_eq!(live(&app).await, 1);
    sqlx::query("UPDATE matchmaker.hosts SET last_seen_at = now() - interval '31 seconds'")
        .execute(&app.db)
        .await
        .expect("sql");
    assert_eq!(live(&app).await, 0, "silent host: not counted");
    assert_eq!(
        stop_stale_servers(&app.state).await.expect("job"),
        0,
        "not stopped yet"
    );
    sqlx::query("UPDATE matchmaker.hosts SET last_seen_at = now() - interval '121 seconds'")
        .execute(&app.db)
        .await
        .expect("sql");
    assert_eq!(stop_stale_servers(&app.state).await.expect("job"), 1);

    // Host drain: its servers get drain orders and it gets no allocations.
    hosts::set_host_status(&app.db, "home-3", "draining")
        .await
        .expect("drain");
    let r = join(&ada).await;
    assert_eq!(
        r.status,
        StatusCode::SERVICE_UNAVAILABLE,
        "only host is draining: {}",
        r.body
    );
    app.finish().await;
}

// ------------------------------------------------------------------ security review (FIX-FIRST) regressions

/// A registered host in `region` (`us-east` or `eu-central`), with its agent client.
async fn host_in<'a>(
    app: &'a TestApp,
    name: &str,
    region: &str,
    max_servers: i32,
) -> (String, Client<'a>) {
    let (id, token) = hosts::add_host(&app.db, &app.state.ids, name, region, max_servers, 500)
        .await
        .expect("host add");
    let agent = bearer(app, &token);
    let mut body = registration();
    body["region"] = json!(region);
    body["capacity"]["maxServers"] = json!(20);
    let r = agent.op("registerHost", &[], body).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    (id.to_string(), agent)
}

/// A running, joinable server of the test place on `host` (as if started and reported ready), returning its id.
async fn running_server(app: &TestApp, host: &str, max_players: i32) -> String {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO matchmaker.servers (id, game_id, place_id, region, status, max_players, joinable, host_id) \
         SELECT $1, $2, $3, h.region, 'running', $4, true, h.id FROM matchmaker.hosts h WHERE h.id = $5 RETURNING id",
    )
    .bind(app.state.ids.next())
    .bind(GAME.parse::<i64>().expect("id"))
    .bind(PLACE.parse::<i64>().expect("id"))
    .bind(max_players)
    .bind(host.parse::<i64>().expect("id"))
    .fetch_one(&app.db)
    .await
    .expect("server");
    id.to_string()
}

async fn rotate(c: &Client<'_>, id: &str) -> Resp {
    c.op("rotateHostToken", &[("hostId", id)], Value::Null)
        .await
}

#[tokio::test]
async fn rotation_with_the_previous_token_returns_the_same_token_and_never_mints_another() {
    let app = seeded().await;
    let (id, original) = host_in(&app, "rotor", "us-east", 2).await;
    // Current token rotates.
    let r = rotate(&original, &id).await;
    assert_eq!(r.status, StatusCode::OK);
    let first = r.body["token"].as_str().expect("token").to_owned();
    // The response was "lost": the agent retries with the now-previous token and gets the SAME token back, twice.
    for _ in 0..2 {
        let r = rotate(&original, &id).await;
        assert_eq!(r.status, StatusCode::OK);
        assert_eq!(r.body["token"], first.as_str(), "idempotent, no new token");
    }
    let first_client = bearer(&app, &first);
    // Only the current token rotates further; the old previous token then dies at once (one previous at a time).
    let r = rotate(&first_client, &id).await;
    assert_eq!(r.status, StatusCode::OK);
    let second = r.body["token"].as_str().expect("token").to_owned();
    assert_ne!(second, first);
    assert_eq!(
        rotate(&original, &id).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rotate(&first_client, &id).await.body["token"],
        second.as_str()
    );
    // After the grace window the previous token cannot rotate (or do anything else).
    sqlx::query("UPDATE matchmaker.hosts SET prev_token_expires_at = now() - interval '1 second' WHERE name = 'rotor'")
        .execute(&app.db)
        .await
        .expect("sql");
    assert_eq!(
        rotate(&first_client, &id).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rotate(&bearer(&app, &second), &id).await.status,
        StatusCode::OK
    );
    app.finish().await;
}

#[tokio::test]
async fn a_server_stuck_in_starting_stops_blocking_quick_join() {
    let app = seeded().await;
    let (host_id, h) = host_in(&app, "stuck", "us-east", 3).await;
    let player = app.user("m2_stuck", "1990-01-01").await;
    assert_eq!(join(&player).await.status, StatusCode::ACCEPTED);
    let stuck = start_ids(&beat(&h, &host_id, json!([])).await).remove(0);
    let starting = || json!([{ "serverId": stuck, "kind": "play", "status": "starting", "players": [], "joinable": false }]);
    // The agent keeps reporting `starting` (refreshing the heartbeat) but the server never becomes ready.
    beat(&h, &host_id, starting()).await;
    assert_eq!(join(&player).await.status, StatusCode::ACCEPTED);
    assert_eq!(
        servers_of_place(&app).await,
        1,
        "still waiting on the first allocation"
    );
    sqlx::query(
        "UPDATE matchmaker.servers SET started_at = now() - interval '61 seconds' WHERE id = $1",
    )
    .bind(stuck.parse::<i64>().expect("id"))
    .execute(&app.db)
    .await
    .expect("sql");
    beat(&h, &host_id, starting()).await;
    // Measured from allocation time, not the last heartbeat: the next join allocates a fresh server...
    assert_eq!(join(&player).await.status, StatusCode::ACCEPTED);
    assert_eq!(servers_of_place(&app).await, 2);
    // ...and the stale job stops the stuck one although its heartbeat is fresh.
    assert_eq!(stop_stale_servers(&app.state).await.expect("job"), 1);
    let status: String = sqlx::query_scalar("SELECT status FROM matchmaker.servers WHERE id = $1")
        .bind(stuck.parse::<i64>().expect("id"))
        .fetch_one(&app.db)
        .await
        .expect("status");
    assert_eq!(status, "stopped");
    app.finish().await;
}

#[tokio::test]
async fn concurrent_allocations_across_places_and_regions_do_not_deadlock() {
    let app = seeded().await;
    // Two full hosts in different regions: every allocation locks both, preferring them in opposite orders.
    let (east, _e) = host_in(&app, "full-east", "us-east", 1).await;
    let (west, _w) = host_in(&app, "full-eu", "eu-central", 1).await;
    running_server(&app, &east, 4).await;
    running_server(&app, &west, 4).await;
    sqlx::query("UPDATE matchmaker.servers SET joinable = false WHERE host_id IS NOT NULL")
        .execute(&app.db)
        .await
        .expect("sql");
    let games: Vec<i64> = sqlx::query_scalar(
        "SELECT id FROM games.games WHERE status = 'public' AND start_place_id IS NOT NULL ORDER BY id LIMIT 8",
    )
    .fetch_all(&app.db)
    .await
    .expect("games");
    assert!(games.len() >= 6, "seeded public games");
    let mut players = Vec::new();
    for i in 0..games.len() {
        players.push(app.user(&format!("m2_place{i}"), "1990-01-01").await);
    }
    let ids: Vec<String> = games.iter().map(i64::to_string).collect();
    let joins = players.iter().zip(&ids).enumerate().map(|(i, (p, g))| {
        let region = if i % 2 == 0 { "us-east" } else { "eu-central" };
        async move {
            p.op(
                "createJoinTicket",
                &[("gameId", g)],
                json!({ "region": region }),
            )
            .await
        }
    });
    let results = join_all(joins.collect()).await;
    for r in &results {
        assert_eq!(
            r.status,
            StatusCode::SERVICE_UNAVAILABLE,
            "no deadlock (500): {}",
            r.body
        );
        assert_eq!(r.body["code"], "no_capacity");
    }
    // With room on both hosts the same race allocates one server per place.
    sqlx::query("UPDATE matchmaker.hosts SET max_servers = 20")
        .execute(&app.db)
        .await
        .expect("sql");
    let joins = players.iter().zip(&ids).enumerate().map(|(i, (p, g))| {
        let region = if i % 2 == 0 { "us-east" } else { "eu-central" };
        async move {
            p.op(
                "createJoinTicket",
                &[("gameId", g)],
                json!({ "region": region }),
            )
            .await
        }
    });
    let results = join_all(joins.collect()).await;
    assert!(
        results.iter().all(|r| r.status == StatusCode::ACCEPTED),
        "{:?}",
        results.iter().map(|r| r.status).collect::<Vec<_>>()
    );
    let allocated: i64 =
        sqlx::query_scalar("SELECT count(*) FROM matchmaker.servers WHERE status = 'starting'")
            .fetch_one(&app.db)
            .await
            .expect("count");
    assert_eq!(allocated, games.len() as i64);
    app.finish().await;
}

#[tokio::test]
async fn client_addresses_come_only_from_trusted_proxies_and_must_be_public_outside_dev() {
    // Production-like address rules on a dev database.
    let mut config = crate::support::test_config();
    config.allow_private_addresses = false;
    let app = TestApp::with_config(config).await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    let (_, token) = hosts::add_host(&app.db, &app.state.ids, "edge-1", "us-east", 2, 100)
        .await
        .expect("host add");

    // An untrusted peer cannot choose its address with the forwarded header: the TCP peer is used.
    let mut spoofer = bearer(&app, &token);
    spoofer.ip = "198.51.100.66".into();
    spoofer.peer = Some("203.0.113.9:5000".parse().expect("addr"));
    let r = spoofer.op("registerHost", &[], registration()).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    assert_eq!(r.body["observedAddress"], "203.0.113.9");
    // Through the trusted proxy, the right-most untrusted hop counts; what the client prepended does not.
    let mut proxied = bearer(&app, &token);
    proxied.ip = "6.6.6.6, 198.51.100.67".into();
    let r = proxied.op("registerHost", &[], registration()).await;
    assert_eq!(r.body["observedAddress"], "198.51.100.67");
    // IPv4-mapped addresses are normalised.
    let mut mapped = bearer(&app, &token);
    mapped.peer = Some("[::ffff:203.0.113.10]:5000".parse().expect("addr"));
    let r = mapped.op("registerHost", &[], registration()).await;
    assert_eq!(r.body["observedAddress"], "203.0.113.10");

    // A host behind a private address needs a public edge.publicHost.
    let private = bearer(&app, &token);
    assert!(private.ip.starts_with("10."));
    let r = private.op("registerHost", &[], registration()).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(
        !r.body.to_string().contains(&private.ip),
        "no address echoed"
    );
    let mut with_public = registration();
    with_public["edge"]["publicHost"] = json!("10.0.0.5");
    assert_eq!(
        private.op("registerHost", &[], with_public).await.status,
        StatusCode::BAD_REQUEST
    );
    let mut with_public = registration();
    with_public["edge"]["publicHost"] = json!("edge-1.metallic.example");
    assert_eq!(
        private.op("registerHost", &[], with_public).await.status,
        StatusCode::CREATED
    );

    // A player on a private address gets no knock token (and no connection facts).
    let player = app.user("m2_lan", "1990-01-01").await;
    let native = player.with_bearer(&native_token(&app, &player).await);
    let r = native
        .op(
            "connectJoinTicket",
            &[],
            json!({ "ticket": format!("jt_{}", "a".repeat(40)) }),
        )
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "client_address_not_public");
    app.finish().await;
}

#[tokio::test]
async fn one_account_holds_one_live_ticket_and_kinds_must_match() {
    let app = seeded().await;
    let (host_id, h) = host_in(&app, "squat", "us-east", 4).await;
    let a = running_server(&app, &host_id, 4).await;
    let b = running_server(&app, &host_id, 4).await;
    let squatter = app.user("m2_squatter", "1990-01-01").await;
    let first = squatter
        .op(
            "createJoinTicket",
            &[("gameId", GAME)],
            json!({ "serverId": a }),
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED, "{}", first.body);
    let second = squatter
        .op(
            "createJoinTicket",
            &[("gameId", GAME)],
            json!({ "serverId": b }),
        )
        .await;
    assert_eq!(second.status, StatusCode::CREATED);
    // The first ticket died when the second was issued: it reserves nothing and cannot be redeemed.
    let open: Vec<i64> = sqlx::query_scalar(
        "SELECT server_id FROM matchmaker.join_tickets WHERE user_id = $1 AND redeemed_at IS NULL \
         AND expires_at > clock_timestamp()",
    )
    .bind(squatter.user_id())
    .fetch_all(&app.db)
    .await
    .expect("open tickets");
    assert_eq!(open, [b.parse::<i64>().expect("id")]);
    let t1 = first.body["ticket"].as_str().expect("ticket");
    let r = h
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t1, "serverId": a }),
        )
        .await;
    assert_eq!(r.status, StatusCode::GONE);
    // Server `a` is free again for others: 4 more players fit (4-slot server, no friend reserve).
    for i in 0..4 {
        let p = app.user(&format!("m2_fill{i}"), "1990-01-01").await;
        let r = p
            .op(
                "createJoinTicket",
                &[("gameId", GAME)],
                json!({ "serverId": a }),
            )
            .await;
        assert_eq!(r.status, StatusCode::CREATED, "slot {i}");
    }

    // Kind: a play ticket neither binds to nor redeems on an edit server.
    let t2 = second.body["ticket"].as_str().expect("ticket").to_owned();
    sqlx::query("UPDATE matchmaker.servers SET kind = 'edit' WHERE id = $1")
        .bind(b.parse::<i64>().expect("id"))
        .execute(&app.db)
        .await
        .expect("sql");
    let r = h
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": t2, "serverId": b }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CONFLICT, "{}", r.body);
    let other = app.user("m2_editor", "1990-01-01").await;
    let r = other
        .op(
            "createJoinTicket",
            &[("gameId", GAME)],
            json!({ "serverId": b }),
        )
        .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
    app.finish().await;
}
