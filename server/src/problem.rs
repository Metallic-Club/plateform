//! RFC 9457 problem details, the error shape every endpoint uses (`Problem` in `api/openapi.yaml`).

use axum::{
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use std::num::NonZeroU64;

const ERROR_DOCS: &str = "https://docs.metallic.example/errors/";

/// One field that failed validation.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FieldError {
    pub field: String,
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct Problem {
    #[serde(rename = "type")]
    pub type_uri: String,
    pub title: String,
    pub status: u16,
    /// Stable machine-readable code; clients switch on this.
    pub code: &'static str,
    /// Optional detail, omitted from JSON when absent. Boxed text keeps the shared error representation compact.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Box<str>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<FieldError>,
    /// Positive seconds for `Retry-After` on 429. Not part of the body; the builder normalizes zero to one.
    #[serde(skip)]
    pub retry_after: Option<NonZeroU64>,
}

/// Result type for handlers.
pub type ApiResult<T> = Result<T, Problem>;

impl Problem {
    pub fn new(status: StatusCode, code: &'static str, title: impl Into<String>) -> Self {
        Self {
            type_uri: format!("{ERROR_DOCS}{}", code.replace('_', "-")),
            title: title.into(),
            status: status.as_u16(),
            code,
            detail: None,
            errors: Vec::new(),
            retry_after: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into().into_boxed_str());
        self
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "Not found")
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", "Sign in needed")
    }

    pub fn forbidden(code: &'static str, title: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, title)
    }

    pub fn conflict(code: &'static str, title: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, title)
    }

    /// 400 with one field error.
    pub fn invalid(field: &str, code: &'static str, message: impl Into<String>) -> Self {
        Self::validation(vec![FieldError {
            field: field.to_owned(),
            code,
            message: message.into(),
        }])
    }

    /// 400 listing every field that failed.
    pub fn validation(errors: Vec<FieldError>) -> Self {
        let mut p = Self::new(
            StatusCode::BAD_REQUEST,
            "validation_failed",
            "Some fields are not valid",
        );
        p.errors = errors;
        p
    }

    pub fn bad_request(detail: impl Into<String>) -> Self {
        Self::new(
            StatusCode::BAD_REQUEST,
            "bad_request",
            "The request is not valid",
        )
        .with_detail(detail)
    }

    pub fn rate_limited(retry_after: u64) -> Self {
        let mut p = Self::new(StatusCode::TOO_MANY_REQUESTS, "rate_limited", "Slow down");
        p.retry_after = NonZeroU64::new(retry_after.max(1));
        p
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            "Something went wrong",
        )
    }

    /// The operation is in the contract but its handler is not built yet.
    pub fn not_implemented(operation_id: &str) -> Self {
        Self::new(
            StatusCode::NOT_IMPLEMENTED,
            "not_implemented",
            "Not built yet",
        )
        .with_detail(format!(
            "Operation `{operation_id}` is in the API contract but has no handler yet."
        ))
    }
}

/// Collects field errors, then turns them into one 400.
#[derive(Debug, Default)]
pub struct Validator {
    errors: Vec<FieldError>,
}

impl Validator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, field: &str, code: &'static str, message: impl Into<String>) {
        self.errors.push(FieldError {
            field: field.to_owned(),
            code,
            message: message.into(),
        });
    }

    pub fn check(&mut self, ok: bool, field: &str, code: &'static str, message: &str) {
        if !ok {
            self.add(field, code, message);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.errors.is_empty()
    }

    pub fn finish(self) -> ApiResult<()> {
        if self.errors.is_empty() {
            Ok(())
        } else {
            Err(Problem::validation(self.errors))
        }
    }
}

impl From<sqlx::Error> for Problem {
    fn from(e: sqlx::Error) -> Self {
        // Database messages can echo values (e.g. a duplicate key), so only the kind, SQLSTATE and constraint are logged.
        match &e {
            sqlx::Error::Database(db) => tracing::error!(
                sqlstate = db.code().as_deref().unwrap_or(""),
                constraint = db.constraint().unwrap_or(""),
                "database error"
            ),
            sqlx::Error::PoolTimedOut => tracing::error!("database pool timed out"),
            other => tracing::error!(kind = %error_kind(other), "database error"),
        }
        Problem::internal()
    }
}

fn error_kind(e: &sqlx::Error) -> &'static str {
    match e {
        sqlx::Error::RowNotFound => "row_not_found",
        sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => "decode",
        sqlx::Error::Io(_) => "io",
        sqlx::Error::Tls(_) => "tls",
        sqlx::Error::Protocol(_) => "protocol",
        sqlx::Error::PoolClosed => "pool_closed",
        _ => "other",
    }
}

/// True when `e` is a unique-constraint violation (SQLSTATE 23505).
pub fn is_unique_violation(e: &sqlx::Error) -> bool {
    matches!(e, sqlx::Error::Database(db) if db.code().as_deref() == Some("23505"))
}

impl IntoResponse for Problem {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let retry_after = self.retry_after;
        let mut response = (status, axum::Json(self)).into_response();
        let headers = response.headers_mut();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        );
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if let Some(secs) = retry_after {
            headers.insert(header::RETRY_AFTER, HeaderValue::from(secs.get()));
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;

    #[tokio::test]
    async fn compact_problem_preserves_json_omission_details_and_exact_headers() {
        println!("Problem layout: {} bytes", std::mem::size_of::<Problem>());
        let missing = serde_json::to_value(Problem::unauthorized()).expect("problem JSON");
        assert!(missing.get("detail").is_none());
        assert!(missing.get("errors").is_none());
        assert!(missing.get("retry_after").is_none());
        let empty = serde_json::to_value(Problem::bad_request("")).expect("empty detail JSON");
        assert_eq!(empty["detail"], "");
        let response = Problem::rate_limited(0)
            .with_detail("Retry later. Ñ")
            .into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(response.headers()[header::RETRY_AFTER], "1");
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("problem body")
            .to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).expect("wire JSON");
        assert_eq!(body["status"], 429);
        assert_eq!(body["code"], "rate_limited");
        assert_eq!(body["detail"], "Retry later. Ñ");
        assert!(body.get("retry_after").is_none());
        assert_eq!(
            Problem::rate_limited(12).into_response().headers()[header::RETRY_AFTER],
            "12"
        );
        assert!(
            Problem::unauthorized()
                .into_response()
                .headers()
                .get(header::RETRY_AFTER)
                .is_none()
        );
    }
}
