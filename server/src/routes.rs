//! Router built from the API contract. Every operation in `api/openapi.yaml` gets a route: a real handler when one
//! exists, otherwise a stub that answers 501 with a problem body. Unknown paths answer 404 problem+json.

use std::collections::BTreeMap;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{MethodFilter, MethodRouter},
};
use serde::Serialize;

use crate::{AppState, contract::OPERATIONS, problem::Problem};

/// Operation ids that have a real handler. The contract test checks every other operation answers 501.
pub const IMPLEMENTED: &[&str] = &["getHealth"];

pub fn router(state: AppState) -> Router {
    let mut by_path: BTreeMap<&'static str, MethodRouter<AppState>> = BTreeMap::new();
    for op in OPERATIONS {
        let filter = method_filter(op.method);
        let entry = by_path.remove(op.path).unwrap_or_default();
        let id = op.operation_id;
        let entry = match id {
            "getHealth" => entry.on(filter, get_health),
            _ => entry.on(filter, move || async move { Problem::not_implemented(id) }),
        };
        by_path.insert(op.path, entry);
    }

    by_path
        .into_iter()
        .fold(Router::new(), |router, (path, methods)| {
            router.route(path, methods)
        })
        .fallback(|| async { Problem::not_found() })
        .with_state(state)
}

fn method_filter(method: &str) -> MethodFilter {
    match method {
        "GET" => MethodFilter::GET,
        "PUT" => MethodFilter::PUT,
        "POST" => MethodFilter::POST,
        "DELETE" => MethodFilter::DELETE,
        "PATCH" => MethodFilter::PATCH,
        other => unreachable!("build.rs only emits known methods, got {other}"),
    }
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    checks: BTreeMap<&'static str, &'static str>,
}

/// `getHealth`. No database or cache is wired up yet, so both report `skipped`.
async fn get_health(State(state): State<AppState>) -> Response {
    let checks = BTreeMap::from([("database", "skipped"), ("cache", "skipped")]);
    let body = Health {
        status: "ok",
        version: state.version,
        checks,
    };
    (StatusCode::OK, Json(body)).into_response()
}
