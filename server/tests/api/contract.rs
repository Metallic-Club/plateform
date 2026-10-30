//! The server must serve exactly what `api/openapi.yaml` describes. Every response any test receives through
//! [`crate::support::Client::op`] is checked here against the operation's documented status codes and schemas.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use metallic_platform::{contract::OPERATIONS, economy, routes::IMPLEMENTED, seed};
use serde_json::{Map, Value, json};
use yaml_rust2::{Yaml, YamlLoader};

use crate::support::{Client, PASSWORD, Resp, TestApp, covered};

/// Statuses any operation may return with a problem body (see the spec's description).
const GLOBAL: [u16; 6] = [403, 408, 413, 415, 429, 500];

fn to_json(y: &Yaml) -> Value {
    match y {
        Yaml::Real(r) => r.parse::<f64>().map_or(Value::Null, |f| json!(f)),
        Yaml::Integer(i) => json!(i),
        Yaml::String(s) => json!(s),
        Yaml::Boolean(b) => json!(b),
        Yaml::Array(a) => Value::Array(a.iter().map(to_json).collect()),
        Yaml::Hash(h) => {
            let mut m = Map::new();
            for (k, v) in h {
                let key = match k {
                    Yaml::String(s) => s.clone(),
                    Yaml::Integer(i) => i.to_string(),
                    Yaml::Boolean(b) => b.to_string(),
                    other => panic!("unsupported key {other:?}"),
                };
                m.insert(key, to_json(v));
            }
            Value::Object(m)
        }
        _ => Value::Null,
    }
}

fn spec() -> &'static Value {
    static SPEC: OnceLock<Value> = OnceLock::new();
    SPEC.get_or_init(|| {
        let text =
            std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../api/openapi.yaml"))
                .expect("spec");
        to_json(&YamlLoader::load_from_str(&text).expect("yaml")[0])
    })
}

fn escape(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

fn validator(pointer: &str) -> Arc<jsonschema::Validator> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<jsonschema::Validator>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(v) = cache.lock().expect("cache").get(pointer) {
        return v.clone();
    }
    let mut root = spec().clone();
    // URI fragment form of the JSON pointer (RFC 6901 section 6): braces must be percent-encoded.
    let fragment = pointer.replace('{', "%7B").replace('}', "%7D");
    root.as_object_mut()
        .expect("object")
        .insert("$ref".into(), json!(format!("#{fragment}")));
    let v = Arc::new(
        jsonschema::options()
            .with_draft(jsonschema::Draft::Draft202012)
            .should_validate_formats(true)
            .build(&root)
            .unwrap_or_else(|e| panic!("schema at {pointer} does not compile: {e}")),
    );
    cache
        .lock()
        .expect("cache")
        .insert(pointer.to_owned(), v.clone());
    v
}

fn validate(what: &str, pointer: &str, body: &Value) {
    let v = validator(pointer);
    let errors: Vec<String> = v
        .iter_errors(body)
        .map(|e| format!("{} at {}", e, e.instance_path()))
        .collect();
    assert!(
        errors.is_empty(),
        "{what}: body does not match {pointer}:\n  {}\nbody: {body}",
        errors.join("\n  ")
    );
}

