//! Metallic platform backend. Design: `docs/superpowers/specs/2026-10-30-platform-design.md`.
//! Contract: `api/openapi.yaml` (read at build time, see `build.rs`).
//!
//! Modules own one Postgres schema each (identity, social, games, discovery, matchmaker, catalog, economy) and call
//! each other's functions instead of reading each other's tables.

pub mod catalog;
pub mod config;
pub mod crypto;
pub mod economy;
pub mod games;
pub mod http;
pub mod identity;
pub mod ids;
pub mod jobs;
pub mod matchmaker;
pub mod problem;
pub mod routes;
pub mod seed;
pub mod services;
pub mod social;
pub mod text;
pub mod users;

use std::{ops::Deref, sync::Arc, time::Duration};

use axum::{
    Router,
    body::Body,
    extract::{MatchedPath, Request, State},
    http::{HeaderName, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use sqlx::PgPool;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

use crate::{
    config::{Config, Secrets},
    identity::{AgeBand, auth::Viewer},
    ids::IdGenerator,
    problem::{ApiResult, Problem},
    services::{CaptchaVerifier, Limit, Mailer, MemoryPresence, MemoryRateLimiter, PresenceStore, RateLimiter},
};

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

/// Requests per minute one client address may send to the public API before the global limit answers 429.
const GLOBAL_IP_LIMIT: Limit = Limit::per_minute("global_ip", 600);

/// Everything handlers share. Cheap to clone.
#[derive(Clone)]
pub struct AppState(Arc<AppInner>);

/// The parts of [`AppState`].
pub struct AppInner {
    pub db: PgPool,
    pub config: Config,
    pub secrets: Secrets,
    pub ids: IdGenerator,
    pub mailer: Arc<dyn Mailer>,
    pub presence: Arc<dyn PresenceStore>,
    pub limiter: Arc<dyn RateLimiter>,
    pub captcha: Arc<dyn CaptchaVerifier>,
    pub version: &'static str,
}

impl AppState {
    /// State with in-memory presence and rate limits (one API instance; Valkey-backed versions come with scale-out).
    pub fn new(
        db: PgPool,
        config: Config,
        secrets: Secrets,
        mailer: Arc<dyn Mailer>,
        captcha: Arc<dyn CaptchaVerifier>,
    ) -> Self {
        let ids = IdGenerator::new(config.worker_id);
        Self(Arc::new(AppInner {
            db,
            config,
            secrets,
            ids,
            mailer,
            presence: Arc::new(MemoryPresence::default()),
            limiter: Arc::new(MemoryRateLimiter::default()),
            captcha,
            version: env!("CARGO_PKG_VERSION"),
        }))
    }

    /// Swaps the rate limiter (tests use a generous one).
    pub fn with_limiter(self, limiter: Arc<dyn RateLimiter>) -> Self {
        let inner = Arc::try_unwrap(self.0).unwrap_or_else(|_| panic!("with_limiter is called before the state is shared"));
        Self(Arc::new(AppInner { limiter, ..inner }))
    }
}

impl Deref for AppState {
    type Target = AppInner;

    fn deref(&self) -> &AppInner {
        &self.0
    }
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState").field("environment", &self.config.environment).finish_non_exhaustive()
    }
}

/// The viewer's age band (None when signed out). Content labels and privacy rules hang off it.
pub async fn viewer_band(state: &AppState, viewer: Option<&Viewer>) -> ApiResult<Option<AgeBand>> {
    match viewer {
        None => Ok(None),
        Some(v) => Ok(identity::basic(&state.db, v.user_id).await?.map(|u| u.band())),
    }
}

/// The full HTTP application with middleware.
pub fn app(state: AppState) -> Router {
    let timeout = state.config.request_timeout;
    let cors = cors_layer(&state.config);
    routes::router(state.clone())
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, timeout))
        .layer(middleware::from_fn(problem_for_bare_errors))
        .layer(cors)
        .layer(security_header(header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .layer(security_header(header::REFERRER_POLICY, "no-referrer"))
        .layer(security_header(header::X_FRAME_OPTIONS, "DENY"))
        .layer(security_header(header::CONTENT_SECURITY_POLICY, "default-src 'none'; frame-ancestors 'none'"))
        .layer(security_header(header::STRICT_TRANSPORT_SECURITY, "max-age=31536000; includeSubDomains"))
        .layer(
            // Logs method, route template and status only: no query strings, bodies, cookies or addresses.
            TraceLayer::new_for_http().make_span_with(|req: &Request<Body>| {
                let route = req.extensions().get::<MatchedPath>().map_or("unmatched", MatchedPath::as_str);
                tracing::info_span!("http", method = %req.method(), route)
            }),
        )
}

fn security_header(name: HeaderName, value: &'static str) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::if_not_present(name, HeaderValue::from_static(value))
}

/// CORS for the allow-listed web origins only (never `*`), with credentials for the session cookie.
fn cors_layer(config: &Config) -> CorsLayer {
    let mut origins: Vec<HeaderValue> = config.cors_origins.iter().filter_map(|o| HeaderValue::from_str(o).ok()).collect();
    if let Ok(web) = HeaderValue::from_str(config.public_web_url.trim_end_matches('/')) {
        origins.push(web);
    }
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, HeaderName::from_static("x-csrf-token")])
        .expose_headers([header::RETRY_AFTER, HeaderName::from_static("x-csrf-token")])
        .max_age(Duration::from_secs(600))
}

/// Origin allow-list for unsafe requests, plus a global per-address rate limit on the public API.
async fn guard(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let internal = req.uri().path().starts_with("/internal/");
    if !internal {
        if identity::auth::is_unsafe(req.method())
            && req.headers().contains_key(header::ORIGIN)
            && !identity::auth::origin_allowed(&state, req.headers())
        {
            return Problem::forbidden("origin_not_allowed", "Request origin not allowed").into_response();
        }
        let (parts, body) = req.into_parts();
        let key = identity::auth::ip_key(&state, &parts);
        let decision = state.limiter.hit(GLOBAL_IP_LIMIT, &key).await;
        if !decision.allowed {
            return Problem::rate_limited(decision.reset_secs.max(1)).into_response();
        }
        return next.run(Request::from_parts(parts, body)).await;
    }
    next.run(req).await
}

/// Error responses produced outside handlers (body limit, timeout, wrong method, CORS) become problem+json too.
async fn problem_for_bare_errors(req: Request, next: Next) -> Response {
    let response = next.run(req).await;
    let status = response.status();
    let is_problem = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/problem+json") || v.starts_with("application/json"));
    if !(status.is_client_error() || status.is_server_error()) || is_problem {
        return response;
    }
    let code = match status {
        StatusCode::PAYLOAD_TOO_LARGE => "payload_too_large",
        StatusCode::REQUEST_TIMEOUT => "timeout",
        StatusCode::METHOD_NOT_ALLOWED => "method_not_allowed",
        StatusCode::NOT_FOUND => "not_found",
        StatusCode::UNSUPPORTED_MEDIA_TYPE => "unsupported_media_type",
        s if s.is_server_error() => "internal",
        _ => "bad_request",
    };
    let title = status.canonical_reason().unwrap_or("Error");
    let mut out = Problem::new(status, code, title).into_response();
    if let Some(allow) = response.headers().get(header::ALLOW) {
        out.headers_mut().insert(header::ALLOW, allow.clone());
    }
    out
}
