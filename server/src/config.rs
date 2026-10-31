//! Configuration from environment variables. Names and defaults are listed in `server/.env.example`.
//! Secrets have no defaults: the process refuses to start without them (`metallic-platform keygen` prints fresh ones).
//! Policy values for the owner's open questions (design spec section 14) live in [`Policy`] so they are easy to change.

use std::{
    fmt,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use base64::Engine as _;

use crate::matchmaker::ticket::Keyring;

/// Which job this process does. One binary, several roles (design spec D3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Public HTTP API (also runs background jobs when `METALLIC_RUN_JOBS` is on).
    Api,
    /// Background jobs only.
    Worker,
}

/// Deployment environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Dev,
    Staging,
    Prod,
}

/// Secret keys. `Debug` never prints them.
#[derive(Clone)]
pub struct Secrets {
    /// Keyed hashes: email lookups, IP signals, CSRF tokens.
    pub hmac_key: Vec<u8>,
    /// AES-256-GCM key for personal data at rest (email, birth date).
    pub data_key: [u8; 32],
    /// Deprecated shared secret for the internal endpoints. Only set when `METALLIC_LEGACY_SERVER_SECRET` is on
    /// (off by default); hosts use their own `mht_` token instead.
    pub server_secret: Option<String>,
    /// Ed25519 join-ticket keys (`METALLIC_TICKET_KEYS_FILE` or `METALLIC_TICKET_KEYS`; a random key in dev).
    pub ticket_keys: Arc<Keyring>,
}

impl fmt::Debug for Secrets {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secrets { .. }")
    }
}

/// Product rules that are still open questions for the owner. Defaults follow the design spec's assistant's calls.
#[derive(Debug, Clone)]
pub struct Policy {
    /// Days an account has to verify its email before the deletion job removes it (spec 9.2, question 1).
    pub verify_window_days: i64,
    /// Accounts one email address may hold, which is also the per-person alt limit (spec 9.2, question 2).
    pub max_accounts_per_email: i64,
    /// Sign-ups per IP in 24 hours before a captcha is required (spec 9.2, question 3).
    pub signups_per_ip_free: i64,
    /// Sign-ups per IP in 24 hours from which new accounts start on a manual-review hold.
    pub signups_per_ip_review: i64,
    /// Days a name freed by a rename stays held (spec 9.2 name sniping, question 4).
    pub name_hold_rename_days: i64,
    /// Days a name freed by an account deletion stays held.
    pub name_hold_deletion_days: i64,
    /// A held name returns to the pool at a random time within this many days after the hold ends.
    pub name_release_jitter_days: i64,
    /// Username checks per IP per hour before 429.
    pub username_checks_per_hour: u32,
    /// Age under which a parent must consent (digital-consent age).
    pub parental_consent_age: i32,
    /// In-game text chat for players 13 and over with a verified, active account. Off until age assurance exists
    /// (design spec: chat is gated by age assurance); under-13 and unknown-age players never get it here.
    pub game_chat_enabled: bool,
    /// In-game voice, same rule as chat (multiplayer spec section 9: off for under-13 and unknown age).
    pub game_voice_enabled: bool,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            verify_window_days: 30,
            max_accounts_per_email: 5,
            signups_per_ip_free: 3,
            signups_per_ip_review: 10,
            name_hold_rename_days: 90,
            name_hold_deletion_days: 30,
            name_release_jitter_days: 7,
            username_checks_per_hour: 30,
            parental_consent_age: 13,
            game_chat_enabled: false,
            game_voice_enabled: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub role: Role,
    pub environment: Environment,
    pub log_filter: String,
    pub request_timeout: Duration,
    /// Postgres connection string. Never logged.
    pub database_url: Option<String>,
    pub database_max_connections: u32,
    pub secrets: Option<Secrets>,
    /// Origins allowed by CORS and by the Origin check on unsafe requests.
    pub cors_origins: Vec<String>,
    /// Website base URL used in emails and the device-flow verification URI.
    pub public_web_url: String,
    /// `Secure` flag on cookies. Only dev may turn it off.
    pub cookie_secure: bool,
    /// Header that carries the client IP when behind a trusted proxy (e.g. `X-Forwarded-For`, `CF-Connecting-IP`).
    /// Only read when the TCP peer is in `trusted_proxies`. None = socket address.
    pub client_ip_header: Option<String>,
    /// Proxies allowed to set `client_ip_header` (`METALLIC_TRUSTED_PROXIES`, comma-separated CIDRs). Required when
    /// the header is set.
    pub trusted_proxies: Vec<Cidr>,
    /// Accept loopback, private, link-local and unspecified client and host addresses for knock tokens and host
    /// edges (`METALLIC_ALLOW_PRIVATE_ADDRESSES`). Default: on in dev only.
    pub allow_private_addresses: bool,
    /// Folder where the dev mailer writes emails. None = log only (link redacted).
    pub dev_mail_dir: Option<String>,
    /// Snowflake worker id (0-1023), unique per running process.
    pub worker_id: u16,
    /// Run background jobs inside the api process.
    pub run_jobs: bool,
    /// Apply migrations at startup.
    pub migrate_on_start: bool,
    /// Put the client address (as the backend sees it) into join tickets (`ip` claim). Off by default.
    pub ticket_bind_ip: bool,
    pub policy: Policy,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ConfigError {
    pub variable: &'static str,
    pub message: String,
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.variable, self.message)
    }
}

