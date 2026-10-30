//! RFC 9457 problem details, the error shape every endpoint uses (`Problem` in `api/openapi.yaml`).

use axum::{
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::Serialize;

const ERROR_DOCS: &str = "https://docs.metallic.example/errors/";

#[derive(Debug, Serialize)]
pub struct Problem {
    #[serde(rename = "type")]
    pub type_uri: String,
    pub title: String,
    pub status: u16,
    /// Stable machine-readable code; clients switch on this.
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl Problem {
    pub fn new(status: StatusCode, code: &'static str, title: impl Into<String>) -> Self {
        Self {
            type_uri: format!("{ERROR_DOCS}{}", code.replace('_', "-")),
            title: title.into(),
            status: status.as_u16(),
            code,
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn not_found() -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", "Not found")
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

impl IntoResponse for Problem {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let mut response = (status, axum::Json(self)).into_response();
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        );
        response
    }
}
