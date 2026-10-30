use std::{net::SocketAddr, process::ExitCode, sync::Arc, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD};
use metallic_platform::{
    AppState, app,
    config::{Config, Environment, Role},
    crypto,
    ids::{IdGenerator, parse_id},
    jobs,
    matchmaker::{
        hosts,
        ticket::{self, KeyStatus},
    },
    seed,
    services::{AcceptingCaptcha, CaptchaVerifier, DevMailer, Mailer},
};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tracing_subscriber::EnvFilter;

const USAGE: &str = "usage: metallic-platform [serve | migrate | seed | keygen | ticket-key ... | host ... | server ...]
  serve    run the role from METALLIC_ROLE (default)
  migrate  apply database migrations and exit
  seed     load fictitious demo data (not in prod); password from METALLIC_SEED_PASSWORD or printed once
  keygen   print fresh values for METALLIC_HMAC_KEY, METALLIC_DATA_KEY and METALLIC_TICKET_KEYS
  ticket-key new --kid KID [--status active|next] [--not-before RFC3339]
           print one new join-ticket key entry (private seed included, shown once; see docs/m2-join-tickets.md)
  host add --name NAME --region REGION [--max-servers 8] [--max-players 500]
           create a host; its mht_ token is printed once and stored only as a hash
  host list
  host drain|disable|enable --name NAME
  host rotate-token --name NAME   ask the agent to rotate its token on its next heartbeat
  host reset-token --name NAME    replace a lost or leaked token now (printed once)
  server drain|stop SERVER_ID     orders for one server, delivered on its host's next heartbeat";

/// Snowflake worker id for admin commands, kept apart from API processes (configure those below 1023).
const ADMIN_WORKER_ID: u16 = 1023;

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().cloned().unwrap_or_else(|| "serve".to_owned());
    match command.as_str() {
        "keygen" => {
            println!(
                "METALLIC_HMAC_KEY={}",
                STANDARD.encode(crypto::random_bytes::<32>())
            );
            println!(
                "METALLIC_DATA_KEY={}",
                STANDARD.encode(crypto::random_bytes::<32>())
            );
            let kid = format!("k{}", time::OffsetDateTime::now_utc().unix_timestamp());
            match ticket::new_key_entry(&kid, KeyStatus::Active, None) {
                Ok(entry) => {
                    let set = serde_json::json!({ "keys": [entry] });
                    println!("METALLIC_TICKET_KEYS={}", STANDARD.encode(set.to_string()));
                }
                Err(e) => {
                    eprintln!("{e}");
                    return ExitCode::FAILURE;
                }
            }
            println!("# Deprecated, only with METALLIC_LEGACY_SERVER_SECRET=true:");
            println!("# METALLIC_SERVER_SECRET={}", crypto::new_token(""));
            return ExitCode::SUCCESS;
        }
        "ticket-key" => return ticket_key(&args[1..]),
        "serve" | "migrate" | "seed" | "host" | "server" => {}
        _ => {
            eprintln!("{USAGE}");
            return ExitCode::FAILURE;
        }
    }
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(e) => {
            eprintln!("configuration error: {e}");
            return ExitCode::FAILURE;
        }
    };
    init_tracing(&config);
    match run(&command, &args[1..], config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "stopped with an error");
            ExitCode::FAILURE
        }
    }
}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// `--name value` from an argument list.
fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|w| w[0] == name)
        .map(|w| w[1].as_str())
}

