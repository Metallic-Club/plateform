# Issue 19: private development-host bundle

## Goal and base

Provide a reviewable private Linux/amd64 development-host bundle, not production hosting or multiplayer. Branch `platform/19-private-dev-host`, initial canonical base `c12b8c044ebd86f95b73ce810075066db425e91c`, normally merged to `653a42241f29e9949f272e60fedd52a76870dc09` for publication (only the lead's Metallic Play error-detail wording changed). Pending PR11/13/16/18 implementations are excluded. No remote Docker install, service start, permission change or credential output is authorized by this source PR.

## Implemented

- `deploy/dev-host`: pinned multi-stage locked Rust 1.99.1 build; non-root read-only API; official PostgreSQL 18.6 with correct version-18 volume mount and durable defaults; no DB host port; loopback API only; CPU/memory/PID/log limits.
- Five host-local random files under protected 0700 directories, 0444 files for explicitly granted read-only Compose mounts; stable/idempotent preparation; reject symlinks, checkout paths, foreign/incomplete/corrupt state. No secret values in Compose config/image arguments. Canonical API reads them into its own process environment through the wrapper.
- Separate non-superuser application database owner. TCP health check excludes the official entrypoint's temporary socket-only initialization server.
- Ordinary-account Python controls, optional operator-only sudo for Docker with only three nonsecret variables preserved. Explicit launch sequences build/database/migrate/start/readiness; stop retains durable state. No automatic seeding or operator volume deletion.
- Local logical backup with exclusive private output; restore only to an empty database with API stopped, single transaction, no clean/drop/create. Preserve the complete original secret set for recovery.
- Narrow read-only-token PR workflow: actual Linux Docker image/runtime, caps/networking/UID/durability, key persistence, database dump/restore into a distinct project, and email-based login/decryption of synthetic account data after restore. Explicit volume cleanup is confined to owned ephemeral CI projects. No image push or deployment.

## Test prerequisite and source boundary

Repeated only reviewed issue 8's ownership-safe test cleanup (`server/tests/api/support.rs`, blob `f08cb9da4d07041046a99168692461bfa52badda`) so mandatory backend tests never sweep other processes or shared templates. This duplicates the tracked prerequisite in other open PRs; it adds no production feature. Production Rust, OpenAPI and migrations remain canonical. Do not run the unsafe baseline sweep.

## Validation and exact checkpoints

- Registry tag/manifest verification passed for the three official image pins documented in the runbook.
- Initial source checkpoint `4d371c16ea6cc9fe4c71ce983ef1810cac0efb13` had 17/18 Linux tests pass: inherited umask 077 changed an intended 0755 test fixture into 0700. This was a fixture assumption, not a production permission bug. The fixture explicitly sets 0755 in the next checkpoint.
- Reviewed source checkpoint `41526cb20304863031541582971637aa831ec9cd`: all 20 Linux helper tests passed under both 077 and 022 umasks, no failures/skips. Host-local secret preparation and quiet daemon-free Compose configuration passed. Source archive SHA256: `719d071283ba00790ca6400b22a21b15040ad39a8f53938f2ad9250e7c5e5844`.
- Current Windows helper suite: 20 passed, three POSIX-only cases explicitly skipped (23 cases). Python source compilation and Git whitespace checks passed.
- Initial c12 mandatory backend suite: 62 tests passed (32 unit + 30 HTTP/database), zero failures or ignored. Contract walkthrough covers all 63 canonical operations. Guarded lane116 rebuilt this checkout's package with Cargo `-j4`, test harness four threads.
- Initial c12 strict all-target Clippy, cargo fmt check, cargo deny licenses and Redocly1 passed. Fresh 653-base strict Clippy/fmt/licenses/Redocly passed. Its initial four-thread full run had one readiness 503 while all other 29 API cases passed. Bounded follow-up inspection found the local cluster stopped, with connection-refused and no listener; the exited pool could not be observed. Start-only recovery of the existing cluster succeeded. The exact contract case then passed, followed by the complete quiet serial 62-test suite. Concurrency and later cluster unavailability do not prove the earlier request failure's cause; the original failed run remains recorded. No readiness bound was changed. License output has existing unmatched-allowance warnings; Redocly reports one configured ignored problem. OpenAPI/production Rust/migrations are byte-unchanged from canonical base. No web directory exists, so web checks are inapplicable.
- No local Docker executable/daemon is available. A remote owned preview was used only for Linux helper tests, key preparation and daemon-free configuration: no Docker startup, administrator change or runtime deployment occurred. Image/runtime/backup-restore execution is intentionally delegated to the new PR workflow; at initial publication it has not executed. Consult the PR's current checks rather than inferring a CI result from this source note.

## Commands and follow-up

```text
python -I -m unittest discover -s deploy/dev-host -p test_host.py -v
python -m py_compile deploy/dev-host/host.py deploy/dev-host/ci_smoke.py deploy/dev-host/test_host.py
python -I ../../metallic-studio-worktrees/209-build-lane-guard/tools/cargo_lane.py --workspace server --target-dir <exclusive local lane116> -- test --workspace -j 4 -- --test-threads=4
python -I ../../metallic-studio-worktrees/209-build-lane-guard/tools/cargo_lane.py --workspace server --target-dir <exclusive local lane116> -- clippy --workspace --all-targets -j 4 -- -D warnings
cargo fmt --manifest-path server/Cargo.toml --all -- --check
cargo deny --manifest-path server/Cargo.toml check licenses
pnpm dlx --package=@redocly/cli@1 redocly lint api/openapi.yaml
```

The complete runbook lives in `deploy/dev-host/README.md`. No feature implementation is imported from PR11/13/16/18; only issue 8's separately tracked safe test-cleanup prerequisite is duplicated. The new narrow workflow is part of this host issue; earlier base verification correctly reported no existing workflow.

After publication, review the actual Linux Docker smoke result and fix any failure before an operator launches. The administrator's concrete one-command launch is documented, but requires a later explicit owner action on their terminal. No password capture, persistent Docker-group grant, aggregate feature merge or production/multiplayer acceptance is part of this work.

## Final bootstrap-copy robustness change

The reviewed preview's checkout SQL was 0644; no permission failure was observed on that host. To support legitimate 0600 private checkouts, preparation now installs a checksum-bound nonsecret 0444 bootstrap copy under 0700 state and mounts that file individually. Existing foreign/symlink copies are refused before mutation; secrets remain unchanged. The workflow explicitly makes the source 0600 before preparation. The three added cases are locally green where applicable; fresh Linux execution/configuration of this final helper is pending the published-head preview/CI. Runtime Rust, OpenAPI and migrations still exactly match canonical 653, so no backend rerun is needed for this Python/Compose-only change.

## First actual Docker CI result and fix

Run 41117343343 on b7e23c1 passed both 23-case Linux helper runs/configuration, built the locked release image successfully and started the official database. Migration then failed application-role authentication, so runtime/restore assertions were not executed. Scoped ephemeral cleanup passed.

Confirmed bootstrap defect: PostgreSQL `trim(text)` defaults to trimming spaces, not LF. Generated password files end in LF; shell command substitution strips that LF but the role initialization had retained it. A bounded read-only SQL check with a synthetic 64-character value plus LF returned lengths 65 for default trim and 64 for explicit CR/LF rtrim. No real password was printed or modified.

The initialization SQL now trims explicit trailing CR/LF and its reviewed checksum is updated. Local 23-case tests/source compilation pass where applicable. The old protected bootstrap copy is intentionally refused as stale; preserve/rename only that nonsecret file and rerun prepare, retaining every secret byte. No private-host database/container was started, and no production Rust/API/migration changed. The next exact-head Docker workflow is the regression rerun; no runtime success is claimed yet.
