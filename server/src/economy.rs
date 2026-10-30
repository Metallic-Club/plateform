//! economy: the double-entry, append-only currency ledger (spec 9.5) and wallet reads.
//!
//! Every movement of credits or items goes through [`post`] or [`grant_item`] with an idempotency key; a retry with
//! the same key returns the first result instead of moving anything twice. The database enforces append-only rows,
//! zero-sum transactions and trigger-maintained balances (see the catalog/economy migration).

use std::collections::HashMap;

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, PgConnection};
use time::OffsetDateTime;

use crate::{
    AppState,
    http::{ApiQuery, Cursor, Page, rfc3339},
    identity::{UserSummary, auth::Viewer},
    matchmaker::PageBody,
    problem::{ApiResult, Problem},
};

pub const CURRENCY: &str = "credits";

/// Who owns a ledger account.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    User(i64),
    /// The mint and burn account (credits enter and leave the economy here).
    System,
    /// Metallic's revenue.
    Platform,
}

impl Owner {
    fn parts(self) -> (&'static str, i64) {
        match self {
            Self::User(id) => ("user", id),
            Self::System => ("system", 0),
            Self::Platform => ("platform", 0),
        }
    }
}

/// One leg of a transaction.
#[derive(Debug, Clone, Copy)]
pub struct Posting {
    pub owner: Owner,
    pub bucket: &'static str,
    pub amount: i64,
}

