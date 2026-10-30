//! Request helpers: extractors that answer with problem details, client IP, pagination cursors, time formatting.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use axum::{
    extract::{ConnectInfo, FromRequest, FromRequestParts, Path, Query, Request, rejection::JsonRejection},
    http::{StatusCode, request::Parts},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::de::DeserializeOwned;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::{
    AppState,
    ids::parse_id,
    problem::{ApiResult, Problem},
};

/// JSON body; malformed bodies become 400 problem details, a missing content type 415.
pub struct ApiJson<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for ApiJson<T> {
    type Rejection = Problem;

    async fn from_request(req: Request, state: &S) -> Result<Self, Problem> {
        match axum::Json::<T>::from_request(req, state).await {
            Ok(axum::Json(v)) => Ok(Self(v)),
            Err(JsonRejection::MissingJsonContentType(_)) => Err(Problem::new(
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "unsupported_media_type",
                "Send application/json",
            )),
            Err(JsonRejection::BytesRejection(_)) => Err(Problem::new(
                StatusCode::PAYLOAD_TOO_LARGE,
                "payload_too_large",
                "Request body too large",
            )),
            Err(e) => Err(Problem::bad_request(e.body_text())),
        }
    }
}

/// Query string; anything unparseable becomes a 400.
pub struct ApiQuery<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequestParts<S> for ApiQuery<T> {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Problem> {
        Query::<T>::from_request_parts(parts, state)
            .await
            .map(|Query(v)| Self(v))
            .map_err(|e| Problem::bad_request(e.body_text()))
    }
}

/// A single id path parameter. Anything that is not an id is a 404 (no such resource).
pub struct IdPath(pub i64);

impl<S: Send + Sync> FromRequestParts<S> for IdPath {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Problem> {
        let Path(raw) = Path::<String>::from_request_parts(parts, state)
            .await
            .map_err(|_| Problem::not_found())?;
        parse_id(&raw).map(Self).ok_or_else(Problem::not_found)
    }
}

/// The client's IP address: the configured proxy header when set (deploys behind Cloudflare), else the socket peer.
/// Used only for rate limits and as a keyed hash; never logged or stored raw.
#[derive(Debug, Clone, Copy)]
pub struct ClientIp(pub IpAddr);

impl FromRequestParts<AppState> for ClientIp {
    type Rejection = Problem;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Problem> {
        Ok(client_ip(parts, state))
    }
}

pub fn client_ip(parts: &Parts, state: &AppState) -> ClientIp {
    if let Some(header) = &state.config.client_ip_header
        && let Some(ip) = parts
            .headers
            .get(header.as_str())
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .and_then(|v| v.trim().parse::<IpAddr>().ok())
    {
        return ClientIp(ip);
    }
    let ip = parts
        .extensions
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
    ClientIp(ip)
}

// ------------------------------------------------------------------ pagination

pub const DEFAULT_LIMIT: i64 = 24;
pub const MAX_LIMIT: i64 = 100;
/// Deepest offset a list serves; deeper pages need a narrower query.
pub const MAX_OFFSET: i64 = 5_000;

/// Position in a list. Offsets for ranked lists, keys (timestamp + id) for time-ordered lists.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cursor {
    Offset(i64),
    Key { micros: i64, id: i64 },
}

impl Cursor {
    pub fn encode(self) -> String {
        let raw = match self {
            Self::Offset(n) => format!("o:{n}"),
            Self::Key { micros, id } => format!("k:{micros}:{id}"),
        };
        URL_SAFE_NO_PAD.encode(raw)
    }

    pub fn decode(s: &str) -> Option<Self> {
        let raw = String::from_utf8(URL_SAFE_NO_PAD.decode(s).ok()?).ok()?;
        let mut parts = raw.split(':');
        let cursor = match parts.next()? {
            "o" => Self::Offset(parts.next()?.parse().ok().filter(|n| (0..=MAX_OFFSET).contains(n))?),
            "k" => Self::Key {
                micros: parts.next()?.parse().ok()?,
                id: parts.next()?.parse().ok()?,
            },
            _ => return None,
        };
        parts.next().is_none().then_some(cursor)
    }

    pub fn key_for(at: OffsetDateTime, id: i64) -> Self {
        Self::Key { micros: micros(at), id }
    }
}

/// Validated `limit` and `cursor`.
#[derive(Debug, Clone, Copy)]
pub struct Page {
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

impl Page {
    pub fn parse(limit: Option<&str>, cursor: Option<&str>) -> ApiResult<Self> {
        let limit = match limit {
            None | Some("") => DEFAULT_LIMIT,
            Some(v) => v
                .parse::<i64>()
                .ok()
                .filter(|n| (1..=MAX_LIMIT).contains(n))
                .ok_or_else(|| Problem::invalid("limit", "out_of_range", "Use a whole number from 1 to 100."))?,
        };
        let cursor = match cursor {
            None | Some("") => None,
            Some(v) if v.len() <= 512 => {
                Some(Cursor::decode(v).ok_or_else(|| Problem::invalid("cursor", "invalid", "Unknown cursor."))?)
            }
            Some(_) => return Err(Problem::invalid("cursor", "invalid", "Unknown cursor.")),
        };
        Ok(Self { limit, cursor })
    }