impl std::error::Error for ConfigError {}

impl Config {
    /// Reads the process environment.
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Reads configuration through `lookup`, so tests do not touch the process environment.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let get = |name: &'static str| lookup(name).filter(|v| !v.trim().is_empty());
        let bind_addr = parse(
            "METALLIC_BIND_ADDR",
            get("METALLIC_BIND_ADDR"),
            "127.0.0.1:8080",
            |v| v.parse::<SocketAddr>().map_err(|e| e.to_string()),
        )?;
        let role = parse("METALLIC_ROLE", get("METALLIC_ROLE"), "api", |v| match v {
            "api" => Ok(Role::Api),
            "worker" => Ok(Role::Worker),
            other => Err(format!("unknown role `{other}` (expected api or worker)")),
        })?;
        // No default: dev relaxes address checks and accepts a random ticket key, so a deployment that forgot the
        // variable must not start as dev.
        let environment = get("METALLIC_ENV").ok_or_else(|| ConfigError {
            variable: "METALLIC_ENV",
            message: "must be set to dev, staging or prod".to_owned(),
        })?;
        let environment = parse("METALLIC_ENV", Some(environment), "", |v| match v {
            "dev" => Ok(Environment::Dev),
            "staging" => Ok(Environment::Staging),
            "prod" => Ok(Environment::Prod),
            other => Err(format!(
                "unknown environment `{other}` (expected dev, staging or prod)"
            )),
        })?;
        let dev = environment == Environment::Dev;
        let log_filter = get("METALLIC_LOG").unwrap_or_else(|| "info".to_owned());
        let request_timeout = parse(
            "METALLIC_REQUEST_TIMEOUT_SECS",
            get("METALLIC_REQUEST_TIMEOUT_SECS"),
            "10",
            |v| match v.parse::<u64>() {
                Ok(0) => Err("must be at least 1".to_owned()),
                Ok(secs) if secs > 300 => Err("must be at most 300".to_owned()),
                Ok(secs) => Ok(Duration::from_secs(secs)),
                Err(e) => Err(e.to_string()),
            },
        )?;
        let database_url = get("METALLIC_DATABASE_URL");
        let database_max_connections = parse(
            "METALLIC_DATABASE_MAX_CONNECTIONS",
            get("METALLIC_DATABASE_MAX_CONNECTIONS"),
            "20",
            |v| int_in(v, 1, 500),
        )?;

