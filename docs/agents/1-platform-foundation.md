# Platform foundation: issue 1

Status: implemented and tested locally; production identity, deployment, moderation, and game hosting remain planned.

## Goal

Turn the raw platform feature list into one runnable backend slice: discover published game metadata, manage private drafts through trusted local tooling, and explicitly publish or unpublish them. This does not execute or distribute playable game builds.

## Implemented

- TypeScript on Node 24+, using the built-in HTTP and SQLite APIs with no runtime dependencies.
- WAL-backed durable catalog, schema version checks, public/creator indexes, parameterized queries, and conditional versioned writes.
- Public listing, literal title/description search, genre filters, detail lookup, bounded keyset pagination, and query-bound cursors. Public queries hide drafts.
- Creator listing/detail, create, draft edit, publish, and unpublish. Unknown fields, malformed UTF-8 JSON, invalid values, incomplete publication, and stale writes return structured errors with generated request IDs.
- Local development credentials are explicit and disabled by default. Startup rejects them outside development/test or on a non-loopback bind. Creator HTTP requests require the secret, loopback source, and no Origin header. This is not a production account system.
- Bounded JSON bodies and headers, request timeouts, graceful shutdown handler, no-store JSON responses, and storage-backed health checks.
- Matching typed SDK, API docs, README, and CI provided by the coordinating agent in this same branch.

## Validation

- `npm install`: 3 development packages installed; audit reported zero vulnerabilities.
- `npm test`: build plus all 24 tests passed, including the real entrypoint smoke test and stalled-response SDK timeout regression.
- HTTP coverage includes owner isolation, hidden drafts, stale concurrent edits, publishing lifecycle, Unicode codepoint limits, validation, cursor pagination/filter binding, wildcard escaping, auth failures, and error/header behavior.
- Disk tests close/reopen the database and verify publication state and version persistence. Newer schemas are refused without migration or data loss.
- Entrypoint smoke test uses a hidden Node subprocess, starts HTTP, creates a persisted draft, invokes shutdown, and reopens SQLite. POSIX uses real SIGTERM; Windows uses IPC to dispatch the same SIGTERM handler because Windows process termination does not deliver POSIX signals gracefully.

## Limits and next work

- SQLite access is synchronous and intended for a local single-process foundation. No million-user, throughput, or latency claims have been measured.
- Search uses SQLite LIKE: case insensitive for ASCII, case sensitive for non-ASCII; it is not ranking or recommendation search.
- Editing requires unpublishing first. Publishing currently exposes metadata only; artifact upload, immutable release versions, moderation approval, runtime/server compatibility, and server orchestration need their own work.
- Replace development credentials with verified accounts and scoped authorization before exposing creator features publicly. Moderation, anti-abuse controls, backups, deployment, telemetry, and authentication lifecycle remain unimplemented.
- API and SDK docs describe the contract and validation limits. The repository default branch remains `platform/feature-list-20261030`; this work does not create or push `main`.
- A parallel OpenAPI proposal appeared during implementation on `platform/design-20261030`. This local contract is not compatible with that proposal; `docs/platform-contract-integration.md` records the exact revision and required integration work. Do not connect this SDK as the public P1 client.