    /// Offset for ranked lists; a key cursor here is a client error.
    pub fn offset(&self) -> ApiResult<i64> {
        match self.cursor {
            None => Ok(0),
            Some(Cursor::Offset(n)) => Ok(n),
            Some(Cursor::Key { .. }) => Err(Problem::invalid("cursor", "invalid", "Unknown cursor.")),
        }
    }

    /// (micros, id) bound for time-ordered lists, newest first. None = start.
    pub fn key(&self) -> ApiResult<Option<(OffsetDateTime, i64)>> {
        match self.cursor {
            None => Ok(None),
            Some(Cursor::Key { micros: m, id }) => Ok(Some((from_micros(m)?, id))),
            Some(Cursor::Offset(_)) => Err(Problem::invalid("cursor", "invalid", "Unknown cursor.")),
        }
    }

    /// The next cursor for an offset page that fetched `limit + 1` rows.
    pub fn next_offset(&self, offset: i64, fetched: usize) -> Option<String> {
        let next = offset + self.limit;
        (fetched as i64 > self.limit && next <= MAX_OFFSET).then(|| Cursor::Offset(next).encode())
    }
}

pub fn micros(at: OffsetDateTime) -> i64 {
    (at.unix_timestamp_nanos() / 1_000) as i64
}

fn from_micros(m: i64) -> ApiResult<OffsetDateTime> {
    OffsetDateTime::from_unix_timestamp_nanos(i128::from(m) * 1_000)
        .map_err(|_| Problem::invalid("cursor", "invalid", "Unknown cursor."))
}

/// RFC 3339 in UTC with seconds precision, as the contract shows (`2026-10-30T06:00:00Z`).
pub fn rfc3339(at: OffsetDateTime) -> String {
    let at = at.to_offset(time::UtcOffset::UTC).replace_nanosecond(0).unwrap_or(at);
    at.format(&Rfc3339).unwrap_or_default()
}

pub fn rfc3339_opt(at: Option<OffsetDateTime>) -> Option<String> {
    at.map(rfc3339)
}

/// Parses `true`/`false` query flags.
pub fn parse_flag(field: &str, v: Option<&str>) -> ApiResult<Option<bool>> {
    match v {
        None | Some("") => Ok(None),
        Some("true") => Ok(Some(true)),
        Some("false") => Ok(Some(false)),
        Some(_) => Err(Problem::invalid(field, "invalid", "Use true or false.")),
    }
}

/// Parses a comma-separated id list (`?userIds=1,2,3`) with 1..=max entries, keeping order and duplicates.
pub fn parse_id_list(field: &str, v: Option<&str>, max: usize) -> ApiResult<Vec<i64>> {
    let v = v.unwrap_or("");
    let ids: Option<Vec<i64>> = v.split(',').filter(|s| !s.is_empty()).map(parse_id).collect();
    match ids {
        Some(ids) if !ids.is_empty() && ids.len() <= max => Ok(ids),
        _ => Err(Problem::invalid(field, "invalid", format!("Give 1 to {max} ids separated by commas."))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursors_round_trip_and_reject_junk() {
        for c in [Cursor::Offset(48), Cursor::Key { micros: 1_790_000_000_000_000, id: 42 }] {
            assert_eq!(Cursor::decode(&c.encode()), Some(c));
        }
        for bad in ["", "!!", "eDox", &URL_SAFE_NO_PAD.encode("o:-1"), &URL_SAFE_NO_PAD.encode("o:999999")] {
            assert_eq!(Cursor::decode(bad), None, "{bad}");
        }
    }

    #[test]
    fn page_limits() {
        assert_eq!(Page::parse(None, None).map(|p| p.limit).ok(), Some(24));
        assert!(Page::parse(Some("0"), None).is_err());
        assert!(Page::parse(Some("101"), None).is_err());
        assert!(Page::parse(Some("abc"), None).is_err());
        let p = Page::parse(Some("2"), None).ok();
        assert_eq!(p.and_then(|p| p.next_offset(0, 3)), Some(Cursor::Offset(2).encode()));
        assert_eq!(p.and_then(|p| p.next_offset(0, 2)), None);
    }

    #[test]
    fn id_lists() {
        assert_eq!(parse_id_list("ids", Some("1,2,2"), 3).ok(), Some(vec![1, 2, 2]));
        assert!(parse_id_list("ids", Some(""), 3).is_err());
        assert!(parse_id_list("ids", Some("1,x"), 3).is_err());
        assert!(parse_id_list("ids", Some("1,2,3,4"), 3).is_err());
    }

    #[test]
    fn timestamps_are_utc_seconds() {
        let at = OffsetDateTime::from_unix_timestamp_nanos(1_790_000_000_123_456_789).unwrap_or(OffsetDateTime::UNIX_EPOCH);
        assert_eq!(rfc3339(at), "2026-09-21T14:13:20Z");
    }
}