        let legacy_server_secret = parse(
            "METALLIC_LEGACY_SERVER_SECRET",
            get("METALLIC_LEGACY_SERVER_SECRET"),
            "false",
            parse_bool,
        )?;
        let secrets = match (
            get("METALLIC_HMAC_KEY"),
            get("METALLIC_DATA_KEY"),
            get("METALLIC_SERVER_SECRET"),
        ) {
            (None, None, None) => None,
            (hmac, data, server) => Some(Secrets {
                hmac_key: key_bytes("METALLIC_HMAC_KEY", hmac, 32)?,
                data_key: key_bytes("METALLIC_DATA_KEY", data, 32)?
                    .try_into()
                    .map_err(|_| ConfigError {
                        variable: "METALLIC_DATA_KEY",
                        message: "must decode to exactly 32 bytes".to_owned(),
                    })?,
                server_secret: match (legacy_server_secret, server) {
                    (false, _) => None,
                    (true, Some(s)) if s.len() >= 32 => Some(s),
                    (true, _) => {
                        return Err(ConfigError {
                            variable: "METALLIC_SERVER_SECRET",
                            message: "must be set, at least 32 characters, while METALLIC_LEGACY_SERVER_SECRET is on"
                                .to_owned(),
                        });
                    }
                },
                ticket_keys: Arc::new(ticket_keys(
                    get("METALLIC_TICKET_KEYS"),
                    get("METALLIC_TICKET_KEYS_FILE"),
                    dev,
                )?),
            }),
        };

