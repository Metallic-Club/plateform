//! The economy ledger: idempotency, overdraft protection and the database's own guarantees.

use metallic_platform::economy::{self, NewTransaction, Owner, PostError, Posting};
use serde_json::Value;

use crate::support::TestApp;

fn spend<'a>(key: &'a str) -> NewTransaction<'a> {
    NewTransaction {
        kind: "item_purchase",
        idempotency_key: key,
        initiated_by: None,
        description: "Test spend",
        item_id: None,
        counterparty: None,
    }
}

#[tokio::test]
async fn grants_are_idempotent_and_overdrafts_are_refused() {
    let app = TestApp::new().await;
    let ada = app.user("ledger_ada", "1990-01-01").await;
    let user = ada.user_id();
    let mut conn = app.db.acquire().await.expect("conn");
    let first = economy::grant_credits(
        &mut conn,
        &app.state.ids,
        user,
        300,
        "reward",
        "Reward",
        "test-key-1",
    )
    .await
    .expect("db")
    .expect("posted");
    let again = economy::grant_credits(
        &mut conn,
        &app.state.ids,
        user,
        300,
        "reward",
        "Reward",
        "test-key-1",
    )
    .await
    .expect("db")
    .expect("posted");
    assert!(again.replayed);
    assert_eq!(first.transaction_id, again.transaction_id);
    let legs = |amount: i64| {
        [
            Posting {
                owner: Owner::User(user),
                bucket: "available",
                amount: -amount,
            },
            Posting {
                owner: Owner::Platform,
                bucket: "revenue",
                amount,
            },
        ]
    };
    let r = economy::post(&mut conn, &app.state.ids, &spend("test-key-2"), &legs(500))
        .await
        .expect("db");
    assert_eq!(r, Err(PostError::InsufficientFunds));
    let r = economy::post(&mut conn, &app.state.ids, &spend("test-key-1"), &legs(10))
        .await
        .expect("db");
    assert_eq!(
        r,
        Err(PostError::KeyReused),
        "a key belongs to one kind of transaction"
    );
    let r = economy::post(
        &mut conn,
        &app.state.ids,
        &spend("test-key-3"),
        &[Posting {
            owner: Owner::User(user),
            bucket: "available",
            amount: 5,
        }],
    )
    .await;
    assert_eq!(r.expect("db"), Err(PostError::Unbalanced));
    drop(conn);
    let wallet = ada.op("getWallet", &[], Value::Null).await;
    assert_eq!(wallet.body["balances"][0]["available"], 300);
    app.finish().await;
}

#[tokio::test]
async fn concurrent_spends_never_overdraw() {
    let app = TestApp::new().await;
    let ada = app.user("racer_ada", "1990-01-01").await;
    let user = ada.user_id();
    let mut conn = app.db.acquire().await.expect("conn");
    economy::grant_credits(
        &mut conn,
        &app.state.ids,
        user,
        500,
        "reward",
        "Reward",
        "seed-500",
    )
    .await
    .expect("db")
    .expect("posted");
    drop(conn);
    let mut tasks = Vec::new();
    for i in 0..10 {
        let db = app.db.clone();
        let state = app.state.clone();
        tasks.push(tokio::spawn(async move {
            let mut conn = db.acquire().await.expect("conn");
            let key = format!("test-spend-{i}");
            economy::post(
                &mut conn,
                &state.ids,
                &spend(&key),
                &[
                    Posting {
                        owner: Owner::User(user),
                        bucket: "available",
                        amount: -100,
                    },
                    Posting {
                        owner: Owner::Platform,
                        bucket: "revenue",
                        amount: 100,
                    },
                ],
            )
            .await
            .expect("db")
            .is_ok()
        }));
    }
    let mut ok = 0;
    for t in tasks {
        if t.await.expect("task") {
            ok += 1;
        }
    }
    assert_eq!(ok, 5, "exactly the balance worth of spends succeed");
    let wallet = ada.op("getWallet", &[], Value::Null).await;
    assert_eq!(wallet.body["balances"][0]["available"], 0);
    app.finish().await;
}

#[tokio::test]
async fn the_database_refuses_edits_unbalanced_entries_and_direct_balance_writes() {
    let app = TestApp::new().await;
    let ada = app.user("guard_ada", "1990-01-01").await;
    let mut conn = app.db.acquire().await.expect("conn");
    economy::grant_credits(
        &mut conn,
        &app.state.ids,
        ada.user_id(),
        100,
        "reward",
        "Reward",
        "grant-g1-test",
    )
    .await
    .expect("db")
    .expect("posted");
    drop(conn);
    for sql in [
        "UPDATE economy.ledger_entries SET amount = amount * 2",
        "DELETE FROM economy.ledger_entries",
        "UPDATE economy.ledger_transactions SET description = 'changed'",
        "DELETE FROM economy.ledger_transactions",
        "UPDATE economy.balances SET amount = 1000000",
    ] {
        assert!(
            sqlx::query(sql).execute(&app.db).await.is_err(),
            "the database allowed: {sql}"
        );
    }
    // An entry without its balancing leg fails at commit.
    let mut tx = app.db.begin().await.expect("tx");
    let account: i64 = sqlx::query_scalar(
        "SELECT id FROM economy.ledger_accounts WHERE owner_kind = 'user' LIMIT 1",
    )
    .fetch_one(&mut *tx)
    .await
    .expect("account");
    sqlx::query("INSERT INTO economy.ledger_transactions (id, kind, idempotency_key, description) VALUES (42, 'adjustment', 'lonely-key', 'x')")
        .execute(&mut *tx)
        .await
        .expect("txn row");
    sqlx::query("INSERT INTO economy.ledger_entries (transaction_id, account_id, amount) VALUES (42, $1, 50)")
        .bind(account)
        .execute(&mut *tx)
        .await
        .expect("entry row");
    assert!(
        tx.commit().await.is_err(),
        "unbalanced transaction committed"
    );
    let wallet = ada.op("getWallet", &[], Value::Null).await;
    assert_eq!(wallet.body["balances"][0]["available"], 100);
    app.finish().await;
}