fn ticket_key(args: &[String]) -> ExitCode {
    if args.first().map(String::as_str) != Some("new") {
        eprintln!("{USAGE}");
        return ExitCode::FAILURE;
    }
    let Some(kid) = flag(args, "--kid") else {
        eprintln!("--kid is required");
        return ExitCode::FAILURE;
    };
    let status = match flag(args, "--status").unwrap_or("next") {
        "next" => KeyStatus::Next,
        "active" => KeyStatus::Active,
        _ => {
            eprintln!("--status must be active or next");
            return ExitCode::FAILURE;
        }
    };
    let not_before = match flag(args, "--not-before")
        .map(|t| time::OffsetDateTime::parse(t, &time::format_description::well_known::Rfc3339))
    {
        None => None,
        Some(Ok(t)) => Some(t),
        Some(Err(_)) => {
            eprintln!("--not-before must be an RFC 3339 time");
            return ExitCode::FAILURE;
        }
    };
    match ticket::new_key_entry(kid, status, not_before) {
        Ok(entry) => {
            match serde_json::to_string_pretty(&entry) {
                Ok(text) => println!("{text}"),
                Err(_) => return ExitCode::FAILURE,
            }
            eprintln!("The \"d\" value is a private key: store it as a secret, never commit it.");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

/// `host ...` and `server ...`: admin commands on the database. Tokens are printed to stdout once, never logged.
async fn admin(db: &PgPool, command: &str, args: &[String]) -> Result<(), BoxError> {
    let sub = args.first().map(String::as_str).unwrap_or_default();
    let name = || flag(args, "--name").ok_or("--name is required");
    match (command, sub) {
        ("host", "add") => {
            let region = flag(args, "--region").ok_or("--region is required")?;
            let max_servers = flag(args, "--max-servers").unwrap_or("8").parse()?;
            let max_players = flag(args, "--max-players").unwrap_or("500").parse()?;
            let ids = IdGenerator::new(ADMIN_WORKER_ID);
            let (id, token) =
                hosts::add_host(db, &ids, name()?, region, max_servers, max_players).await?;
            println!("host id: {id}");
            println!("host token (shown once; give it to the host agent as a secret): {token}");
        }
        ("host", "list") => {
            for h in hosts::list_hosts(db).await? {
                println!("{}", h.line());
            }
        }
        ("host", "drain") => hosts::set_host_status(db, name()?, "draining").await?,
        ("host", "disable") => hosts::set_host_status(db, name()?, "disabled").await?,
        ("host", "enable") => hosts::set_host_status(db, name()?, "active").await?,
        ("host", "rotate-token") => hosts::request_rotation(db, name()?).await?,
        ("host", "reset-token") => {
            let token = hosts::reset_token(db, name()?).await?;
            println!("new host token (shown once; the old one no longer works): {token}");
        }
        ("server", "drain" | "stop") => {
            let id = args
                .get(1)
                .and_then(|s| parse_id(s))
                .ok_or("give a server id")?;
            hosts::set_server_desired(db, id, sub).await?;
        }
        _ => return Err(USAGE.into()),
    }
    Ok(())
}

async fn run(command: &str, args: &[String], config: Config) -> Result<(), BoxError> {
    let db = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(config.require_database_url()?)
        .await?;
    if command == "migrate" || config.migrate_on_start {
        sqlx::migrate!("./migrations").run(&db).await?;
        tracing::info!("migrations applied");
        if command == "migrate" {
            return Ok(());
        }
    }
    if command == "host" || command == "server" {
        return admin(&db, command, args).await;
    }
    let secrets = config.require_secrets()?.clone();
    if secrets.ticket_keys.is_ephemeral() {
        tracing::warn!(
            "USING A RANDOM JOIN-TICKET KEY (dev only): tickets stop verifying on restart and no edge can have this \
             key ahead of time. Set METALLIC_TICKET_KEYS_FILE or METALLIC_TICKET_KEYS."
        );
        eprintln!("WARNING: random dev join-ticket key in use (see docs/m2-join-tickets.md)");
    }
    if secrets.server_secret.is_some() {
        tracing::warn!(
            "METALLIC_LEGACY_SERVER_SECRET is on: the deprecated shared game-server secret is accepted"
        );
    }
    let dev = config.environment == Environment::Dev;
    // Real mail and captcha providers arrive with deployment; until then only dev may run (no address or link is logged).
    if !dev {
        return Err(
            "no production mailer or captcha provider is configured yet; run with METALLIC_ENV=dev"
                .into(),
        );
    }
    let mailer: Arc<dyn Mailer> = Arc::new(DevMailer {
        dir: config.dev_mail_dir.as_ref().map(Into::into),
    });
    let captcha: Arc<dyn CaptchaVerifier> = Arc::new(AcceptingCaptcha);
    let state = AppState::new(db, config, secrets, mailer, captcha);

    if command == "seed" {
        let password = match std::env::var("METALLIC_SEED_PASSWORD") {
            Ok(p) if p.len() >= 10 => p,
            _ => {
                let p = crypto::new_token("demo-");
                // Printed once to the terminal (not the log) so the developer can sign in.
                println!("Demo account password (shown once): {p}");
                p
            }
        };
        seed::run(&state, &password)
            .await
            .map_err(|p| format!("seed failed: {}", p.code))?;
        tracing::info!("demo data loaded");
        return Ok(());
    }

    let job_task = (state.config.role == Role::Worker || state.config.run_jobs)
        .then(|| tokio::spawn(jobs::run_forever(state.clone())));
    let result = match state.config.role {
        Role::Api => serve(state.clone()).await,
        Role::Worker => {
            tracing::info!("worker role started");
            shutdown_signal().await;
            Ok(())
        }
    };
    if let Some(task) = job_task {
        task.abort();
    }
    result
}

async fn serve(state: AppState) -> Result<(), BoxError> {
    let listener = tokio::net::TcpListener::bind(state.config.bind_addr).await?;
    tracing::info!(addr = %listener.local_addr()?, "api listening");
    axum::serve(
        listener,
        app(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;
    Ok(())
}

fn init_tracing(config: &Config) {
    let filter = EnvFilter::try_new(&config.log_filter).unwrap_or_else(|_| EnvFilter::new("info"));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    if config.environment == Environment::Prod {
        builder.json().init();
    } else {
        builder.init();
    }
}

async fn shutdown_signal() {
    if let Err(e) = tokio::signal::ctrl_c().await {
        tracing::error!(error = %e, "cannot listen for shutdown signal");
    }
    tracing::info!("shutting down");
}