        let cors_origins = get("METALLIC_CORS_ORIGINS")
            .map(|v| {
                v.split(',')
                    .map(|o| o.trim().trim_end_matches('/').to_owned())
                    .filter(|o| !o.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for origin in &cors_origins {
            if origin == "*" || !(origin.starts_with("https://") || origin.starts_with("http://")) {
                return Err(ConfigError {
                    variable: "METALLIC_CORS_ORIGINS",
                    message: format!(
                        "`{origin}` is not an http(s) origin (wildcards are not allowed)"
                    ),
                });
            }
        }
        let public_web_url = get("METALLIC_PUBLIC_WEB_URL")
            .unwrap_or_else(|| "http://localhost:3000".to_owned())
            .trim_end_matches('/')
            .to_owned();
        let cookie_secure = parse(
            "METALLIC_COOKIE_SECURE",
            get("METALLIC_COOKIE_SECURE"),
            "true",
            parse_bool,
        )?;
        if !cookie_secure && !dev {
            return Err(ConfigError {
                variable: "METALLIC_COOKIE_SECURE",
                message: "may only be false in dev".to_owned(),
            });
        }
        let client_ip_header = get("METALLIC_CLIENT_IP_HEADER")
            .map(|h| h.trim().to_ascii_lowercase())
            .filter(|h| !h.is_empty());
        let trusted_proxies = match get("METALLIC_TRUSTED_PROXIES") {
            None => Vec::new(),
            Some(list) => list
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| {
                    Cidr::parse(s).ok_or_else(|| ConfigError {
                        variable: "METALLIC_TRUSTED_PROXIES",
                        message: "must be comma-separated IP addresses or CIDRs".to_owned(),
                    })
                })
                .collect::<Result<_, _>>()?,
        };
        if client_ip_header.is_some() && trusted_proxies.is_empty() {
            return Err(ConfigError {
                variable: "METALLIC_TRUSTED_PROXIES",
                message:
                    "is required with METALLIC_CLIENT_IP_HEADER (the proxies allowed to set it)"
                        .to_owned(),
            });
        }
        let allow_private_addresses = parse(
            "METALLIC_ALLOW_PRIVATE_ADDRESSES",
            get("METALLIC_ALLOW_PRIVATE_ADDRESSES"),
            if dev { "true" } else { "false" },
            parse_bool,
        )?;
        let dev_mail_dir = get("METALLIC_DEV_MAIL_DIR");
        let worker_id = parse("METALLIC_WORKER_ID", get("METALLIC_WORKER_ID"), "0", |v| {
            int_in(v, 0, 1023).map(|n: u32| n as u16)
        })?;
        let run_jobs = parse(
            "METALLIC_RUN_JOBS",
            get("METALLIC_RUN_JOBS"),
            if dev { "true" } else { "false" },
            parse_bool,
        )?;
        let migrate_on_start = parse(
            "METALLIC_MIGRATE_ON_START",
            get("METALLIC_MIGRATE_ON_START"),
            if dev { "true" } else { "false" },
            parse_bool,
        )?;

        let ticket_bind_ip = parse(
            "METALLIC_TICKET_BIND_IP",
            get("METALLIC_TICKET_BIND_IP"),
            "false",
            parse_bool,
        )?;

        let d = Policy::default();
        let policy = Policy {
            verify_window_days: parse_num(
                "METALLIC_VERIFY_WINDOW_DAYS",
                get("METALLIC_VERIFY_WINDOW_DAYS"),
                d.verify_window_days,
                1,
                365,
            )?,
            max_accounts_per_email: parse_num(
                "METALLIC_MAX_ACCOUNTS_PER_EMAIL",
                get("METALLIC_MAX_ACCOUNTS_PER_EMAIL"),
                d.max_accounts_per_email,
                1,
                100,
            )?,
            signups_per_ip_free: parse_num(
                "METALLIC_SIGNUPS_PER_IP_FREE",
                get("METALLIC_SIGNUPS_PER_IP_FREE"),
                d.signups_per_ip_free,
                0,
                10_000,
            )?,
            signups_per_ip_review: parse_num(
                "METALLIC_SIGNUPS_PER_IP_REVIEW",
                get("METALLIC_SIGNUPS_PER_IP_REVIEW"),
                d.signups_per_ip_review,
                1,
                10_000,
            )?,
            name_hold_rename_days: parse_num(
                "METALLIC_NAME_HOLD_RENAME_DAYS",
                get("METALLIC_NAME_HOLD_RENAME_DAYS"),
                d.name_hold_rename_days,
                0,
                3650,
            )?,
            name_hold_deletion_days: parse_num(
                "METALLIC_NAME_HOLD_DELETION_DAYS",
                get("METALLIC_NAME_HOLD_DELETION_DAYS"),
                d.name_hold_deletion_days,
                0,
                3650,
            )?,
            name_release_jitter_days: parse_num(
                "METALLIC_NAME_RELEASE_JITTER_DAYS",
                get("METALLIC_NAME_RELEASE_JITTER_DAYS"),
                d.name_release_jitter_days,
                0,
                365,
            )?,
            username_checks_per_hour: parse_num(
                "METALLIC_USERNAME_CHECKS_PER_HOUR",
                get("METALLIC_USERNAME_CHECKS_PER_HOUR"),
                i64::from(d.username_checks_per_hour),
                1,
                100_000,
            )? as u32,
            parental_consent_age: parse_num(
                "METALLIC_PARENTAL_CONSENT_AGE",
                get("METALLIC_PARENTAL_CONSENT_AGE"),
                i64::from(d.parental_consent_age),
                13,
                16,
            )? as i32,
            game_chat_enabled: parse(
                "METALLIC_GAME_CHAT_ENABLED",
                get("METALLIC_GAME_CHAT_ENABLED"),
                "false",
                parse_bool,
            )?,
            game_voice_enabled: parse(
                "METALLIC_GAME_VOICE_ENABLED",
                get("METALLIC_GAME_VOICE_ENABLED"),
                "false",
                parse_bool,
            )?,
        };

        Ok(Self {
            bind_addr,
            role,
            environment,
            log_filter,
            request_timeout,
            database_url,
            database_max_connections,
            secrets,
            cors_origins,
            public_web_url,
            cookie_secure,
            client_ip_header,
            trusted_proxies,
            allow_private_addresses,
            dev_mail_dir,
            worker_id,
            run_jobs,
            migrate_on_start,
            ticket_bind_ip,
            policy,
        })
    }

    /// The database URL, or an error naming the variable.
    pub fn require_database_url(&self) -> Result<&str, ConfigError> {
        self.database_url.as_deref().ok_or(ConfigError {
            variable: "METALLIC_DATABASE_URL",
            message: "must be set (see server/README.md for the local database)".to_owned(),
        })
    }

    /// The secrets, or an error naming what is missing.
    pub fn require_secrets(&self) -> Result<&Secrets, ConfigError> {
        self.secrets.as_ref().ok_or(ConfigError {
            variable: "METALLIC_HMAC_KEY",
            message: "METALLIC_HMAC_KEY and METALLIC_DATA_KEY must be set \
                      (run `metallic-platform keygen` for fresh values)"
                .to_owned(),
        })
    }
}

/// An IP network (`10.0.0.0/8`, `2001:db8::/32`, or a bare address = one host).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cidr {
    network: IpAddr,
    prefix: u8,
}

