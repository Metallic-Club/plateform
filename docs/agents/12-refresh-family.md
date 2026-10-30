# Issue 12: concurrent refresh-family revocation

## Goal and base

Prevent concurrent rotation from leaving a usable descendant after replay detection, explicit refresh-token
revocation or native logout. Independent branch `platform/12-refresh-family` uses the established canonical
`origin/platform/p1-backend` at `7b0f69b`; no main branch exists or is created. This is an implementation and audit,
not repository lead acceptance. No handoff, UI, new OAuth flow, age-band or minor-policy change.

## Confirmed evidence

- [Issue 12](https://github.com/Metallic-Club/plateform/issues/12) was filed before production edits, after checking
  open issues and PRs for duplicate work. Current issue 7, AGENTS/CLAUDE, canonical authentication, matchmaking,
  OpenAPI and web-branch handoff code were inspected.
- A bounded exact-SQL probe in a newly created owned database paused a descendant rotation, observed the ancestor
  replay's UPDATE waiting on that row, then allowed an inserted descendant to escape the UPDATE's old snapshot.
  The surviving refresh minted valid access after revocation. All connections closed and only that owned database
  was dropped, without FORCE. No shared or production data was used.
- Three bounded HTTP regressions then failed on the unfixed backend: ancestor replay, explicit refresh-token
  revocation and native logout each allowed a descendant refresh to return 200 instead of invalid_grant / 400.
  A test-only insertion trigger pauses a real request after its parent row lock; pg_blocking_pids proves the
  revoker waits on that request. There are no production hooks or sleep-based lock-order assumptions.
- Sources: [RFC 9700 4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2),
  [RFC 7009 2.1](https://www.rfc-editor.org/rfc/rfc7009.html#section-2.1),
  [PostgreSQL Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED),
  [advisory locks and lock order](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS).

## Threat model and implementation

A caller possessing a stale ancestor refresh, the legitimate current token, or a native sign-out token can race
another rotation in the same sign-in family. After the service reports family revocation, no descendant may mint
valid access again. Other sign-ins and existing scopes/account-state rules must retain their current behavior.

- OpenAPI descriptions first clarify the existing family-level guarantee; routes and wire shapes do not change.
- Refresh reads the immutable family ID without a token row lock, acquires a transaction-scoped family lock, then
  rereads and locks the token and validates family/client/revocation/expiry after waiting. A changed family ID fails
  closed. No production path updates an existing token's family ID.
- A lossless high/low 32-bit split uses PostgreSQL's two-int advisory key space, separate from existing bigint
  favorites locks. Full signed-bit boundaries are covered by a unit test; distinct family IDs have distinct keys.
- Pair issuance takes the same lock, including newly created unpublished device families. Refresh has already
  acquired it, so the repeated transaction lock is reentrant. Lock order is family before refresh-token rows.
- Standalone family revocation opens its own transaction before the lock and both table updates. Refresh replay
  uses a private rows helper inside its existing locked transaction, avoiding nested refresh savepoints. Failures
  roll back the transaction; a fault-injection test checks no partial revocation and lock release.
- Tests also cover concurrent duplicate refresh as replay, simultaneous different families, independent rotation
  while another family is blocked, fresh expiry after a family wait, access-only revocation and wrong-client opacity.

## Explicit overlaps and audit boundaries

- Safe API testing repeats only the reviewed [#8 cleanup prerequisite](https://github.com/Metallic-Club/plateform/issues/8)
  from [PR 11](https://github.com/Metallic-Club/plateform/pull/11): canonical current-PID names only, skip active
  connections, no FORCE and no other-PID/template sweep. Its classifier test is included. Never run the unsafe
  baseline sweep. No manual deletion of earlier test databases.
- The canonical base's tracked [#10 strict-Clippy prerequisite](https://github.com/Metallic-Club/plateform/issues/10)
  is repeated narrowly from PR 11: compact optional Problem detail and Retry-After representations, its measured
  layout/wire regression, private row aliases, and an equivalent repeated-password-character expression. Public
  Rust field types change within the unpublished crate; builder signatures and HTTP JSON/header behavior stay
  unchanged. No lint suppression or unrelated refactoring. Refresh's row helper calls also use normal auto-deref.
- Issue 7's backend web-session handoff is absent, so it is not reported as an implemented security failure. A
  future explicit threat model must address native-scope to full-session conversion, trusted redemption and
  recipient binding/login CSRF. UA and bridge detection remain cosmetic. No handoff code is added here.
- Matchmaker capacity checks observe reported availability; they do not reserve slots. That existing limitation
  requires admission/provisioning design, not an unreviewed policy change in this fix.

## Validation / next

Guarded lane116 cleaned only local workspace artifacts when switching worktrees, preserving third-party caches.
The guard reports the new server source path. Existing local PostgreSQL is used without setup/download or printing
credentials. The existing cluster remains running for other sessions.

- All seven focused HTTP tests passed after the fix; the three race cases failed before it (200 instead of 400).
- Guarded `cargo test --workspace -j 4 -- --test-threads=4`: 34 unit + 36 API tests passed, including the complete
  canonical 61-operation contract walkthrough, the key-boundary unit test and the repeated Problem wire regression.
- `cargo fmt --manifest-path server/Cargo.toml --all -- --check`, `cargo deny --manifest-path server/Cargo.toml check
  licenses`, Redocly OpenAPI lint and `git diff --check`: passed. License warnings are existing unused allowances;
  Redocly retains the existing explicit health-route ignore. Guarded `cargo clippy --workspace --all-targets -j 4
  -- -D warnings` also passed, without lint suppression.
- Logs: `%TEMP%/metallic-platform12-red.log`, `metallic-platform12-green.log`, `metallic-platform12-full.log`,
  `metallic-platform12-clippy.log`. No new dependency, Cargo.lock or migration change.
- No web directory, web generation/build command or CI workflow exists on the canonical base. No visual change.

Independent read-only review found no blocking issue. [PR 13](https://github.com/Metallic-Club/plateform/pull/13) is
open against `platform/p1-backend`; repository review remains required. No merge or deployment was performed and
no nonexistent CI result is claimed. If PR 11 lands first, reconcile only the identical #8/#10 overlap against the
updated base.
