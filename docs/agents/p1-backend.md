# P1 backend: progress note

Branch `platform/p1-backend` (from `platform/design-20261030`). Status: implemented; partly tested (see below).

## Done

- Migrations: identity, social, games (+ discovery), matchmaker, catalog, economy ledger (append-only,
  double-entry, zero-sum and balance triggers).
- All 61 operations in `api/openapi.yaml` have handlers (57 public + 4 internal game-server endpoints added in this
  branch). Auth: browser sessions + CSRF + Origin checks, RFC 8628 device flow, rotating refresh tokens, argon2id,
  rate limits, email verification through a pluggable mailer, parental consent for under-13.
- `seed`, `migrate`, `keygen` commands; background jobs (stale servers, live-count snapshot, purges, cleanup).
- Test harness with per-test databases and OpenAPI response validation; 28 API tests + 32 unit tests.

## Verified before the disk freeze (2026-10-30)

- `cargo test -j 4 --lib`: 32 passed (after fixing one wrong expected timestamp in a test).
- `cargo test -j 4 --test api`: 28 passed, including the walkthrough that calls all 61 operations.
- `cargo fmt`: applied and committed.
- `cargo deny check licenses`: "licenses ok" earlier in the session with the same dependency set.

## Not verified (stopped by the coordinator's build freeze: disk full)

- `cargo clippy --all-targets -j 4 -- -D warnings` was interrupted before it finished. Expect a few lints
  (e.g. `too_many_arguments`, casts) to fix.
- `cargo fmt --check` after the last edits (README/notes only since the fmt commit; no Rust changed).
- Full `cargo test -j 4` in one run (lib and api suites passed separately on the same code).
- `cargo deny check licenses` re-run on the final lockfile.
- A manual run of the web app against the API (`METALLIC_API_URL`).

## Checks to run after the reboot

```sh
cd /c/Users/alexi/Documents/metallic-plateform-worktrees/p1-backend/server
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR=/c/Users/alexi/Documents/metallic-studio-worktrees/_target-lead-shared \
  CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_PROFILE_BENCH_DEBUG=0 CARGO_INCREMENTAL=0
powershell -File scripts/dev-postgres.ps1 start      # the cluster was stopped cleanly for the freeze
cargo fmt --check
cargo clippy --all-targets -j 4 -- -D warnings
cargo test -j 4
cargo deny check licenses
powershell -File scripts/dev-postgres.ps1 stop       # when done
cargo clean -p metallic-platform                     # shared target: never clean the whole folder
```

## Open questions

- Under-13 accounts can only receive and send friend requests among friends of friends, and P1 has no other way
  to make the first friend (in-person codes, parent-approved invites). Needs the lead's review (Children rule).
- Approving a device with a bearer token answers 401 `session_required`; 403 may read better. Contract allows both.