impl Cidr {
    pub fn parse(text: &str) -> Option<Self> {
        let (addr, prefix) = match text.split_once('/') {
            Some((a, p)) => (a, Some(p)),
            None => (text, None),
        };
        let network: IpAddr = addr.trim().parse().ok()?;
        let network = network.to_canonical();
        let max = if network.is_ipv4() { 32 } else { 128 };
        let prefix = match prefix {
            None => max,
            Some(p) => p.trim().parse::<u8>().ok().filter(|p| *p <= max)?,
        };
        Some(Self { network, prefix })
    }

    pub fn contains(&self, ip: IpAddr) -> bool {
        match (self.network, ip.to_canonical()) {
            (IpAddr::V4(n), IpAddr::V4(a)) => {
                let mask = u32::MAX
                    .checked_shl(32 - u32::from(self.prefix))
                    .unwrap_or(0);
                u32::from(n) & mask == u32::from(a) & mask
            }
            (IpAddr::V6(n), IpAddr::V6(a)) => {
                let mask = u128::MAX
                    .checked_shl(128 - u32::from(self.prefix))
                    .unwrap_or(0);
                u128::from(n) & mask == u128::from(a) & mask
            }
            _ => false,
        }
    }
}

/// An address a player or another host can reach over the internet: not loopback, private (RFC 1918, ULA), shared
/// (CGNAT), link-local, unspecified, broadcast or multicast. IPv4-mapped IPv6 is judged as IPv4.
pub fn is_public_address(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(a) => {
            let [b0, b1, ..] = a.octets();
            !(a.is_loopback()
                || a.is_private()
                || a.is_link_local()
                || a.is_unspecified()
                || a.is_broadcast()
                || a.is_multicast()
                || b0 == 0
                || (b0 == 100 && (64..128).contains(&b1)))
        }
        IpAddr::V6(a) => {
            let s0 = a.segments()[0];
            !(a.is_loopback()
                || a.is_unspecified()
                || a.is_multicast()
                || (s0 & 0xfe00) == 0xfc00
                || (s0 & 0xffc0) == 0xfe80)
        }
    }
}

fn parse<T>(
    variable: &'static str,
    value: Option<String>,
    default: &str,
    convert: impl Fn(&str) -> Result<T, String>,
) -> Result<T, ConfigError> {
    let raw = value.unwrap_or_else(|| default.to_owned());
    convert(raw.trim()).map_err(|message| ConfigError { variable, message })
}

fn parse_num(
    variable: &'static str,
    value: Option<String>,
    default: i64,
    min: i64,
    max: i64,
) -> Result<i64, ConfigError> {
    match value {
        None => Ok(default),
        Some(v) => int_in(v.trim(), min, max).map_err(|message| ConfigError { variable, message }),
    }
}

