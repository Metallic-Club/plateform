//! Sign-up, sessions, CSRF, Origin checks, the device flow and refresh-token rotation.

use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::support::{Auth, Client, PASSWORD, TestApp};

#[tokio::test]
async fn session_cookie_has_safe_flags_and_secrets_are_not_stored_in_clear() {
    let app = TestApp::new().await;
    let mut c = app.anon();
    let r = c
        .op(
            "signUp",
            &[],
            json!({ "username": "flag_test", "password": PASSWORD, "email": "flag_test@example.com", "birthDate": "1991-02-03", "acceptTerms": true }),
        )
        .await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let cookie = r.header("set-cookie").expect("cookie");
    for flag in ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"] {
        assert!(cookie.contains(flag), "cookie lacks {flag}: {cookie}");
    }
    c.adopt_session(&r);
    let (hash, email): (String, Vec<u8>) = sqlx::query_as(
        "SELECT c.password_hash, u.email_ciphertext FROM identity.credentials c JOIN identity.users u ON u.id = c.user_id WHERE u.id = $1",
    )
    .bind(c.user_id())
    .fetch_one(&app.db)
    .await
    .expect("row");
    assert!(hash.starts_with("$argon2id$"), "passwords use argon2id");
    assert!(
        !String::from_utf8_lossy(&email).contains("flag_test@example.com"),
        "emails are encrypted"
    );
    let stored_session: i64 =
        sqlx::query_scalar("SELECT count(*) FROM identity.sessions WHERE user_id = $1")
            .bind(c.user_id())
            .fetch_one(&app.db)
            .await
            .expect("count");
    assert_eq!(stored_session, 1);
    app.finish().await;
}

#[tokio::test]
async fn cookie_writes_need_the_csrf_token_and_an_allowed_origin() {
    let app = TestApp::new().await;
    let ada = app.user("csrf_test", "1990-05-05").await;
    let Auth::Cookie { session, .. } = ada.auth.clone() else {
        panic!("cookie client")
    };

    let forged = Client {
        app: &app,
        auth: Auth::Cookie {
            session: session.clone(),
            csrf: "wrong".into(),
        },
        ip: ada.ip.clone(),
        user: ada.user,
    };
    let r = forged.op("updateMe", &[], json!({ "bio": "hacked" })).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "csrf_failed");

    // A foreign Origin is refused before the handler runs, even with the right token.
    let r = ada
        .raw_with_origin(
            "PATCH",
            "/v1/users/me",
            json!({ "bio": "x" }),
            "https://evil.example",
        )
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "origin_not_allowed");

    // Reads need no token; the right token works.
    assert_eq!(
        ada.op("getMe", &[], Value::Null).await.status,
        StatusCode::OK
    );
    assert_eq!(
        ada.op("updateMe", &[], json!({ "bio": "fine" }))
            .await
            .status,
        StatusCode::OK
    );
    app.finish().await;
}

#[tokio::test]
async fn repeated_bad_logins_are_rate_limited() {
    let app = TestApp::new().await;
    app.user("limit_test", "1990-05-05").await;
    let c = app.anon();
    let mut last = StatusCode::OK;
    for _ in 0..30 {
        let r = c
            .op(
                "logIn",
                &[],
                json!({ "login": "limit_test", "password": "not the password" }),
            )
            .await;
        last = r.status;
        if last == StatusCode::TOO_MANY_REQUESTS {
            assert!(r.header("retry-after").is_some(), "429 carries Retry-After");
            break;
        }
    }
    assert_eq!(last, StatusCode::TOO_MANY_REQUESTS);
    app.finish().await;
}

#[tokio::test]
async fn unverified_accounts_cannot_add_friends() {
    let app = TestApp::new().await;
    let bo = app.user("verified_bo", "1990-05-05").await;
    let cy = app.signup("unverified_cy", "1990-05-05").await;
    let r = cy
        .op("sendFriendRequest", &[], json!({ "userId": bo.id_str() }))
        .await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "email_unverified");
    app.finish().await;
}

