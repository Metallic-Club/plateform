//! Configuration from environment variables. Names and defaults are listed in `server/.env.example`.
//! Nothing here has a secret default; secrets (when they arrive) must be set or startup fails.

use std::{fmt, net::SocketAddr, time::Duration};

/// Which job this process does. One binary, several roles (design spec D3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Public HTTP API.
    Api,
    /// Background jobs (no jobs yet; idles until shutdown).
    Worker,
}

/// Deployment environment. Only changes behaviour that is safe to change (log format).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Dev,
    Staging,
    Prod,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub role: Role,
    pub environment: Environment,
    pub log_filter: String,
    pub request_timeout: Duration,
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
        let bind_addr = parse(
            "METALLIC_BIND_ADDR",
            lookup("METALLIC_BIND_ADDR"),
            "127.0.0.1:8080",
            |v| v.parse::<SocketAddr>().map_err(|e| e.to_string()),
        )?;
        let role = parse(
            "METALLIC_ROLE",
            lookup("METALLIC_ROLE"),
            "api",
            |v| match v {
                "api" => Ok(Role::Api),
                "worker" => Ok(Role::Worker),
                other => Err(format!("unknown role `{other}` (expected api or worker)")),
            },
        )?;
        let environment = parse("METALLIC_ENV", lookup("METALLIC_ENV"), "dev", |v| match v {
            "dev" => Ok(Environment::Dev),
            "staging" => Ok(Environment::Staging),
            "prod" => Ok(Environment::Prod),
            other => Err(format!(
                "unknown environment `{other}` (expected dev, staging or prod)"
            )),
        })?;
        let log_filter = lookup("METALLIC_LOG").unwrap_or_else(|| "info".to_owned());
        let request_timeout = parse(
            "METALLIC_REQUEST_TIMEOUT_SECS",
            lookup("METALLIC_REQUEST_TIMEOUT_SECS"),
            "10",
            |v| match v.parse::<u64>() {
                Ok(0) => Err("must be at least 1".to_owned()),
                Ok(secs) if secs > 300 => Err("must be at most 300".to_owned()),
                Ok(secs) => Ok(Duration::from_secs(secs)),
                Err(e) => Err(e.to_string()),
            },
        )?;

        Ok(Self {
            bind_addr,
            role,
            environment,
            log_filter,
            request_timeout,
        })
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

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(vars: &[(&str, &str)]) -> Result<Config, ConfigError> {
        let map: HashMap<String, String> = vars
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        Config::from_lookup(|name| map.get(name).cloned())
    }

    #[test]
    fn defaults_are_local_and_safe() {
        let c = config(&[]).expect("defaults parse");
        assert_eq!(c.bind_addr.to_string(), "127.0.0.1:8080");
        assert_eq!(c.role, Role::Api);
        assert_eq!(c.environment, Environment::Dev);
        assert_eq!(c.request_timeout, Duration::from_secs(10));
    }

    #[test]
    fn reads_every_variable() {
        let c = config(&[
            ("METALLIC_BIND_ADDR", "0.0.0.0:9000"),
            ("METALLIC_ROLE", "worker"),
            ("METALLIC_ENV", "prod"),
            ("METALLIC_LOG", "debug"),
            ("METALLIC_REQUEST_TIMEOUT_SECS", "30"),
        ])
        .expect("valid config");
        assert_eq!(c.bind_addr.port(), 9000);
        assert_eq!(c.role, Role::Worker);
        assert_eq!(c.environment, Environment::Prod);
        assert_eq!(c.log_filter, "debug");
        assert_eq!(c.request_timeout, Duration::from_secs(30));
    }

    #[test]
    fn rejects_bad_values_and_names_the_variable() {
        assert_eq!(
            config(&[("METALLIC_ROLE", "matchmaker")])
                .unwrap_err()
                .variable,
            "METALLIC_ROLE"
        );
        assert_eq!(
            config(&[("METALLIC_BIND_ADDR", "nowhere")])
                .unwrap_err()
                .variable,
            "METALLIC_BIND_ADDR"
        );
        assert_eq!(
            config(&[("METALLIC_ENV", "test")]).unwrap_err().variable,
            "METALLIC_ENV"
        );
        assert_eq!(
            config(&[("METALLIC_REQUEST_TIMEOUT_SECS", "0")])
                .unwrap_err()
                .variable,
            "METALLIC_REQUEST_TIMEOUT_SECS"
        );
    }
}
