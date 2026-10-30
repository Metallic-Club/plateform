//! Router built from the API contract. Every operation in `api/openapi.yaml` gets a route: a real handler when one
//! exists, otherwise a stub that answers 501 with a problem body. Unknown paths answer 404 problem+json.

use std::{collections::BTreeMap, time::Duration};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{MethodFilter, MethodRouter},
};
use serde::Serialize;

use crate::{
    AppState, catalog,
    contract::OPERATIONS,
    economy, games,
    identity::{account, oauth},
    matchmaker::{self, internal},
    problem::Problem,
    social, users,
};

/// Operation ids that have a real handler. The contract test checks every other operation answers 501.
pub const IMPLEMENTED: &[&str] = &[
    "getHealth",
    // auth
    "signUp",
    "checkUsername",
    "logIn",
    "logOut",
    "getSession",
    "verifyEmail",
    "resendVerificationEmail",
    "startDeviceAuthorization",
    "approveDeviceAuthorization",
    "exchangeToken",
    "revokeToken",
    // users
    "getMe",
    "updateMe",
    "getSettings",
    "updateSettings",
    "replaceSocialLinks",
    "getUser",
    "getUserByUsername",
    "searchUsers",
    // friends
    "listFriends",
    "listFriendRequests",
    "sendFriendRequest",
    "acceptFriendRequest",
    "deleteFriendRequest",
    "removeFriend",
    "listBlocks",
    "blockUser",
    "unblockUser",
    "getPresence",
    // games
    "getHome",
    "listGenres",
    "listGames",
    "searchGames",
    "getGame",
    "listSimilarGames",
    "getRating",
    "setRating",
    "clearRating",
    "getLiveCounts",
    "getPlatformLive",
    // servers
    "listRegions",
    "listServers",
    "createJoinTicket",
    "connectJoinTicket",
    // library
    "listFavorites",
    "addFavorite",
    "removeFavorite",
    "listPlayHistory",
    "removePlayHistoryEntry",
    // catalog
    "listCatalogItems",
    "getCatalogItem",
    "listInventory",
    "getMyAvatar",
    "setMyAvatar",
    "getUserAvatar",
    // wallet
    "getWallet",
    "listWalletTransactions",
    // internal (game servers)
    "registerGameServer",
    "heartbeatGameServer",
    "stopGameServer",
    "redeemJoinTicket",
];