/// Checks one response against the contract for `operation_id`.
pub fn check(operation_id: &str, r: &Resp) {
    covered()
        .lock()
        .expect("covered")
        .insert(operation_id.to_owned());
    let op = OPERATIONS
        .iter()
        .find(|o| o.operation_id == operation_id)
        .expect("operation");
    let op_ptr = format!("/paths/{}/{}", escape(op.path), op.method.to_lowercase());
    let status = r.status.as_u16();
    let what = format!("{operation_id} -> {status}");
    let content_type = r
        .header("content-type")
        .map(|c| c.split(';').next().unwrap_or("").trim().to_owned());
    let responses = spec()
        .pointer(&format!("{op_ptr}/responses"))
        .expect("responses");

    let Some(mut resp_ptr) = responses
        .get(status.to_string())
        .map(|_| format!("{op_ptr}/responses/{status}"))
    else {
        assert!(
            GLOBAL.contains(&status),
            "{what}: status not documented. body: {}",
            r.body
        );
        assert_eq!(
            content_type.as_deref(),
            Some("application/problem+json"),
            "{what}: global errors are problems"
        );
        validate(&what, "/components/schemas/Problem", &r.body);
        return;
    };
    if let Some(reference) = spec()
        .pointer(&resp_ptr)
        .and_then(|v| v.get("$ref"))
        .and_then(Value::as_str)
    {
        resp_ptr = reference.trim_start_matches('#').to_owned();
    }
    let response = spec().pointer(&resp_ptr).expect("response");
    match response.get("content").and_then(Value::as_object) {
        None => assert!(
            r.body.is_null(),
            "{what}: documented without a body but got {}",
            r.body
        ),
        Some(content) => {
            let ct = content_type.unwrap_or_else(|| panic!("{what}: no content type"));
            assert!(
                content.contains_key(&ct),
                "{what}: content type {ct} not documented ({:?})",
                content.keys().collect::<Vec<_>>()
            );
            if content[&ct].get("schema").is_some() {
                validate(
                    &what,
                    &format!("{resp_ptr}/content/{}/schema", escape(&ct)),
                    &r.body,
                );
            }
        }
    }
    if status >= 400
        && r.header("content-type")
            .is_some_and(|c| c.starts_with("application/problem+json"))
    {
        assert_eq!(r.body["status"], status, "{what}: problem status field");
        assert_eq!(
            r.header("cache-control"),
            Some("no-store"),
            "{what}: problems are not cached"
        );
    }
}

// ------------------------------------------------------------------ static checks

#[test]
fn generated_list_matches_the_spec_file() {
    let paths = spec()["paths"].as_object().expect("paths");
    let count: usize = paths
        .values()
        .map(|item| {
            ["get", "put", "post", "delete", "patch"]
                .iter()
                .filter(|m| item.get(**m).is_some())
                .count()
        })
        .sum();
    assert_eq!(
        OPERATIONS.len(),
        count,
        "build.rs output is stale or incomplete"
    );
}

#[test]
fn every_operation_is_implemented() {
    for op in OPERATIONS {
        assert!(
            IMPLEMENTED.contains(&op.operation_id),
            "{} has no handler",
            op.operation_id
        );
    }
    for id in IMPLEMENTED {
        assert!(
            OPERATIONS.iter().any(|op| op.operation_id == *id),
            "{id} is not in api/openapi.yaml"
        );
    }
}

#[test]
fn every_response_schema_compiles() {
    for op in OPERATIONS {
        let op_ptr = format!("/paths/{}/{}", escape(op.path), op.method.to_lowercase());
        for (status, resp) in spec()
            .pointer(&format!("{op_ptr}/responses"))
            .and_then(Value::as_object)
            .expect("responses")
        {
            let ptr = match resp.get("$ref").and_then(Value::as_str) {
                Some(r) => r.trim_start_matches('#').to_owned(),
                None => format!("{op_ptr}/responses/{status}"),
            };
            for ct in spec()
                .pointer(&ptr)
                .and_then(|r| r.get("content"))
                .and_then(Value::as_object)
                .into_iter()
                .flat_map(|c| c.keys())
            {
                validator(&format!("{ptr}/content/{}/schema", escape(ct)));
            }
        }
    }
}

// ------------------------------------------------------------------ walkthrough

fn ok(r: &Resp, expected: u16) {
    assert_eq!(
        r.status.as_u16(),
        expected,
        "unexpected status; body: {}",
        r.body
    );
}

