use std::{net::SocketAddr, process::ExitCode, sync::Arc, time::Duration};

use base64::{Engine, engine::general_purpose::STANDARD};
use metallic_platform::{
    AppState, app,
    config::{Config, Environment, Role},
    crypto, jobs, seed,
    services::{AcceptingCaptcha, CaptchaVerifier, DevMailer, Mailer},
};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

const USAGE: &str = "usage: metallic-platform [serve | migrate | seed | keygen]
  serve    run the role from METALLIC_ROLE (default)
  migrate  apply database migrations and exit
  seed     load fictitious demo data (not in prod); password from METALLIC_SEED_PASSWORD or printed once
  keygen   print fresh values for METALLIC_HMAC_KEY, METALLIC_DATA_KEY and METALLIC_SERVER_SECRET";

#[tokio::main]
async fn main() -> ExitCode {
    let command = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "serve".to_owned());
    if command == "keygen" {
        println!(
            "METALLIC_HMAC_KEY={}",
            STANDARD.encode(crypto::random_bytes::<32>())
        );
        println!(
            "METALLIC_DATA_KEY={}",
            STANDARD.encode(crypto::random_bytes::<32>())
        );
        println!("METALLIC_SERVER_SECRET={}", crypto::new_token(""));
        return ExitCode::SUCCESS;
    }
    if !matches!(command.as_str(), "serve" | "migrate" | "seed") {
        eprintln!("{USAGE}");
        return ExitCode::FAILURE;
    }
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(e) => {
            eprintln!("configuration error: {e}");
            return ExitCode::FAILURE;
        }
    };
    init_tracing(&config);
    match run(&command, config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "stopped with an error");
            ExitCode::FAILURE
        }
    }
}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

async fn run(command: &str, config: Config) -> Result<(), BoxError> {
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
    let secrets = config.require_secrets()?.clone();
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
