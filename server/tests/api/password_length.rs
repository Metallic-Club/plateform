//! Signup and login must use the same existing character limit while verifying the original password bytes.

use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::support::{Client, TestApp};

fn signup(username: &str, password: &str) -> Value {
    json!({"username":username, "email":format!("{username}@example.com"), "password":password,
        "birthDate":"1990-01-01", "acceptTerms":true})
}

async fn create_then_logout<'a>(app: &'a TestApp, username: &str, password: &str) -> Client<'a> {
    let mut session = app.anon();
    let created = session.op("signUp", &[], signup(username, password)).await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "synthetic password must be accepted at signup"
    );
    session.adopt_session(&created);
    assert_eq!(
        session.op("logOut", &[], Value::Null).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        session.op("getMe", &[], Value::Null).await.status,
        StatusCode::UNAUTHORIZED,
        "the initial session must really be revoked"
    );
    session
}

async fn round_trip(username: &str, password: String, characters: usize) {
    let app = TestApp::new().await;
    assert_eq!(password.chars().count(), characters);
    let original = create_then_logout(&app, username, &password).await;
    let mut fresh = app.anon();
    let signed_in = fresh
        .op("logIn", &[], json!({"login":username, "password":password}))
        .await;
    assert_eq!(
        signed_in.status,
        StatusCode::OK,
        "a password accepted at signup must authenticate after logout"
    );
    fresh.adopt_session(&signed_in);
    assert_eq!(fresh.user_id(), original.user_id());
    assert_eq!(
        fresh.op("getMe", &[], Value::Null).await.status,
        StatusCode::OK
    );
    app.finish().await;
}

#[tokio::test]
async fn ascii_exact_maximum_round_trips() {
    round_trip("ascii_maximum", "aZ".repeat(64), 128).await;
}

#[tokio::test]
async fn bmp_exact_maximum_round_trips_despite_more_than_128_bytes() {
    let password = "界b".repeat(64);
    assert_eq!(password.len(), 256);
    round_trip("bmp_maximum", password, 128).await;
}

#[tokio::test]
async fn supplementary_exact_maximum_round_trips_despite_more_than_128_bytes() {
    let password = "🧭a".repeat(64);
    assert_eq!(password.len(), 320);
    round_trip("astral_maximum", password, 128).await;
}

#[tokio::test]
async fn unicode_signup_minimum_is_unchanged_and_round_trips() {
    round_trip("unicode_minimum", "éa".repeat(5), 10).await;
}

#[tokio::test]
async fn exact_upper_boundary_and_empty_rejections_do_not_create_accounts() {
    let app = TestApp::new().await;
    let anon = app.anon();
    for (index, password) in [
        "aZ".repeat(64) + "x",
        "界b".repeat(64) + "x",
        "🧭a".repeat(64) + "x",
        String::new(),
    ]
    .into_iter()
    .enumerate()
    {
        assert!(password.is_empty() || password.chars().count() == 129);
        let name = format!("reject_{index}");
        for response in [
            anon.op("signUp", &[], signup(&name, &password)).await,
            anon.op("logIn", &[], json!({"login":name, "password":password}))
                .await,
        ] {
            assert_eq!(response.status, StatusCode::BAD_REQUEST);
            assert_eq!(response.body["code"], "validation_failed");
            assert!(
                response.body["errors"]
                    .as_array()
                    .expect("field errors")
                    .iter()
                    .any(|error| error["field"] == "password")
            );
            assert_eq!(response.header("cache-control"), Some("no-store"));
        }
    }
    // Signup's existing ten-character minimum is separate from login's nonempty requirement.
    let too_short = anon
        .op(
            "signUp",
            &[],
            signup("below_minimum", &("éa".repeat(4) + "z")),
        )
        .await;
    assert_eq!(too_short.status, StatusCode::BAD_REQUEST);
    let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM identity.users")
        .fetch_one(&app.db)
        .await
        .expect("account count");
    assert_eq!(accounts, 0);
    app.finish().await;
}

#[tokio::test]
async fn password_verification_does_not_normalize_or_truncate_unicode() {
    let app = TestApp::new().await;
    let prefix = "🧭a".repeat(63);
    let original = format!("{prefix}e\u{301}");
    assert_eq!(original.chars().count(), 128);
    let owner = create_then_logout(&app, "exact_password", &original).await;
    let anon = app.anon();
    for wrong in [format!("{prefix}é"), format!("{prefix}e\u{302}")] {
        assert!(wrong.chars().count() <= 128);
        assert_eq!(&wrong.as_bytes()[..128], &original.as_bytes()[..128]);
        let response = anon
            .op(
                "logIn",
                &[],
                json!({"login":"exact_password", "password":wrong}),
            )
            .await;
        assert_eq!(
            response.status,
            StatusCode::UNAUTHORIZED,
            "full byte-distinct passwords must remain different"
        );
        assert_eq!(response.body["code"], "invalid_credentials");
        assert!(response.header("set-cookie").is_none());
    }
    let mut fresh = app.anon();
    let correct = fresh
        .op(
            "logIn",
            &[],
            json!({"login":"exact_password", "password":original}),
        )
        .await;
    assert_eq!(correct.status, StatusCode::OK);
    fresh.adopt_session(&correct);
    assert_eq!(fresh.user_id(), owner.user_id());
    app.finish().await;
}
