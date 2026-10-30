# Issue 19: private development-host bundle

## Goal and base

Provide a reviewable private Linux/amd64 development-host bundle, not production hosting or multiplayer. Branch `platform/19-private-dev-host`, canonical base `c12b8c044ebd86f95b73ce810075066db425e91c`. Pending PR11/13/16/18 implementations are excluded. No remote Docker install, service start, permission change or credential output is authorized by this source PR.

## Implemented

- `deploy/dev-host`: pinned multi-stage locked Rust 1.99.1 build; non-root read-only API; official PostgreSQL 18.6 with correct version-18 volume mount and durable defaults; no DB host port; loopback API only; CPU/memory/PID/log limits.
- Five host-local random files under protected 0700 directories, 0444 files for explicitly granted read-only Compose mounts; stable/idempotent preparation; reject symlinks, checkout paths, foreign/incomplete/corrupt state. No secret values in Compose config/image arguments. Canonical API reads them into its own process environment through the wrapper.
- Separate non-superuser application database owner. TCP health check excludes the official entrypoint's temporary socket-only initialization server.
- Ordinary-account Python controls, optional operator-only sudo for Docker with only three nonsecret variables preserved. Explicit launch sequences build/database/migrate/start/readiness; stop retains durable state. No automatic seeding or operator volume deletion.
- Local logical backup with exclusive private output; restore only to an empty database with API stopped, single transaction, no clean/drop/create. Preserve the complete original secret set for recovery.
- Narrow read-only-token PR workflow: actual Linux Docker image/runtime, caps/networking/UID/durability, key persistence, database dump/restore into a distinct project, and email-based login/decryption of synthetic account data after restore. Explicit volume cleanup is confined to owned ephemeral CI projects. No image push or deployment.

## Test prerequisite and source boundary

Repeated only reviewed issue 8's ownership-safe test cleanup (`server/tests/api/support.rs`, blob `f08cb9da4d07041046a99168692461bfa52badda`) so mandatory backend tests never sweep other processes or shared templates. This duplicates the tracked prerequisite in other open PRs; it adds no production feature. Production Rust, OpenAPI and migrations remain canonical. Do not run the unsafe baseline sweep.

## Evidence so far

- Actual Docker registry manifest/tag verification for Rust 1.99.1-bookworm, Debian bookworm-slim and PostgreSQL 18.6-bookworm; digests recorded in the runbook and Dockerfile/Compose.
- Windows Python unit suite: 18 cases, 16 passed, two POSIX-specific permission/symlink cases explicitly skipped. Compilation of Python source passed. Initial missing-module scaffolding failure was not a product regression. The later foreign-backup-state regression reproduced an unwanted directory creation before the fix and passes afterward.
- No local Docker executable/daemon is available. Actual Compose config, Linux permission tests, image build/runtime and CI have not run yet. Root is reviewing source before uploading for daemon-free remote validation. Do not claim those checks passed.
- Local mandatory backend gates are pending the coordinated Studio timing window. Use reviewed 209 Cargo lane guard with exclusive lane116 and `-j4`; safe test harness is already present.

## Next

Finish source review and daemon-free validation, then mandatory fmt/test/Clippy/license/Redocly gates. Commit with the model trailer, push only this branch and open its PR into `platform/p1-backend`, attach it, and follow the new narrowly scoped CI result. Keep this note and PR evidence current, including any unavailable checks. Administrator launch is a later explicit owner action using the concrete reviewed command; no password capture or persistent Docker-group grant.

Primary sources and exact image pins are in `deploy/dev-host/README.md`. Runtime build uses Cargo `--release --locked -j4`. There is no web directory in this base. The new workflow is part of this issue; prior base verification correctly reported no existing CI workflow.
