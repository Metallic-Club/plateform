//! Friends, blocks, privacy and the protections for minors.

use axum::http::StatusCode;
use metallic_platform::social;
use serde_json::{Value, json};

use crate::support::{Client, TestApp};

async fn befriend(a: &Client<'_>, b: &Client<'_>) {
    let r = a
        .op("sendFriendRequest", &[], json!({ "userId": b.id_str() }))
        .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let r = b
        .op("sendFriendRequest", &[], json!({ "userId": a.id_str() }))
        .await;
    assert_eq!(
        r.body["status"], "friends",
        "a mutual request becomes a friendship"
    );
}

/// An under-13 account with parental consent given.
async fn kid<'a>(app: &'a TestApp, name: &str) -> Client<'a> {
    let c = app.signup(name, "2017-03-03").await;
    let token = app.last_email_token(&format!("parent.{name}@example.com"));
    assert_eq!(
        app.anon()
            .op("verifyEmail", &[], json!({ "token": token }))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    c
}

#[tokio::test]
async fn strangers_cannot_send_requests_to_under_13_accounts() {
    let app = TestApp::new().await;
    let adult = app.user("adult_one", "1985-01-01").await;
    let child = kid(&app, "kid_one").await;
    let r = adult
        .op(
            "sendFriendRequest",
            &[],
            json!({ "userId": child.id_str() }),
        )
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "requests_not_allowed");
    // Under-13 senders reach friends of friends only, never strangers.
    let other_kid = kid(&app, "kid_four").await;
    let r = other_kid
        .op(
            "sendFriendRequest",
            &[],
            json!({ "userId": adult.id_str() }),
        )
        .await;
    assert_eq!(r.body["code"], "requests_not_allowed");
    // A friend of a friend may. (Friendships for under-13 accounts start offline in P1, so set them up directly.)
    let parent_friend = app.user("family_friend", "1980-01-01").await;
    let sibling = kid(&app, "kid_two").await;
    let mut tx = app.db.begin().await.expect("tx");
    social::make_friends(&mut tx, child.user_id(), sibling.user_id())
        .await
        .expect("friends");
    social::make_friends(&mut tx, sibling.user_id(), parent_friend.user_id())
        .await
        .expect("friends");
    tx.commit().await.expect("commit");
    let r = parent_friend
        .op(
            "sendFriendRequest",
            &[],
            json!({ "userId": child.id_str() }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    app.finish().await;
}

#[tokio::test]
async fn under_13_privacy_is_capped_and_social_links_are_16_plus() {
    let app = TestApp::new().await;
    let child = kid(&app, "kid_three").await;
    let r = child
        .op("updateSettings", &[], json!({ "privacy": { "presenceVisibility": "everyone", "friendRequests": "everyone" } }))
        .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["privacy"]["presenceVisibility"], "friends");
    assert_eq!(r.body["privacy"]["friendRequests"], "friends_of_friends");
    let r = child
        .op(
            "replaceSocialLinks",
            &[],
            json!({ "links": [{ "platform": "youtube", "handle": "@kid" }] }),
        )
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "age_restricted");
    let teen = app.user("teen_one", "2011-01-01").await;
    let r = teen
        .op(
            "replaceSocialLinks",
            &[],
            json!({ "links": [{ "platform": "youtube", "handle": "@teen" }] }),
        )
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN, "13-15 is under 16 too");
    app.finish().await;
}

#[tokio::test]
async fn under_13_accounts_are_hidden_from_strangers_in_search_and_friend_lists() {
    let app = TestApp::new().await;
    let child = kid(&app, "hidden_kid").await;
    let stranger = app.user("curious_adult", "1980-01-01").await;
    let r = stranger
        .op("searchUsers", &[("?q", "hidden_kid")], Value::Null)
        .await;
    assert_eq!(r.body["items"].as_array().map(Vec::len), Some(0));
    let r = stranger
        .op("listFriends", &[("userId", &child.id_str())], Value::Null)
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r = child
        .op("listFriends", &[("userId", &child.id_str())], Value::Null)
        .await;
    assert_eq!(r.status, StatusCode::OK);
    // Bios of under-13 accounts are for friends only.
    let r = stranger
        .op("getUser", &[("userId", &child.id_str())], Value::Null)
        .await;
    assert!(r.body.get("bio").is_none(), "{}", r.body);
    app.finish().await;
}

#[tokio::test]
async fn blocking_ends_friendship_hides_the_blocker_and_stops_requests() {
    let app = TestApp::new().await;
    let a = app.user("blocker_a", "1990-01-01").await;
    let b = app.user("blocked_b", "1990-01-01").await;
    befriend(&a, &b).await;
    assert_eq!(
        a.op("blockUser", &[("userId", &b.id_str())], Value::Null)
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    let r = a
        .op("listFriends", &[("userId", &a.id_str())], Value::Null)
        .await;
    assert_eq!(
        r.body["items"].as_array().map(Vec::len),
        Some(0),
        "friendship ended"
    );
    // The blocked user cannot see the blocker's profile and their requests vanish silently.
    assert_eq!(
        b.op("getUser", &[("userId", &a.id_str())], Value::Null)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let r = b
        .op("sendFriendRequest", &[], json!({ "userId": a.id_str() }))
        .await;
    assert_eq!(r.status, StatusCode::CREATED);
    let r = a.op("listFriendRequests", &[], Value::Null).await;
    assert_eq!(r.body["items"].as_array().map(Vec::len), Some(0));
    // The blocker cannot send either until unblocking.
    let r = a
        .op("sendFriendRequest", &[], json!({ "userId": b.id_str() }))
        .await;
    assert_eq!(r.body["code"], "user_blocked");
    a.op("unblockUser", &[("userId", &b.id_str())], Value::Null)
        .await;
    let r = a
        .op("listFriends", &[("userId", &a.id_str())], Value::Null)
        .await;
    assert_eq!(
        r.body["items"].as_array().map(Vec::len),
        Some(0),
        "unblocking does not restore the friendship"
    );
    app.finish().await;
}

#[tokio::test]
async fn presence_follows_privacy() {
    let app = TestApp::new().await;
    let a = app.user("present_a", "1990-01-01").await;
    let b = app.user("present_b", "1990-01-01").await;
    let c = app.user("present_c", "1990-01-01").await;
    befriend(&a, &b).await;
    a.op("getMe", &[], Value::Null).await; // marks a online
    let r = b
        .op("getPresence", &[("?userIds", &a.id_str())], Value::Null)
        .await;
    assert_eq!(
        r.body["items"][0]["status"], "online",
        "friends see presence by default"
    );
    let r = c
        .op("getPresence", &[("?userIds", &a.id_str())], Value::Null)
        .await;
    assert_eq!(r.body["items"][0]["status"], "offline", "strangers do not");
    a.op(
        "updateSettings",
        &[],
        json!({ "privacy": { "presenceVisibility": "nobody" } }),
    )
    .await;
    let r = b
        .op("getPresence", &[("?userIds", &a.id_str())], Value::Null)
        .await;
    assert_eq!(r.body["items"][0]["status"], "offline");
    assert!(
        r.body["items"][0]["lastOnlineAt"].is_null(),
        "hidden presence leaks no time"
    );
    app.finish().await;
}