/// What the ledger records about a transaction.
#[derive(Debug, Clone)]
pub struct NewTransaction<'a> {
    pub kind: &'static str,
    pub idempotency_key: &'a str,
    pub initiated_by: Option<i64>,
    pub description: &'a str,
    pub item_id: Option<i64>,
    pub counterparty: Option<i64>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PostError {
    /// A user's spendable balance would go below zero.
    InsufficientFunds,
    /// The key was used before for a different kind of transaction.
    KeyReused,
    /// Postings do not sum to zero or are empty.
    Unbalanced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Posted {
    pub transaction_id: i64,
    /// True when the key was seen before and nothing moved this time.
    pub replayed: bool,
}

async fn account_id(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    owner: Owner,
    bucket: &str,
) -> Result<i64, sqlx::Error> {
    let (kind, id) = owner.parts();
    sqlx::query(
        "INSERT INTO economy.ledger_accounts (id, owner_kind, owner_id, currency, bucket) VALUES ($1, $2, $3, $4, $5) \
         ON CONFLICT (owner_kind, owner_id, currency, bucket) DO NOTHING",
    )
    .bind(ids.next())
    .bind(kind)
    .bind(id)
    .bind(CURRENCY)
    .bind(bucket)
    .execute(&mut *conn)
    .await?;
    sqlx::query_scalar(
        "SELECT id FROM economy.ledger_accounts WHERE owner_kind = $1 AND owner_id = $2 AND currency = $3 AND bucket = $4",
    )
    .bind(kind)
    .bind(id)
    .bind(CURRENCY)
    .bind(bucket)
    .fetch_one(&mut *conn)
    .await
}

/// Records a balanced transaction. Runs in its own database transaction (a savepoint when the caller already has
/// one), so the deferred zero-sum check always sees the whole transaction, and a refusal leaves nothing behind.
pub async fn post(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    tx: &NewTransaction<'_>,
    postings: &[Posting],
) -> Result<Result<Posted, PostError>, sqlx::Error> {
    let mut db_tx = conn.begin().await?;
    let result = post_in(&mut db_tx, ids, tx, postings).await?;
    if result.is_ok() {
        db_tx.commit().await?;
    }
    Ok(result)
}

async fn post_in(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    tx: &NewTransaction<'_>,
    postings: &[Posting],
) -> Result<Result<Posted, PostError>, sqlx::Error> {
    if postings.is_empty()
        || postings.iter().map(|p| p.amount).sum::<i64>() != 0
        || postings.iter().any(|p| p.amount == 0)
    {
        return Ok(Err(PostError::Unbalanced));
    }
    if let Some(existing) = replay(conn, tx).await? {
        return Ok(existing);
    }
    // Lock affected balances in a fixed order so concurrent transfers cannot deadlock or overspend.
    let mut legs = Vec::with_capacity(postings.len());
    for p in postings {
        legs.push((account_id(conn, ids, p.owner, p.bucket).await?, *p));
    }
    let mut account_ids: Vec<i64> = legs.iter().map(|l| l.0).collect();
    account_ids.sort_unstable();
    account_ids.dedup();
    let rows: Vec<(i64, i64)> = sqlx::query_as("SELECT account_id, amount FROM economy.balances WHERE account_id = ANY($1) ORDER BY account_id FOR UPDATE")
        .bind(&account_ids)
        .fetch_all(&mut *conn)
        .await?;
    let balances: HashMap<i64, i64> = rows.into_iter().collect();
    let mut change: HashMap<i64, i64> = HashMap::new();
    for (acct, p) in &legs {
        *change.entry(*acct).or_default() += p.amount;
    }
    for (acct, p) in &legs {
        if matches!(p.owner, Owner::User(_))
            && change[acct] < 0
            && balances.get(acct).copied().unwrap_or(0) + change[acct] < 0
        {
            return Ok(Err(PostError::InsufficientFunds));
        }
    }
    let id = ids.next();
    let inserted = sqlx::query(
        "INSERT INTO economy.ledger_transactions (id, kind, idempotency_key, initiated_by, description, item_id, counterparty_user_id) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(id)
    .bind(tx.kind)
    .bind(tx.idempotency_key)
    .bind(tx.initiated_by)
    .bind(tx.description)
    .bind(tx.item_id)
    .bind(tx.counterparty)
    .execute(&mut *conn)
    .await?;
    if inserted.rows_affected() == 0 {
        // A concurrent request with the same key won the race.
        return Ok(replay(conn, tx).await?.unwrap_or(Err(PostError::KeyReused)));
    }
    for (acct, p) in &legs {
        sqlx::query("INSERT INTO economy.ledger_entries (transaction_id, account_id, amount) VALUES ($1, $2, $3)")
            .bind(id)
            .bind(acct)
            .bind(p.amount)
            .execute(&mut *conn)
            .await?;
    }
    Ok(Ok(Posted {
        transaction_id: id,
        replayed: false,
    }))
}

async fn replay(
    conn: &mut PgConnection,
    tx: &NewTransaction<'_>,
) -> Result<Option<Result<Posted, PostError>>, sqlx::Error> {
    let existing: Option<(i64, String)> = sqlx::query_as(
        "SELECT id, kind FROM economy.ledger_transactions WHERE idempotency_key = $1",
    )
    .bind(tx.idempotency_key)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(existing.map(|(id, kind)| {
        if kind == tx.kind {
            Ok(Posted {
                transaction_id: id,
                replayed: true,
            })
        } else {
            Err(PostError::KeyReused)
        }
    }))
}

/// Mints free credits to a user (rewards, promotions, seed data). Idempotent per key.
pub async fn grant_credits(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    user: i64,
    amount: i64,
    kind: &'static str,
    description: &str,
    idempotency_key: &str,
) -> Result<Result<Posted, PostError>, sqlx::Error> {
    post(
        conn,
        ids,
        &NewTransaction {
            kind,
            idempotency_key,
            initiated_by: None,
            description,
            item_id: None,
            counterparty: None,
        },
        &[
            Posting {
                owner: Owner::System,
                bucket: "mint",
                amount: -amount,
            },
            Posting {
                owner: Owner::User(user),
                bucket: "available",
                amount,
            },
        ],
    )
    .await
}

/// Gives a user one copy of a catalog item, recorded in the ledger with an idempotency key (no credits move).
/// Returns the inventory id (the existing one on replay).
pub async fn grant_item(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    user: i64,
    item: i64,
    source: &'static str,
    idempotency_key: &str,
) -> Result<i64, sqlx::Error> {
    let mut db_tx = conn.begin().await?;
    let id = grant_item_in(&mut db_tx, ids, user, item, source, idempotency_key).await?;
    db_tx.commit().await?;
    Ok(id)
}

async fn grant_item_in(
    conn: &mut PgConnection,
    ids: &crate::ids::IdGenerator,
    user: i64,
    item: i64,
    source: &'static str,
    idempotency_key: &str,
) -> Result<i64, sqlx::Error> {
    let tx_id = ids.next();
    let inserted = sqlx::query(
        "INSERT INTO economy.ledger_transactions (id, kind, idempotency_key, initiated_by, reference_kind, reference_id, description, item_id) \
         VALUES ($1, 'item_grant', $2, NULL, 'inventory', $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING",
    )
    .bind(tx_id)
    .bind(idempotency_key)
    .bind(tx_id)
    .bind(source)
    .bind(item)
    .execute(&mut *conn)
    .await?;
    if inserted.rows_affected() == 0 {
        let existing: i64 = sqlx::query_scalar(
            "SELECT reference_id FROM economy.ledger_transactions WHERE idempotency_key = $1",
        )
        .bind(idempotency_key)
        .fetch_one(&mut *conn)
        .await?;
        return Ok(existing);
    }
    crate::catalog::insert_inventory(conn, tx_id, user, item, source).await?;
    Ok(tx_id)
}

/// Account deletion: the ledger is append-only and stays; owned items are removed.
pub async fn purge_user(conn: &mut PgConnection, user: i64) -> ApiResult<()> {
    crate::catalog::purge_user(conn, user).await
}

#[derive(Serialize)]
pub struct Balance {
    currency: &'static str,
    available: i64,
    giftable: i64,
    pending: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    balances: Vec<Balance>,
    updated_at: String,
}

/// `getWallet`. `available` = spendable (available + giftable_hold buckets); `giftable` = the available bucket;
/// `pending` = escrow.
pub async fn get_wallet(State(state): State<AppState>, viewer: Viewer) -> ApiResult<Json<Wallet>> {
    let rows: Vec<(String, i64, OffsetDateTime)> = sqlx::query_as(
        "SELECT a.bucket, b.amount, b.updated_at FROM economy.ledger_accounts a JOIN economy.balances b ON b.account_id = a.id \
         WHERE a.owner_kind = 'user' AND a.owner_id = $1 AND a.currency = $2",
    )
    .bind(viewer.user_id)
    .bind(CURRENCY)
    .fetch_all(&state.db)
    .await?;
    let get = |b: &str| rows.iter().filter(|r| r.0 == b).map(|r| r.1).sum::<i64>();
    let available = get("available") + get("giftable_hold");
    let updated = rows
        .iter()
        .map(|r| r.2)
        .max()
        .unwrap_or_else(OffsetDateTime::now_utc);
    Ok(Json(Wallet {
        balances: vec![Balance {
            currency: CURRENCY,
            available,
            giftable: get("available").max(0),
            pending: get("escrow").max(0),
        }],
        updated_at: rfc3339(updated),
    }))
}

#[derive(Deserialize)]
pub struct TxQuery {
    #[serde(rename = "type")]
    kind: Option<String>,
    limit: Option<String>,
    cursor: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionBody {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    currency: &'static str,
    amount: i64,
    status: &'static str,
    description: String,
    item_id: Option<String>,
    counterparty: Option<UserSummary>,
    created_at: String,
}

const PUBLIC_KINDS: [&str; 11] = [
    "purchase",
    "reward",
    "item_purchase",
    "item_sale",
    "gift_sent",
    "gift_received",
    "game_purchase",
    "game_earning",
    "refund",
    "reversal",
    "adjustment",
];

/// `listWalletTransactions`: the user's net change per transaction, newest first. Internal moves between the user's
/// own buckets (hold releases) and item grants are not listed.
pub async fn list_transactions(
    State(state): State<AppState>,
    viewer: Viewer,
    ApiQuery(q): ApiQuery<TxQuery>,
) -> ApiResult<Json<PageBody<TransactionBody>>> {
    let page = Page::parse(q.limit.as_deref(), q.cursor.as_deref())?;
    let after = page.key()?;
    let kind = q.kind.filter(|k| !k.is_empty());
    if kind.as_deref().is_some_and(|k| !PUBLIC_KINDS.contains(&k)) {
        return Err(Problem::invalid(
            "type",
            "invalid",
            "Unknown transaction type.",
        ));
    }
    let kinds: Vec<String> = match kind {
        Some(k) => vec![k],
        None => PUBLIC_KINDS.iter().map(|s| (*s).to_owned()).collect(),
    };
    #[allow(clippy::type_complexity)]
    let mut rows: Vec<(i64, String, i64, String, Option<i64>, Option<i64>, OffsetDateTime)> = sqlx::query_as(
        "SELECT t.id, t.kind, sum(e.amount)::bigint, t.description, t.item_id, t.counterparty_user_id, t.created_at \
         FROM economy.ledger_transactions t \
         JOIN economy.ledger_entries e ON e.transaction_id = t.id \
         JOIN economy.ledger_accounts a ON a.id = e.account_id \
         WHERE a.owner_kind = 'user' AND a.owner_id = $1 AND t.kind = ANY($2) \
           AND ($3::timestamptz IS NULL OR (t.created_at, t.id) < ($3, $4)) \
         GROUP BY t.id HAVING sum(e.amount) <> 0 \
         ORDER BY t.created_at DESC, t.id DESC LIMIT $5",
    )
    .bind(viewer.user_id)
    .bind(&kinds)
    .bind(after.map(|a| a.0))
    .bind(after.map(|a| a.1).unwrap_or(0))
    .bind(page.limit + 1)
    .fetch_all(&state.db)
    .await?;
    let next_cursor = if rows.len() as i64 > page.limit {
        rows.truncate(page.limit as usize);
        rows.last().map(|r| Cursor::key_for(r.6, r.0).encode())
    } else {
        None
    };
    let others: Vec<i64> = rows.iter().filter_map(|r| r.5).collect();
    let people = crate::identity::basics(&state.db, &others).await?;
    let items = rows
        .into_iter()
        .map(
            |(id, kind, amount, description, item_id, counterparty, created_at)| TransactionBody {
                id: id.to_string(),
                kind,
                currency: CURRENCY,
                amount,
                status: "settled",
                description,
                item_id: item_id.map(|i| i.to_string()),
                counterparty: counterparty
                    .and_then(|c| people.get(&c))
                    .map(|u| u.summary()),
                created_at: rfc3339(created_at),
            },
        )
        .collect();
    Ok(Json(PageBody { items, next_cursor }))
}
