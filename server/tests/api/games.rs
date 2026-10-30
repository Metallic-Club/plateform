//! Discovery, content labels, pagination, ratings, servers and play history.

use std::collections::HashSet;

use axum::http::StatusCode;
use metallic_platform::{jobs, seed};
use serde_json::{Value, json};

use crate::support::{Client, PASSWORD, TestApp};

const SKYLINE: &str = "1000000000000101";
const SKYLINE_PLACE: &str = "1000000000001101";
const HOLLOW: &str = "1000000000000104"; // content label "moderate"

async fn seeded() -> TestApp {
    let app = TestApp::new().await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    app
}

#[tokio::test]
async fn moderate_games_are_hidden_from_signed_out_and_under_13_viewers() {
    let app = seeded().await;
    assert_eq!(
        app.anon()
            .op("getGame", &[("gameId", HOLLOW)], Value::Null)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let adult = app.user("adult_viewer", "1990-01-01").await;
    assert_eq!(
        adult
            .op("getGame", &[("gameId", HOLLOW)], Value::Null)
            .await
            .status,
        StatusCode::OK
    );
    let r = app
        .anon()
        .op("searchGames", &[("?q", "hollow lantern")], Value::Null)
        .await;
    assert!(
        r.body["items"]
            .as_array()
            .expect("items")
            .iter()
            .all(|g| g["id"] != HOLLOW)
    );
    app.finish().await;
}

#[tokio::test]
async fn pages_walk_every_visible_game_once() {
    let app = seeded().await;
    let anon = app.anon();
    let mut seen = HashSet::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut params = vec![("?limit", "5".to_owned())];
        if let Some(c) = &cursor {
            params.push(("?cursor", c.clone()));
        }
        let params: Vec<(&str, &str)> = params.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let r = anon.op("listGames", &params, Value::Null).await;
        assert_eq!(r.status, StatusCode::OK);
        for g in r.body["items"].as_array().expect("items") {
            assert!(
                seen.insert(g["id"].as_str().expect("id").to_owned()),
                "duplicate across pages"
            );
        }
        match r.body["nextCursor"].as_str() {
            Some(c) => cursor = Some(c.to_owned()),
            None => break,
        }
    }
    // 16 seeded games; signed-out viewers see everyone and mild only (2 are moderate). Desktop default platforms.
    assert_eq!(seen.len(), 14);
    let r = anon
        .op("listGames", &[("?cursor", "not-a-cursor")], Value::Null)
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    app.finish().await;
}

#[tokio::test]
async fn search_tolerates_typos_and_matches_genres() {
    let app = seeded().await;
    let anon = app.anon();
    let r = anon
        .op("searchGames", &[("?q", "skylne sprint")], Value::Null)
        .await;
    assert_eq!(r.body["items"][0]["id"], SKYLINE, "{}", r.body);
    let r = anon
        .op("searchGames", &[("?q", "racing")], Value::Null)
        .await;
    assert!(
        r.body["items"]
            .as_array()
            .expect("items")
            .iter()
            .any(|g| g["name"] == "Rust Bucket Rally")
    );
    app.finish().await;
}

