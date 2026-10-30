//! Metallic platform backend. Design: `docs/superpowers/specs/2026-10-30-platform-design.md`.
//! Contract: `api/openapi.yaml` (read at build time, see `build.rs`).

pub mod config;
pub mod problem;
pub mod routes;

use std::time::Duration;

use axum::{Router, http::StatusCode};
use tower_http::{limit::RequestBodyLimitLayer, timeout::TimeoutLayer, trace::TraceLayer};

/// Operations generated from the OpenAPI file.
pub mod contract {
    /// One method + path from `api/openapi.yaml`.
    #[derive(Debug, Clone, Copy)]
    pub struct Operation {
        pub method: &'static str,
        pub path: &'static str,
        pub operation_id: &'static str,
    }

    include!(concat!(env!("OUT_DIR"), "/operations.rs"));
}

/// Largest request body the API accepts. Uploads go to the asset service, not through JSON endpoints.
pub const MAX_BODY_BYTES: usize = 64 * 1024;

/// Shared state handed to handlers. Database and cache pools join it when those modules land.
#[derive(Debug, Clone)]
pub struct AppState {
    pub version: &'static str,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION"),
        }
    }
}

/// The full HTTP application with middleware.
pub fn app(state: AppState, request_timeout: Duration) -> Router {
    routes::router(state)
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            request_timeout,
        ))
        .layer(TraceLayer::new_for_http())
}