/// Calls every operation at least once on its main path (plus common errors) and checks each response against the
/// contract. Fails if any implemented operation was never called by any test.
#[tokio::test]
async fn every_operation_answers_as_documented() {
    let app = TestApp::new().await;
    seed::run(&app.state, PASSWORD).await.expect("seed");
    let anon = app.anon();
    const SKYLINE: &str = "1000000000000101";
    const PLACE: &str = "1000000000001101";
    const HAT: &str = "1000000000000202";

    // ops and auth
    ok(&anon.op("getReadiness", &[], Value::Null).await, 200);
    ok(
        &anon
            .op("checkUsername", &[("?username", "ada_test")], Value::Null)
            .await,
        200,
    );
    ok(&anon.op("getMe", &[], Value::Null).await, 401);
    let ada = app.user("ada_test", "1995-03-04").await;
    let bo = app.user("bo_test", "1992-08-19").await;
    let cy = app.signup("cy_test", "1990-01-20").await;
    ok(
        &cy.op("resendVerificationEmail", &[], Value::Null).await,
        204,
    );
    ok(&ada.op("getSession", &[], Value::Null).await, 200);
    let mut ada2 = app.anon();
    let r = ada2
        .op(
            "logIn",
            &[],
            json!({ "login": "ada_test", "password": PASSWORD }),
        )
        .await;
    ok(&r, 200);
    ada2.adopt_session(&r);
    ok(&ada2.op("logOut", &[], Value::Null).await, 204);
    ok(&ada2.op("getSession", &[], Value::Null).await, 401);
    ok(
        &anon
            .op(
                "logIn",
                &[],
                json!({ "login": "ada_test", "password": "wrong password!" }),
            )
            .await,
        401,
    );

    // device flow (RFC 8628) and refresh rotation
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player", "scope": "profile play" }),
        )
        .await;
    ok(&r, 200);
    let device_code = r.body["device_code"]
        .as_str()
        .expect("device_code")
        .to_owned();
    let user_code = r.body["user_code"].as_str().expect("user_code").to_owned();
    let grant = json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": device_code, "client_id": "metallic-player" });
    ok(&anon.op("exchangeToken", &[], grant.clone()).await, 400);
    ok(
        &ada.op(
            "approveDeviceAuthorization",
            &[],
            json!({ "userCode": user_code, "approve": true }),
        )
        .await,
        200,
    );
    app.sql("UPDATE identity.device_authorizations SET last_polled_at = now() - interval '1 minute' WHERE user_id = $1", ada.user_id()).await;
    let r = anon.op("exchangeToken", &[], grant).await;
    ok(&r, 200);
    let access = r.body["access_token"].as_str().expect("access").to_owned();
    let refresh = r.body["refresh_token"]
        .as_str()
        .expect("refresh")
        .to_owned();
    let r = anon.op("exchangeToken", &[], json!({ "grant_type": "refresh_token", "refresh_token": refresh, "client_id": "metallic-player" })).await;
    ok(&r, 200);
    let refresh2 = r.body["refresh_token"]
        .as_str()
        .expect("refresh")
        .to_owned();
    let ada_app = ada.with_bearer(&access);
    ok(&ada_app.op("getMe", &[], Value::Null).await, 200);

    // web-session handoff (the Launcher's web view)
    let r = ada_app.op("createWebSessionCode", &[], Value::Null).await;
    ok(&r, 200);
    let wsc = r.body["code"].as_str().expect("code").to_owned();
    let redeem = json!({ "code": wsc });
    ok(
        &anon.op("redeemWebSessionCode", &[], redeem.clone()).await,
        200,
    );
    ok(&anon.op("redeemWebSessionCode", &[], redeem).await, 400);

    // users
    ok(&ada.op("getMe", &[], Value::Null).await, 200);
    ok(
        &ada.op("updateMe", &[], json!({ "bio": "Builds bridges." }))
            .await,
        200,
    );
    ok(&ada.op("getSettings", &[], Value::Null).await, 200);
    ok(
        &ada.op(
            "updateSettings",
            &[],
            json!({ "theme": "titanium", "privacy": { "presenceVisibility": "everyone" } }),
        )
        .await,
        200,
    );
    ok(
        &ada.op(
            "replaceSocialLinks",
            &[],
            json!({ "links": [{ "platform": "github", "handle": "ada-test" }] }),
        )
        .await,
        200,
    );
    ok(
        &anon
            .op("getUser", &[("userId", &bo.id_str())], Value::Null)
            .await,
        200,
    );
    ok(
        &anon.op("getUser", &[("userId", "999")], Value::Null).await,
        404,
    );
    ok(
        &ada.op("getUserByUsername", &[("username", "bo_test")], Value::Null)
            .await,
        200,
    );
    ok(
        &ada.op("searchUsers", &[("?q", "bo_t")], Value::Null).await,
        200,
    );
    ok(
        &ada.op("searchUsers", &[("?q", "b")], Value::Null).await,
        400,
    );

    // friends
    let r = ada
        .op("sendFriendRequest", &[], json!({ "userId": bo.id_str() }))
        .await;
    ok(&r, 201);
    let r = bo
        .op(
            "listFriendRequests",
            &[("?direction", "incoming")],
            Value::Null,
        )
        .await;
    ok(&r, 200);
    let request_id = r.body["items"][0]["id"]
        .as_str()
        .expect("request")
        .to_owned();
    ok(
        &bo.op(
            "acceptFriendRequest",
            &[("requestId", &request_id)],
            Value::Null,
        )
        .await,
        200,
    );
    ok(
        &ada.op("listFriends", &[("userId", &ada.id_str())], Value::Null)
            .await,
        200,
    );
    ok(
        &ada.op("getPresence", &[("?userIds", &bo.id_str())], Value::Null)
            .await,
        200,
    );
    let seeded_friend = "1000000000000002";
    let r = ada
        .op("sendFriendRequest", &[], json!({ "userId": seeded_friend }))
        .await;
    ok(&r, 201);
    let pending = r.body["requestId"].as_str().expect("pending id").to_owned();
    ok(
        &ada.op(
            "deleteFriendRequest",
            &[("requestId", &pending)],
            Value::Null,
        )
        .await,
        204,
    );
    ok(
        &ada.op("removeFriend", &[("userId", &bo.id_str())], Value::Null)
            .await,
        204,
    );
    ok(
        &ada.op("blockUser", &[("userId", seeded_friend)], Value::Null)
            .await,
        204,
    );
    ok(&ada.op("listBlocks", &[], Value::Null).await, 200);
    ok(
        &ada.op("unblockUser", &[("userId", seeded_friend)], Value::Null)
            .await,
        204,
    );

    // games
    ok(&anon.op("getHome", &[], Value::Null).await, 200);
    ok(&ada.op("getHome", &[], Value::Null).await, 200);
    ok(&anon.op("listGenres", &[], Value::Null).await, 200);
    ok(
        &anon
            .op(
                "listGames",
                &[("?sort", "top_rated"), ("?limit", "5")],
                Value::Null,
            )
            .await,
        200,
    );
    ok(
        &anon
            .op("listGames", &[("?sort", "sideways")], Value::Null)
            .await,
        400,
    );
    ok(
        &anon
            .op("searchGames", &[("?q", "skylin")], Value::Null)
            .await,
        200,
    );
    ok(
        &anon
            .op("getGame", &[("gameId", SKYLINE)], Value::Null)
            .await,
        200,
    );
    ok(
        &ada.op("getGame", &[("gameId", SKYLINE)], Value::Null).await,
        200,
    );
    ok(
        &anon.op("getGame", &[("gameId", "123")], Value::Null).await,
        404,
    );
    ok(
        &anon
            .op("listSimilarGames", &[("gameId", SKYLINE)], Value::Null)
            .await,
        200,
    );
    ok(
        &anon
            .op("getRating", &[("gameId", SKYLINE)], Value::Null)
            .await,
        200,
    );
    ok(
        &ada.op("setRating", &[("gameId", SKYLINE)], json!({ "vote": "up" }))
            .await,
        403,
    );
    app.sql(
        "UPDATE identity.users SET created_at = now() - interval '10 days' WHERE id = $1",
        ada.user_id(),
    )
    .await;
    app.sql(
        &format!("INSERT INTO games.play_history (user_id, game_id, last_played_at, seconds) VALUES ($1, {SKYLINE}, now(), 900)"),
        ada.user_id(),
    )
    .await;
    ok(
        &ada.op("setRating", &[("gameId", SKYLINE)], json!({ "vote": "up" }))
            .await,
        200,
    );
    ok(
        &ada.op("clearRating", &[("gameId", SKYLINE)], Value::Null)
            .await,
        204,
    );
    ok(
        &anon
            .op("getLiveCounts", &[("?gameIds", SKYLINE)], Value::Null)
            .await,
        200,
    );
    ok(&anon.op("getPlatformLive", &[], Value::Null).await, 200);

    // servers
    let server = Client::server(&app);
    ok(&anon.op("listRegions", &[], Value::Null).await, 200);
    ok(&anon.op("registerGameServer", &[], json!({ "gameId": SKYLINE, "placeId": PLACE, "region": "us-east", "maxPlayers": 10 })).await, 401);
    let r = server
        .op(
            "registerGameServer",
            &[],
            json!({ "gameId": SKYLINE, "placeId": PLACE, "region": "us-east", "maxPlayers": 10 }),
        )
        .await;
    ok(&r, 201);
    let server_id = r.body["serverId"].as_str().expect("server id").to_owned();
    ok(
        &server
            .op(
                "heartbeatGameServer",
                &[("serverId", &server_id)],
                json!({ "players": [bo.id_str()] }),
            )
            .await,
        204,
    );
    ok(
        &anon
            .op("listServers", &[("gameId", SKYLINE)], Value::Null)
            .await,
        200,
    );
    let r = ada_app
        .op("createJoinTicket", &[("gameId", SKYLINE)], json!({}))
        .await;
    assert!(r.status.is_success(), "join: {}", r.body);
    let ticket = r.body["ticket"].as_str().expect("ticket").to_owned();
    let r = server
        .op(
            "redeemJoinTicket",
            &[],
            json!({ "ticket": ticket, "serverId": server_id }),
        )
        .await;
    ok(&r, 200);
    ok(
        &server
            .op(
                "redeemJoinTicket",
                &[],
                json!({ "ticket": ticket, "serverId": server_id }),
            )
            .await,
        410,
    );
    ok(
        &server
            .op("stopGameServer", &[("serverId", &server_id)], Value::Null)
            .await,
        204,
    );

    // library
    ok(
        &ada.op("addFavorite", &[("gameId", SKYLINE)], Value::Null)
            .await,
        204,
    );
    ok(&ada.op("listFavorites", &[], Value::Null).await, 200);
    ok(
        &ada.op("removeFavorite", &[("gameId", SKYLINE)], Value::Null)
            .await,
        204,
    );
    ok(&ada.op("listPlayHistory", &[], Value::Null).await, 200);
    ok(
        &ada.op(
            "removePlayHistoryEntry",
            &[("gameId", SKYLINE)],
            Value::Null,
        )
        .await,
        204,
    );

    // catalog and wallet (items and credits through the ledger)
    let mut conn = app.db.acquire().await.expect("conn");
    economy::grant_item(
        &mut conn,
        &app.state.ids,
        ada.user_id(),
        HAT.parse().expect("id"),
        "reward",
        "test:hat",
    )
    .await
    .expect("grant");
    economy::grant_credits(
        &mut conn,
        &app.state.ids,
        ada.user_id(),
        500,
        "reward",
        "Test reward",
        "test:credits",
    )
    .await
    .expect("db")
    .expect("posted");
    drop(conn);
    ok(
        &anon
            .op("listCatalogItems", &[("?category", "hat")], Value::Null)
            .await,
        200,
    );
    ok(
        &anon
            .op("getCatalogItem", &[("itemId", HAT)], Value::Null)
            .await,
        200,
    );
    ok(&ada.op("listInventory", &[], Value::Null).await, 200);
    ok(&ada.op("getMyAvatar", &[], Value::Null).await, 200);
    let colors =
        json!({ "head": "#AABBCC", "torso": "#112233", "arms": "#AABBCC", "legs": "#000000" });
    ok(
        &ada.op(
            "setMyAvatar",
            &[],
            json!({ "bodyColors": colors, "equippedItemIds": [HAT] }),
        )
        .await,
        200,
    );
    ok(
        &ada.op(
            "setMyAvatar",
            &[],
            json!({ "bodyColors": colors, "equippedItemIds": ["1000000000000203"] }),
        )
        .await,
        400,
    );
    ok(
        &anon
            .op("getUserAvatar", &[("userId", &ada.id_str())], Value::Null)
            .await,
        200,
    );
    let r = ada.op("getWallet", &[], Value::Null).await;
    ok(&r, 200);
    assert_eq!(r.body["balances"][0]["available"], 500);
    ok(
        &ada.op("listWalletTransactions", &[], Value::Null).await,
        200,
    );

    // revocation last: the app token family stops working
    ok(
        &anon
            .op(
                "revokeToken",
                &[],
                json!({ "token": refresh2, "client_id": "metallic-player" }),
            )
            .await,
        200,
    );
    ok(&ada_app.op("getMe", &[], Value::Null).await, 401);

    let seen = covered().lock().expect("covered").clone();
    let missing: Vec<&&str> = IMPLEMENTED
        .iter()
        .filter(|id| !seen.contains(**id))
        .collect();
    assert!(
        missing.is_empty(),
        "operations never called by the contract walkthrough: {missing:?}"
    );
    app.finish().await;
}