fn int_in<T: TryFrom<i64>>(v: &str, min: i64, max: i64) -> Result<T, String> {
    let n: i64 = v
        .parse()
        .map_err(|e: std::num::ParseIntError| e.to_string())?;
    if n < min || n > max {
        return Err(format!("must be between {min} and {max}"));
    }
    T::try_from(n).map_err(|_| "out of range".to_owned())
}

fn parse_bool(v: &str) -> Result<bool, String> {
    match v {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        other => Err(format!("`{other}` is not a boolean (true or false)")),
    }
}

/// The ticket keyring: a JSON keyset from a file or a base64 variable (never both); a random key only in dev.
fn ticket_keys(
    inline: Option<String>,
    file: Option<String>,
    dev: bool,
) -> Result<Keyring, ConfigError> {
    let now = time::OffsetDateTime::now_utc();
    let (variable, json) = match (inline, file) {
        (Some(_), Some(_)) => {
            return Err(ConfigError {
                variable: "METALLIC_TICKET_KEYS",
                message: "set METALLIC_TICKET_KEYS or METALLIC_TICKET_KEYS_FILE, not both"
                    .to_owned(),
            });
        }
        (Some(b64), None) => {
            let v = b64.trim();
            let json = base64::engine::general_purpose::STANDARD
                .decode(v)
                .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(v))
                .map_err(|_| ConfigError {
                    variable: "METALLIC_TICKET_KEYS",
                    message: "must be base64 of the keyset JSON".to_owned(),
                })?;
            ("METALLIC_TICKET_KEYS", json)
        }
        (None, Some(path)) => {
            // The path is the operator's own; the error names only the variable, not the path or the content.
            let json = std::fs::read(path.trim()).map_err(|_| ConfigError {
                variable: "METALLIC_TICKET_KEYS_FILE",
                message: "cannot read the keyset file".to_owned(),
            })?;
            ("METALLIC_TICKET_KEYS_FILE", json)
        }
        (None, None) if dev => return Ok(Keyring::ephemeral()),
        (None, None) => {
            return Err(ConfigError {
                variable: "METALLIC_TICKET_KEYS_FILE",
                message: "a ticket keyset is required outside dev (see docs/m2-join-tickets.md)"
                    .to_owned(),
            });
        }
    };
    let ring =
        Keyring::from_json(&json, now).map_err(|message| ConfigError { variable, message })?;
    if !dev && ring.has_test_key() {
        return Err(ConfigError {
            variable,
            message:
                "the keyset contains the published test key; generate one with `ticket-key new`"
                    .to_owned(),
        });
    }
    Ok(ring)
}

