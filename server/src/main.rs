use std::process::ExitCode;

use metallic_platform::{
    AppState, app,
    config::{Config, Environment, Role},
};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(e) => {
            eprintln!("configuration error: {e}");
            return ExitCode::FAILURE;
        }
    };
    init_tracing(&config);

    let result = match config.role {
        Role::Api => run_api(&config).await,
        Role::Worker => {
            tracing::info!("worker role started; no jobs are defined yet");
            shutdown_signal().await;
            Ok(())
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "server stopped with an error");
            ExitCode::FAILURE
        }
    }
}

async fn run_api(config: &Config) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind(config.bind_addr).await?;
    tracing::info!(addr = %listener.local_addr()?, "api listening");
    axum::serve(listener, app(AppState::default(), config.request_timeout))
        .with_graceful_shutdown(shutdown_signal())
        .await
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