#[tokio::test]
async fn voting_needs_a_verified_account_some_age_and_play_time() {
    let app = seeded().await;
    let fresh = app.user("fresh_voter", "1990-01-01").await;
    let r = fresh
        .op(
            "setRating",
            &[("gameId", SKYLINE)],
            json!({ "vote": "down" }),
        )
        .await;
    assert_eq!(r.body["code"], "account_too_new");
    app.sql(
        "UPDATE identity.users SET created_at = now() - interval '5 days' WHERE id = $1",
        fresh.user_id(),
    )
    .await;
    let r = fresh
        .op(
            "setRating",
            &[("gameId", SKYLINE)],
            json!({ "vote": "down" }),
        )
        .await;
    assert_eq!(r.body["code"], "play_longer");

    // Seeded nova_pilot played Skyline Sprint for 90 minutes.
    let mut nova = app.anon();
    let r = nova
        .op(
            "logIn",
            &[],
            json!({ "login": "nova_pilot", "password": PASSWORD }),
        )
        .await;
    nova.adopt_session(&r);
    let before = nova
        .op("getRating", &[("gameId", SKYLINE)], Value::Null)
        .await;
    let r = nova
        .op(
            "setRating",
            &[("gameId", SKYLINE)],
            json!({ "vote": "down" }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["myVote"], "down");
    assert_eq!(
        r.body["down"],
        before.body["down"].as_i64().expect("down") + 1
    );
    let r = nova
        .op("setRating", &[("gameId", SKYLINE)], json!({ "vote": "up" }))
        .await;
    assert_eq!(r.body["up"], before.body["up"].as_i64().expect("up") + 1);
    assert_eq!(r.body["down"], before.body["down"]);
    nova.op("clearRating", &[("gameId", SKYLINE)], Value::Null)
        .await;
    let r = nova
        .op("getRating", &[("gameId", SKYLINE)], Value::Null)
        .await;
    assert_eq!(r.body["up"], before.body["up"]);
    app.finish().await;
}

async fn register(server: &Client<'_>) -> String {
    let r = server
        .op("registerGameServer", &[], json!({ "gameId": SKYLINE, "placeId": SKYLINE_PLACE, "region": "eu-central", "maxPlayers": 2 }))
        .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    r.body["serverId"].as_str().expect("id").to_owned()
}

#[tokio::test]
async fn heartbeats_drive_live_counts_sessions_and_play_history() {
    let app = seeded().await;
    let server = Client::server(&app);
    let player = app.user("busy_player", "1990-01-01").await;
    let id = register(&server).await;
    server
        .op(
            "heartbeatGameServer",
            &[("serverId", &id)],
            json!({ "players": [player.id_str()] }),
        )
        .await;

    let r = app
        .anon()
        .op("getLiveCounts", &[("?gameIds", SKYLINE)], Value::Null)
        .await;
    assert_eq!(r.body["items"][0]["playing"], 1, "{}", r.body);
    let r = player
        .op(
            "getPresence",
            &[("?userIds", &player.id_str())],
            Value::Null,
        )
        .await;
    assert_eq!(r.body["items"][0]["status"], "in_game");

    // Pretend ten minutes passed, then the player leaves.
    app.sql("UPDATE games.play_sessions SET started_at = now() - interval '10 minutes' WHERE user_id = $1", player.user_id()).await;
    server
        .op(
            "heartbeatGameServer",
            &[("serverId", &id)],
            json!({ "players": [] }),
        )
        .await;
    let r = player.op("listPlayHistory", &[], Value::Null).await;
    assert_eq!(r.body["items"][0]["game"]["id"], SKYLINE);
    assert_eq!(r.body["items"][0]["minutesPlayed"], 10);

    // A full server refuses more players than it holds.
    let r = server
        .op(
            "heartbeatGameServer",
            &[("serverId", &id)],
            json!({ "players": ["1", "2", "3"] }),
        )
        .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    // Silent servers are stopped by the job and must register again.
    app.sql("UPDATE matchmaker.servers SET last_heartbeat_at = now() - interval '5 minutes' WHERE id = $1", id.parse().expect("id")).await;
    jobs::run_fast(&app.state).await;
    let r = server
        .op(
            "heartbeatGameServer",
            &[("serverId", &id)],
            json!({ "players": [] }),
        )
        .await;
    assert_eq!(r.status, StatusCode::GONE);
    app.finish().await;
}

#[tokio::test]
async fn internal_endpoints_need_the_server_secret_and_tickets_bind_to_one_server() {
    let app = seeded().await;
    let server = Client::server(&app);
    let player = app.user("ticket_holder", "1990-01-01").await;
    let wrong = app.anon();
    let r = wrong
        .raw(
            "POST",
            "/internal/v1/servers",
            json!({ "gameId": SKYLINE }),
            false,
        )
        .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);

    let first = register(&server).await;
    let second = register(&server).await;
    server
        .op(
            "heartbeatGameServer",
            &[("serverId", &first)],
            json!({ "players": [] }),
        )
        .await;
    server
        .op(
            "heartbeatGameServer",
            &[("serverId", &second)],
            json!({ "players": [] }),
        )
        .await;
    let r = player
        .op(
            "createJoinTicket",
            &[("gameId", SKYLINE)],
            json!({ "serverId": first }),
        )
        .await;
    assert!(r.status.is_success(), "{}", r.body);
    let ticket = r.body["ticket"].as_str().expect("ticket").to_owned();
    let r = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": ticket, "serverId": second }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    let r = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": ticket, "serverId": first }),
        )
        .await;
    assert_eq!(r.body["userId"], player.id_str());
    app.finish().await;
}

#[tokio::test]
async fn home_feed_shows_continue_playing_and_marks_first_party_rows() {
    let app = seeded().await;
    let mut nova = app.anon();
    let r = nova
        .op(
            "logIn",
            &[],
            json!({ "login": "nova_pilot", "password": PASSWORD }),
        )
        .await;
    nova.adopt_session(&r);
    let r = nova.op("getHome", &[], Value::Null).await;
    let ids: Vec<&str> = r.body["sections"]
        .as_array()
        .expect("sections")
        .iter()
        .map(|s| s["id"].as_str().expect("id"))
        .collect();
    assert_eq!(ids.first(), Some(&"continue"), "{ids:?}");
    assert!(
        ids.contains(&"featured") && ids.contains(&"first_party"),
        "{ids:?}"
    );
    let anon_home = app.anon().op("getHome", &[], Value::Null).await;
    let anon_ids: Vec<&str> = anon_home.body["sections"]
        .as_array()
        .expect("sections")
        .iter()
        .map(|s| s["id"].as_str().expect("id"))
        .collect();
    assert!(!anon_ids.contains(&"continue"));
    app.finish().await;
}