fn route(
    entry: MethodRouter<AppState>,
    filter: MethodFilter,
    id: &'static str,
) -> MethodRouter<AppState> {
    match id {
        "getHealth" => entry.on(filter, get_health),
        "signUp" => entry.on(filter, account::sign_up),
        "checkUsername" => entry.on(filter, account::check_username),
        "logIn" => entry.on(filter, account::log_in),
        "logOut" => entry.on(filter, account::log_out),
        "getSession" => entry.on(filter, account::get_session),
        "verifyEmail" => entry.on(filter, account::verify_email),
        "resendVerificationEmail" => entry.on(filter, account::resend_verification),
        "startDeviceAuthorization" => entry.on(filter, oauth::start_device),
        "approveDeviceAuthorization" => entry.on(filter, oauth::approve_device),
        "exchangeToken" => entry.on(filter, oauth::token),
        "revokeToken" => entry.on(filter, oauth::revoke),
        "getMe" => entry.on(filter, users::get_me),
        "updateMe" => entry.on(filter, users::update_me),
        "getSettings" => entry.on(filter, users::get_settings),
        "updateSettings" => entry.on(filter, users::update_settings),
        "replaceSocialLinks" => entry.on(filter, users::replace_links),
        "getUser" => entry.on(filter, users::get_user),
        "getUserByUsername" => entry.on(filter, users::get_user_by_username),
        "searchUsers" => entry.on(filter, users::search_users),
        "listFriends" => entry.on(filter, social::api::list_friends),
        "listFriendRequests" => entry.on(filter, social::api::list_requests),
        "sendFriendRequest" => entry.on(filter, social::api::send_request),
        "acceptFriendRequest" => entry.on(filter, social::api::accept_request),
        "deleteFriendRequest" => entry.on(filter, social::api::delete_request),
        "removeFriend" => entry.on(filter, social::api::remove_friend),
        "listBlocks" => entry.on(filter, social::api::list_blocks),
        "blockUser" => entry.on(filter, social::api::block_user),
        "unblockUser" => entry.on(filter, social::api::unblock_user),
        "getPresence" => entry.on(filter, social::api::get_presence),
        "getHome" => entry.on(filter, games::api::get_home),
        "listGenres" => entry.on(filter, games::api::list_genres),
        "listGames" => entry.on(filter, games::api::list_games),
        "searchGames" => entry.on(filter, games::api::search_games),
        "getGame" => entry.on(filter, games::api::get_game),
        "listSimilarGames" => entry.on(filter, games::api::list_similar),
        "getRating" => entry.on(filter, games::api::get_rating),
        "setRating" => entry.on(filter, games::api::set_rating),
        "clearRating" => entry.on(filter, games::api::clear_rating),
        "getLiveCounts" => entry.on(filter, matchmaker::get_live_counts),
        "getPlatformLive" => entry.on(filter, matchmaker::get_platform_live),
        "listRegions" => entry.on(filter, matchmaker::list_regions),
        "listServers" => entry.on(filter, matchmaker::list_servers),
        "createJoinTicket" => entry.on(filter, matchmaker::create_join_ticket),
        "connectJoinTicket" => entry.on(filter, matchmaker::connection::connect_join_ticket),
        "listFavorites" => entry.on(filter, games::library::list_favorites),
        "addFavorite" => entry.on(filter, games::library::add_favorite),
        "removeFavorite" => entry.on(filter, games::library::remove_favorite),
        "listPlayHistory" => entry.on(filter, games::library::list_history),
        "removePlayHistoryEntry" => entry.on(filter, games::library::remove_history),
        "listCatalogItems" => entry.on(filter, catalog::list_items),
        "getCatalogItem" => entry.on(filter, catalog::get_item),
        "listInventory" => entry.on(filter, catalog::list_inventory),
        "getMyAvatar" => entry.on(filter, catalog::get_my_avatar),
        "setMyAvatar" => entry.on(filter, catalog::set_my_avatar),
        "getUserAvatar" => entry.on(filter, catalog::get_user_avatar),
        "getWallet" => entry.on(filter, economy::get_wallet),
        "listWalletTransactions" => entry.on(filter, economy::list_transactions),
        "registerGameServer" => entry.on(filter, internal::register),
        "heartbeatGameServer" => entry.on(filter, internal::heartbeat),
        "stopGameServer" => entry.on(filter, internal::stop),
        "redeemJoinTicket" => entry.on(filter, internal::redeem),
        _ => entry.on(filter, move || async move { Problem::not_implemented(id) }),
    }
}

pub fn router(state: AppState) -> Router {
    let mut by_path: BTreeMap<&'static str, MethodRouter<AppState>> = BTreeMap::new();
    for op in OPERATIONS {
        let filter = method_filter(op.method);
        let entry = by_path.remove(op.path).unwrap_or_default();
        by_path.insert(op.path, route(entry, filter, op.operation_id));
    }

    by_path
        .into_iter()
        .fold(Router::new(), |router, (path, methods)| {
            router.route(path, methods)
        })
        .fallback(|| async { Problem::not_found() })
        .with_state(state)
}

fn method_filter(method: &str) -> MethodFilter {
    match method {
        "GET" => MethodFilter::GET,
        "PUT" => MethodFilter::PUT,
        "POST" => MethodFilter::POST,
        "DELETE" => MethodFilter::DELETE,
        "PATCH" => MethodFilter::PATCH,
        other => unreachable!("build.rs only emits known methods, got {other}"),
    }
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    checks: BTreeMap<&'static str, &'static str>,
}

/// `getHealth`: 503 when the database does not answer within two seconds. The cache is not used yet (`skipped`).
async fn get_health(State(state): State<AppState>) -> Response {
    let db_ok = tokio::time::timeout(
        Duration::from_secs(2),
        sqlx::query("SELECT 1").execute(&state.db),
    )
    .await
    .is_ok_and(|r| r.is_ok());
    let checks = BTreeMap::from([
        ("database", if db_ok { "ok" } else { "down" }),
        ("cache", "skipped"),
    ]);
    let (status, code) = if db_ok {
        ("ok", StatusCode::OK)
    } else {
        ("degraded", StatusCode::SERVICE_UNAVAILABLE)
    };
    let mut response = (
        code,
        Json(Health {
            status,
            version: state.version,
            checks,
        }),
    )
        .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}
