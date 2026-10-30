//! The router must serve exactly what `api/openapi.yaml` describes.

use std::time::Duration;

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use metallic_platform::{AppState, app, contract::OPERATIONS, routes::IMPLEMENTED};
use tower::ServiceExt;
use yaml_rust2::YamlLoader;

const SAMPLE_ID: &str = "1050000000000001";

fn test_app() -> Router {
    app(AppState::default(), Duration::from_secs(5))
}

fn fill_path(path: &str) -> String {
    let mut out = String::new();
    let mut in_param = false;
    for c in path.chars() {
        match c {
            '{' => in_param = true,
            '}' => {
                in_param = false;
                out.push_str(SAMPLE_ID);
            }
            _ if in_param => {}
            _ => out.push(c),
        }
    }
    out
}

async fn send(method: &str, uri: &str) -> (StatusCode, Option<String>, serde_json::Value) {
    let method = Method::from_bytes(method.as_bytes()).expect("valid method");
    let has_body = matches!(method, Method::POST | Method::PUT | Method::PATCH);
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(if has_body {
            Body::from("{}")
        } else {
            Body::empty()
        })
        .expect("valid request");
    let response = test_app()
        .oneshot(request)
        .await
        .expect("router never fails");
    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body reads")
        .to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, content_type, json)
}

#[test]
fn generated_list_matches_the_spec_file() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../api/openapi.yaml"))
        .expect("spec");
    let docs = YamlLoader::load_from_str(&text).expect("yaml");
    let paths = docs[0]["paths"].as_hash().expect("paths");
    let count: usize = paths
        .values()
        .map(|item| {
            ["get", "put", "post", "delete", "patch"]
                .iter()
                .filter(|m| !item[**m].is_badvalue())
                .count()
        })
        .sum();
    assert_eq!(
        OPERATIONS.len(),
        count,
        "build.rs output is stale or incomplete"
    );
    assert!(
        count >= 40,
        "P1 contract should have at least 40 operations, found {count}"
    );
}

#[test]
fn implemented_ids_exist_in_the_spec() {
    for id in IMPLEMENTED {
        assert!(
            OPERATIONS.iter().any(|op| op.operation_id == *id),
            "{id} is not in api/openapi.yaml"
        );
    }
}

#[tokio::test]
async fn every_operation_is_routed() {
    for op in OPERATIONS {
        let uri = fill_path(op.path);
        let (status, content_type, body) = send(op.method, &uri).await;
        assert_ne!(
            status,
            StatusCode::NOT_FOUND,
            "{} {} ({}) is not routed",
            op.method,
            op.path,
            op.operation_id
        );
        assert_ne!(
            status,
            StatusCode::METHOD_NOT_ALLOWED,
            "{} {} has the wrong method",
            op.method,
            op.path
        );

        if !IMPLEMENTED.contains(&op.operation_id) {
            assert_eq!(
                status,
                StatusCode::NOT_IMPLEMENTED,
                "{} should be a 501 stub",
                op.operation_id
            );
            assert_eq!(content_type.as_deref(), Some("application/problem+json"));
            assert_eq!(body["code"], "not_implemented");
            assert_eq!(body["status"], 501);
        }
    }
}

#[tokio::test]
async fn health_reports_ok_and_version() {
    let (status, content_type, body) = send("GET", "/healthz").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(content_type.as_deref(), Some("application/json"));
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(body["checks"]["database"], "skipped");
}

#[tokio::test]
async fn unknown_path_is_a_problem_404() {
    let (status, content_type, body) = send("GET", "/v1/does-not-exist").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(content_type.as_deref(), Some("application/problem+json"));
    assert_eq!(body["code"], "not_found");
}

#[tokio::test]
async fn wrong_method_on_known_path_is_405() {
    let (status, _, _) = send("DELETE", "/healthz").await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn static_segments_win_over_ids() {
    // `/v1/users/search` and `/v1/users/{userId}` share a prefix; both must resolve to their own operation.
    let (search, _, body) = send("GET", "/v1/users/search").await;
    assert_eq!(search, StatusCode::NOT_IMPLEMENTED);
    assert!(
        body["detail"]
            .as_str()
            .unwrap_or_default()
            .contains("searchUsers")
    );
    let (user, _, body) = send("GET", &format!("/v1/users/{SAMPLE_ID}")).await;
    assert_eq!(user, StatusCode::NOT_IMPLEMENTED);
    assert!(
        body["detail"]
            .as_str()
            .unwrap_or_default()
            .contains("getUser")
    );
}
