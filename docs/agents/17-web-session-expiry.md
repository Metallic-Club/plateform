# #17 Web-session code expiry after row-lock waits

Status: implemented and tested locally; ready for review, not accepted or released.
Branch: `platform/17-web-session-expiry`, from canonical `platform/p1-backend` at `c12b8c0`.

## Goal and evidence

The new handoff redemption uses transaction-start `now()` in a conditional UPDATE. A code valid when the request
begins may expire while its UPDATE waits on a row lock. PostgreSQL18 current-time and Read Committed primary docs
explain the fixed timestamp and locking/re-evaluation rules; actual HTTP reproduction is required before a fix.

## Scope

- Three owned-database tests: unchanged-row wait, updated-version wait, and a valid concurrent single-use control.
- Waits are bounded and observe the known blocker plus a pre-expiry request start and the database's actual clock.
- Capture final code/session/cookie observations and clean up before the expected red assertion.
- Repeat only #8's reviewed current-base-compatible safe test cleanup from PR16. Do not use an unsafe baseline sweep.
- Reuse the existing device-flow helper through test-only visibility; no new auth policy, client, account or dependency.
- OpenAPI clarifies fresh claim validity and no session/cookie on invalid redemption. No route/wire shape changes.

## Next

Publish the reviewed change into canonical `platform/p1-backend` and inspect review results. Only the repository
lead/owner may merge after review; this worker must not merge its own PR. The separate #14 integration study
must record the exact published head before combining it with the other pending backend changes.

## Actual red evidence

Guarded `cargo test --workspace --test api web_session_expiry -j 4 -- --test-threads=1` on unchanged production:
1 passed, 2 failed. The valid concurrent single-use control passed. Both unchanged-row and updated-row waits began
before expiry, crossed the database clock boundary while blocked, then returned 200 with a cookie, one extra
session and a consumed code. Expected: uniform invalid_code / 400, no cookie/session and no claim. The code's
expiry itself was unchanged. Owned databases were cleaned before the deliberately failing observations asserted.

Local raw log: `<TEMP>/metallic-17-red.log`. The lane guard cleaned the prior local server package and verified
this worktree's source; shared external dependencies remained cached. No tokens or connection values were logged.

## Implemented fix

Acquire the code row in an explicit transaction without a time predicate. While holding it, perform the same
conditional single-use UPDATE using database `clock_timestamp()` for expiry and used_at. Commit that claim before
fetching identity/creating the pooled session, preserving the existing failure/consumption boundary and avoiding
a pool acquisition while the code-row connection is held. Unknown/used/expired codes retain the same error shape.
No scope, recipient-binding, cookie policy, account status, lifetime or minor-default change.

## Completed validation

On canonical base `c12b8c0`, using the reviewed Cargo lane guard and exclusive backend lane:

- Focused expiry HTTP regressions: 3 passed, including both previously failing lock-wait cases and the valid
  concurrent single-use control (`<TEMP>/metallic-17-green.log`).
- Full workspace: 65 passed (32 unit and 33 API tests), 0 failed; the OpenAPI walkthrough covers 63 operations
  (`<TEMP>/metallic-17-tests.log`).
- Strict workspace/all-targets Clippy: passed (`<TEMP>/metallic-17-clippy.log`).
- Cargo license check: passed, with the existing unused MPL-2.0 allowance warning (`<TEMP>/metallic-17-licenses.log`).
- Formatting and whitespace checks: passed.
- Redocly CLI 1 OpenAPI lint: passed, retaining the existing health-operation ignore (`<TEMP>/metallic-17-openapi.log`).
- `web/` and CI workflow files are absent on this canonical base; no web build or CI result is claimed.
- Independent source review found no additional blocker in locking, rollback, connection-pool use or error boundaries.

No new dependency, auth policy or production server deployment. The #8 safe test-database cleanup prerequisite is
included because these real HTTP tests create owned databases; no unrelated backend changes are bundled.