pub(super) async fn device_tokens(app: &TestApp, user: &Client<'_>) -> Value {
    let anon = app.anon();
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-studio", "scope": "profile publish" }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let code = r.body["user_code"].as_str().expect("user code").to_owned();
    let device = r.body["device_code"]
        .as_str()
        .expect("device code")
        .to_owned();
    let r = user
        .op(
            "approveDeviceAuthorization",
            &[],
            json!({ "userCode": code, "approve": true }),
        )
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let r = anon
        .op("exchangeToken", &[], json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": device, "client_id": "metallic-studio" }))
        .await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    r.body
}

#[tokio::test]
async fn device_flow_polling_too_fast_slows_down() {
    let app = TestApp::new().await;
    let anon = app.anon();
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player" }),
        )
        .await;
    let grant = json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": r.body["device_code"], "client_id": "metallic-player" });
    let first = anon.op("exchangeToken", &[], grant.clone()).await;
    assert_eq!(first.body["error"], "authorization_pending");
    let second = anon.op("exchangeToken", &[], grant).await;
    assert_eq!(second.body["error"], "slow_down");
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "someone-else" }),
        )
        .await;
    assert_eq!(r.body["error"], "invalid_client");
    app.finish().await;
}

#[tokio::test]
async fn reusing_a_refresh_token_revokes_the_whole_family() {
    let app = TestApp::new().await;
    let ada = app.user("rotate_test", "1990-05-05").await;
    let tokens = device_tokens(&app, &ada).await;
    let first_refresh = tokens["refresh_token"]
        .as_str()
        .expect("refresh")
        .to_owned();
    let anon = app.anon();
    let refresh = |t: &str| json!({ "grant_type": "refresh_token", "refresh_token": t, "client_id": "metallic-studio" });

    let r = anon.op("exchangeToken", &[], refresh(&first_refresh)).await;
    assert_eq!(r.status, StatusCode::OK);
    let second_refresh = r.body["refresh_token"]
        .as_str()
        .expect("refresh")
        .to_owned();
    let second_access = r.body["access_token"].as_str().expect("access").to_owned();
    assert_ne!(first_refresh, second_refresh, "refresh tokens rotate");
    assert_eq!(
        ada.with_bearer(&second_access)
            .op("getMe", &[], Value::Null)
            .await
            .status,
        StatusCode::OK
    );

    // Replaying the old token (a stolen copy) kills every token of the sign-in.
    let r = anon.op("exchangeToken", &[], refresh(&first_refresh)).await;
    assert_eq!(r.body["error"], "invalid_grant");
    assert_eq!(
        anon.op("exchangeToken", &[], refresh(&second_refresh))
            .await
            .body["error"],
        "invalid_grant"
    );
    assert_eq!(
        ada.with_bearer(&second_access)
            .op("getMe", &[], Value::Null)
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );
    app.finish().await;
}

