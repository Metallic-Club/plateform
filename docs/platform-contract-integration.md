# Local catalog and the public platform contract

Inspected on 2026-10-30: [`api/openapi.yaml` at `5be3fc1`](https://github.com/Metallic-Club/plateform/blob/5be3fc1fd7ed53d15e2cba8c0e3ed82d0522794f/api/openapi.yaml), on the parallel `platform/design-20261030` branch. That revision was not in the repository's default branch when this local service was implemented.

The public proposal covers P1 accounts, profiles, social features, discovery, server joins, avatar data and read-only economy endpoints. The local implementation tests a narrower catalog and creator publishing workflow. **The local service and SDK are not a conforming P1 server/client.** They must not be substituted for generated public-client types.

## Differences to reconcile

| Area | Local implementation | Inspected public proposal | Required integration work |
| --- | --- | --- | --- |
| Paths | `/health`, `/api/v1/games`, `/api/v1/creator/games` | `/healthz`, `/v1/...` | Implement the accepted public paths through an explicit adapter or service migration. Keep development endpoints isolated. |
| Identity | UUID game IDs and an explicit local creator ID | Decimal strings representing 64-bit IDs | Choose an allocator and preserve a durable mapping when importing local records. Never cast IDs through JavaScript `number`. |
| List envelope | `games`, `nextCursor` | `items`, `nextCursor` | Generate public response types and validate the public adapter against them. Existing cursors are local-contract values, not transferable tokens. |
| Errors | JSON `error` envelope, uppercase stable codes, request ID | RFC 9457 `application/problem+json` and public codes | Implement problem types and code mapping; test failures as well as success responses. |
| Creator identity | One configured development creator, bearer secret, loopback-only, no browser Origin | Account sessions and native access tokens through device/PKCE flows | Replace developer credentials with authenticated user identity and scoped authorization. Add browser CSRF/session protections where applicable. |
| Game metadata | `title` up to 80 code points, description up to 2,000, one genre, tags, draft/published state | `name` up to 50, description up to 4,000, up to three genres, richer game detail | Define migration/validation policy for existing drafts. Do not silently truncate names or discard genres. |
| Discovery cards | Stored metadata only | Creator reference, images, content label, rating, playing count and first-party status | Connect real asset, creator, moderation and runtime/statistics data. Do not invent placeholders that look like measured activity or moderation approval. |
| Publishing | Metadata becomes discoverable after completeness checks | Public read contract does not establish this local creator workflow | Specify build upload, immutable releases, compatibility, ownership, moderation and rollback before treating metadata publication as a playable release. |
| Operations | One local SQLite process; minimal readiness check | Broader platform dependencies and rate-limit headers | Add deployment-specific readiness, bounded concurrency, telemetry, rate limits, backup/restore and load evidence. |

These differences are recorded for maintainers; the draft branch does not authorize replacing an accepted contract. Re-read the final accepted OpenAPI revision before implementing the public adapter, because the proposal may change.

## Integration gates

1. Select and record the accepted OpenAPI commit. Generate public types from it and add contract tests for routes, request/response schemas, media types, IDs and error codes.
2. Define the ID and metadata migration, with an offline backup and a reversible import. Existing local schema version 1 must not be reinterpreted silently.
3. Implement real account/token validation and ownership scope. A local developer key must never authorize a public production request.
4. Populate public game summaries from real services. For a field with no source, implement its source or revise the accepted contract; do not fabricate data to satisfy a schema.
5. Model a published playable release separately from its catalog metadata. Require a verified artifact, compatible engine/runtime, moderation decision and a tested rollback path.
6. Run conformance, cross-creator access, draft-leakage, stale-write and migration regressions against the integrated service. Establish performance targets with measured representative load.

The current persistence, validation, ownership and lifecycle tests can be retained as internal behavioral tests during that work. The current SDK is useful for local tooling; its protocol is deliberately not promised as the public P1 API.