fn key_bytes(
    variable: &'static str,
    value: Option<String>,
    min_len: usize,
) -> Result<Vec<u8>, ConfigError> {
    let err = |message: &str| ConfigError {
        variable,
        message: message.to_owned(),
    };
    let value = value.ok_or_else(|| err("must be set (run `metallic-platform keygen`)"))?;
    let value = value.trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(value))
        .map_err(|_| err("must be base64"))?;
    if bytes.len() < min_len {
        return Err(err(&format!("must decode to at least {min_len} bytes")));
    }
    Ok(bytes)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    const KEY: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

    /// base64 of `{"keys":[{"kid":"test","status":"active","d":<test seed 00..1f>}]}`. Test-only key.
    /// A fake keyset (seed 0x2a repeated), not the published test key, so it passes outside dev.
    fn keyset() -> String {
        base64::engine::general_purpose::STANDARD.encode(
            br#"{"keys":[{"kid":"test","status":"active","d":"KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio"}]}"#,
        )
    }

    /// `vars` plus `METALLIC_ENV=dev` unless `vars` sets it (the one variable without a default).
    fn config(vars: &[(&str, &str)]) -> Result<Config, ConfigError> {
        let mut map: HashMap<String, String> = vars
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        map.entry("METALLIC_ENV".to_owned())
            .or_insert_with(|| "dev".to_owned());
        Config::from_lookup(|name| map.get(name).cloned())
    }

    #[test]
    fn the_environment_must_be_explicit() {
        for unset in [None, Some(""), Some("  ")] {
            let err = Config::from_lookup(|name| {
                (name == "METALLIC_ENV")
                    .then_some(unset)
                    .flatten()
                    .map(str::to_owned)
            })
            .expect_err("no implicit dev");
            assert_eq!(err.variable, "METALLIC_ENV");
        }
        let c = Config::from_lookup(|name| (name == "METALLIC_ENV").then(|| "dev".to_owned()));
        assert_eq!(c.expect("explicit dev").environment, Environment::Dev);
    }

    #[test]
    fn defaults_are_local_and_safe() {
        let c = config(&[]).expect("defaults parse");
        assert_eq!(c.bind_addr.to_string(), "127.0.0.1:8080");
        assert_eq!(c.role, Role::Api);
        assert_eq!(c.environment, Environment::Dev);
        assert_eq!(c.request_timeout, Duration::from_secs(10));
        assert!(c.cookie_secure);
        assert!(c.cors_origins.is_empty());
        assert!(c.secrets.is_none());
        assert!(c.require_secrets().is_err());
        assert_eq!(c.policy.verify_window_days, 30);
        assert_eq!(c.policy.max_accounts_per_email, 5);
    }

    #[test]
    fn reads_every_variable() {
        let c = config(&[
            ("METALLIC_BIND_ADDR", "0.0.0.0:9000"),
            ("METALLIC_ROLE", "worker"),
            ("METALLIC_ENV", "prod"),
            ("METALLIC_LOG", "debug"),
            ("METALLIC_REQUEST_TIMEOUT_SECS", "30"),
            ("METALLIC_HMAC_KEY", KEY),
            ("METALLIC_DATA_KEY", KEY),
            ("METALLIC_SERVER_SECRET", "0123456789abcdef0123456789abcdef"),
            ("METALLIC_TICKET_KEYS", &keyset()),
            (
                "METALLIC_CORS_ORIGINS",
                "https://a.example, https://b.example/",
            ),
            ("METALLIC_VERIFY_WINDOW_DAYS", "45"),
            ("METALLIC_MAX_ACCOUNTS_PER_EMAIL", "3"),
        ])
        .expect("valid config");
        assert_eq!(c.bind_addr.port(), 9000);
        assert_eq!(c.role, Role::Worker);
        assert_eq!(c.environment, Environment::Prod);
        assert_eq!(c.log_filter, "debug");
        assert_eq!(c.request_timeout, Duration::from_secs(30));
        assert_eq!(
            c.cors_origins,
            vec!["https://a.example", "https://b.example"]
        );
        assert_eq!(c.policy.verify_window_days, 45);
        assert_eq!(c.policy.max_accounts_per_email, 3);
        assert!(!c.run_jobs, "jobs stay off in the api role outside dev");
        assert!(!c.ticket_bind_ip);
        let secrets = c.secrets.unwrap();
        assert!(
            secrets.server_secret.is_none(),
            "legacy shared secret is off by default"
        );
        assert_eq!(secrets.ticket_keys.active_kid(), "test");
        assert!(!secrets.ticket_keys.is_ephemeral());
        assert_eq!(format!("{secrets:?}"), "Secrets { .. }");
    }

    #[test]
    fn ticket_keys_and_legacy_secret() {
        let dev = config(&[("METALLIC_HMAC_KEY", KEY), ("METALLIC_DATA_KEY", KEY)]).unwrap();
        let secrets = dev.secrets.unwrap();
        assert!(
            secrets.ticket_keys.is_ephemeral(),
            "dev without keys gets a random key"
        );
        assert!(secrets.server_secret.is_none());
        let prod = |extra: &[(&str, &str)]| {
            let mut vars = vec![
                ("METALLIC_ENV", "prod"),
                ("METALLIC_HMAC_KEY", KEY),
                ("METALLIC_DATA_KEY", KEY),
            ];
            vars.extend_from_slice(extra);
            config(&vars)
        };
        assert_eq!(prod(&[]).unwrap_err().variable, "METALLIC_TICKET_KEYS_FILE");
        // The documented test key (seed 00..1f) works in dev only.
        let test_seed: Vec<u8> = (0u8..32).collect();
        let test_set = base64::engine::general_purpose::STANDARD.encode(format!(
            r#"{{"keys":[{{"kid":"test-2026-10","status":"active","d":"{}"}}]}}"#,
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&test_seed)
        ));
        let err = prod(&[("METALLIC_TICKET_KEYS", &test_set)]).unwrap_err();
        assert_eq!(err.variable, "METALLIC_TICKET_KEYS");
        assert!(err.message.contains("test key"));
        let dev_test = config(&[
            ("METALLIC_HMAC_KEY", KEY),
            ("METALLIC_DATA_KEY", KEY),
            ("METALLIC_TICKET_KEYS", &test_set),
        ])
        .unwrap();
        assert!(dev_test.secrets.unwrap().ticket_keys.has_test_key());
        let keys = keyset();
        assert_eq!(
            prod(&[
                ("METALLIC_TICKET_KEYS", &keys),
                ("METALLIC_TICKET_KEYS_FILE", "x")
            ])
            .unwrap_err()
            .variable,
            "METALLIC_TICKET_KEYS"
        );
        assert_eq!(
            prod(&[("METALLIC_TICKET_KEYS", "bm90IGpzb24=")])
                .unwrap_err()
                .variable,
            "METALLIC_TICKET_KEYS"
        );
        assert_eq!(
            prod(&[
                ("METALLIC_TICKET_KEYS", &keys),
                ("METALLIC_LEGACY_SERVER_SECRET", "true")
            ])
            .unwrap_err()
            .variable,
            "METALLIC_SERVER_SECRET"
        );
        let legacy = prod(&[
            ("METALLIC_TICKET_KEYS", &keys),
            ("METALLIC_LEGACY_SERVER_SECRET", "true"),
            ("METALLIC_SERVER_SECRET", "0123456789abcdef0123456789abcdef"),
        ])
        .unwrap();
        assert!(legacy.secrets.unwrap().server_secret.is_some());
        assert!(!legacy.policy.game_chat_enabled && !legacy.policy.game_voice_enabled);
    }

    #[test]
    fn rejects_bad_values_and_names_the_variable() {
        let var = |vars: &[(&str, &str)]| config(vars).unwrap_err().variable;
        assert_eq!(var(&[("METALLIC_ROLE", "matchmaker")]), "METALLIC_ROLE");
        assert_eq!(
            var(&[("METALLIC_BIND_ADDR", "nowhere")]),
            "METALLIC_BIND_ADDR"
        );
        assert_eq!(var(&[("METALLIC_ENV", "test")]), "METALLIC_ENV");
        assert_eq!(
            var(&[("METALLIC_REQUEST_TIMEOUT_SECS", "0")]),
            "METALLIC_REQUEST_TIMEOUT_SECS"
        );
        assert_eq!(
            var(&[("METALLIC_CORS_ORIGINS", "*")]),
            "METALLIC_CORS_ORIGINS"
        );
        assert_eq!(
            var(&[
                ("METALLIC_ENV", "prod"),
                ("METALLIC_COOKIE_SECURE", "false")
            ]),
            "METALLIC_COOKIE_SECURE"
        );
        assert_eq!(
            var(&[("METALLIC_HMAC_KEY", "c2hvcnQ=")]),
            "METALLIC_HMAC_KEY"
        );
        assert_eq!(
            var(&[("METALLIC_VERIFY_WINDOW_DAYS", "0")]),
            "METALLIC_VERIFY_WINDOW_DAYS"
        );
    }
}