#[tokio::test]
async fn bearer_tokens_are_limited_to_their_scopes_and_cannot_approve_devices() {
    let app = TestApp::new().await;
    let ada = app.user("scope_test", "1990-05-05").await;
    let anon = app.anon();
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player", "scope": "profile" }),
        )
        .await;
    let code = r.body["user_code"].as_str().expect("code").to_owned();
    let device = r.body["device_code"].as_str().expect("device").to_owned();
    ada.op(
        "approveDeviceAuthorization",
        &[],
        json!({ "userCode": code, "approve": true }),
    )
    .await;
    let r = anon
        .op("exchangeToken", &[], json!({ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": device, "client_id": "metallic-player" }))
        .await;
    let app_client = ada.with_bearer(r.body["access_token"].as_str().expect("access"));

    // Only `profile` was granted: joining a game needs `play`.
    let r = app_client
        .op(
            "createJoinTicket",
            &[("gameId", "1000000000000101")],
            json!({}),
        )
        .await;
    assert!(
        matches!(r.status, StatusCode::FORBIDDEN | StatusCode::NOT_FOUND),
        "{}",
        r.body
    );

    // Approving another device needs a browser session (no password or approval inside native apps).
    let r = anon
        .op(
            "startDeviceAuthorization",
            &[],
            json!({ "client_id": "metallic-player" }),
        )
        .await;
    let r = app_client
        .op(
            "approveDeviceAuthorization",
            &[],
            json!({ "userCode": r.body["user_code"], "approve": true }),
        )
        .await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    assert_eq!(r.body["code"], "session_required");
    app.finish().await;
}

#[tokio::test]
async fn under_13_accounts_wait_for_parent_consent() {
    let app = TestApp::new().await;
    let kid = app.signup("small_kit", "2017-06-01").await;
    let me = kid.op("getMe", &[], Value::Null).await;
    assert_eq!(me.body["ageBand"], "under_13");
    assert_eq!(me.body["accountStatus"], "limited");
    assert_eq!(
        me.body["settings"]["privacy"]["friendRequests"],
        "friends_of_friends"
    );
    assert!(
        app.mailer
            .sent
            .lock()
            .expect("mailer")
            .iter()
            .all(|e| e.to != "small_kit@example.com"),
        "consent goes to the parent"
    );
    let token = app.last_email_token("parent.small_kit@example.com");
    assert_eq!(
        app.anon()
            .op("verifyEmail", &[], json!({ "token": token }))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    let me = kid.op("getMe", &[], Value::Null).await;
    assert_eq!(me.body["accountStatus"], "active");
    // A used link is gone.
    assert_eq!(
        app.anon()
            .op("verifyEmail", &[], json!({ "token": token }))
            .await
            .status,
        StatusCode::GONE
    );
    app.finish().await;
}

#[tokio::test]
async fn usernames_are_unique_case_insensitively_and_reserved_names_are_held() {
    let app = TestApp::new().await;
    app.user("Case_Test", "1990-05-05").await;
    let anon = app.anon();
    let r = anon
        .op("checkUsername", &[("?username", "case_test")], Value::Null)
        .await;
    assert_eq!(r.body["available"], false);
    let r = anon
        .op("checkUsername", &[("?username", "metallic")], Value::Null)
        .await;
    assert_eq!(r.body["available"], false);
    let r = anon
        .op("signUp", &[], json!({ "username": "CASE_TEST", "password": PASSWORD, "email": "other@example.com", "birthDate": "1990-01-01", "acceptTerms": true }))
        .await;
    assert!(
        r.status == StatusCode::CONFLICT || r.status == StatusCode::BAD_REQUEST,
        "{}",
        r.body
    );
    app.finish().await;
}

#[tokio::test]
async fn web_session_codes_are_single_use_short_lived_and_app_only() {
    let app = TestApp::new().await;
    let ada = app.user("handoff_test", "1990-05-05").await;
    let anon = app.anon();

    // A browser session cannot mint a code (it could hand its session to another browser).
    let r = ada.op("createWebSessionCode", &[], Value::Null).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    assert_eq!(r.body["code"], "native_app_required");

    let tokens = device_tokens(&app, &ada).await;
    let launcher = ada.with_bearer(tokens["access_token"].as_str().expect("access"));
    let issue = || async {
        let r = launcher.op("createWebSessionCode", &[], Value::Null).await;
        assert_eq!(r.status, StatusCode::OK, "{}", r.body);
        assert_eq!(r.header("cache-control"), Some("no-store"));
        let code = r.body["code"].as_str().expect("code").to_owned();
        assert!(code.starts_with("wsc_"), "{code}");
        code
    };
    let redeem = |code: String| {
        let anon = &anon;
        async move {
            anon.op("redeemWebSessionCode", &[], json!({ "code": code }))
                .await
        }
    };

    let code = issue().await;
    let r = redeem(code.clone()).await;
    assert_eq!(r.status, StatusCode::OK, "{}", r.body);
    let cookie = r.header("set-cookie").expect("Set-Cookie").to_owned();
    assert!(
        cookie.starts_with("metallic_session=") && cookie.contains("HttpOnly"),
        "{cookie}"
    );
    assert_eq!(r.body["user"]["id"], ada.id_str());

    // Used, made-up and expired codes all get the same answer.
    let expired = issue().await;
    app.sql(
        "UPDATE identity.web_session_codes SET expires_at = now() - interval '1 second'          WHERE user_id = $1 AND used_at IS NULL",
        ada.user_id(),
    )
    .await;
    for bad in [
        code,
        "wsc_madeup".to_owned(),
        "not-a-code".to_owned(),
        expired,
    ] {
        let r = redeem(bad.clone()).await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{bad}: {}", r.body);
        assert_eq!(r.body["code"], "invalid_code");
        assert!(r.header("set-cookie").is_none());
    }
    app.finish().await;
}
