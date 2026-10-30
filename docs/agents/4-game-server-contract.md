# Issue 4: game-server connection contract

## Goal and base

OpenAPI-first, additive connection facts and owner-authenticated ticket resolution for the Player; privileged
redemption identity metadata. Branch `platform/4-game-server-contract` from the issue-specified
`origin/platform/p1-backend` at `7b0f69b`; main does not exist and is not created. No web folder on this base.

## Implemented

- OpenAPI 0.1.2 defines native bearer + play-scope `connectJoinTicket`, request `{ticket}`, response registered
  serverId/host/port/certSha256/protocol/engineVersion/buildId/original expiresAt. Runtime routes are generated from
  the contract; IMPLEMENTED/dispatch and the every-operation walkthrough include the new operation (62 total).
- Register accepts the six optional connection fields all-or-none, including rejection of explicit nulls. DNS/IP
  syntax, port range, certificate DER SHA-256 hex, positive PG integer protocol and bounded ASCII labels validate
  before writes. Legacy registrations still work; endpoint facts are immutable through the API and rotate with a
  fresh server registration. No endpoint/ticket inputs are echoed in JSON type errors or tracing.
- Connect rejects browser sessions, enforces scope/owner, returns uniform private ticket-invalid errors and no-store.
  It does not consume or extend tickets. Unbound tickets use existing friend/block/region/fill policy and bind to an
  eligible matching game/place; bound tickets never redirect. Only the selected server is locked, not all candidates.
  Social reads precede the transaction to avoid exhausting pooled connections behind waiting ticket locks.
- Ticket and server locks protect binding against redemption/state changes. Fresh-clock validation and a final
  conditional binding update recheck server freshness after the row lock and ticket expiry at mutation time.
- Redemption adds `identity::basic().band()` and explicit `partyId: null`. Existing minor policy, private defaults,
  content labels, voice/chat permissions and party memberships are not expanded. **Lead review is required.**

## Tracked prerequisites and tests-first evidence

- [Issue 8](https://github.com/Metallic-Club/plateform/issues/8): old test sweep could force-drop other test processes.
  No destructive reproduction was run. Cleanup now validates current-PID canonical names, skips active databases,
  removes FORCE and never sweeps other PIDs or shared templates. A unit classifier covers foreign/template/malformed
  and injection-shaped names. Advisory-lock and first-sweep ordering remain intact. No manual database deletion.
- Initial isolated API regression failed on new route's generated 501; eight new integration cases then passed.
- [Issue 9](https://github.com/Metallic-Club/plateform/issues/9): existing redemption could pass expiry during a row
  lock wait because `now()` is transaction-start time. A deterministic owned-DB regression confirmed 200 instead
  of 410 before the fix. A new-connect server-row-lock regression also confirmed 200 instead of 409 after its
  heartbeat became stale. Both failed first, then all three lock-wait regressions passed after fresh post-lock /
  final conditional-write guards. No production ticket or other process database was involved.
- [Issue 10](https://github.com/Metallic-Club/plateform/issues/10): the previously unfinished strict Clippy gate
  produced 160 diagnostics, mostly the 136-byte shared error. Optional detail now uses `Box<str>` and already-positive
  Retry-After uses `NonZeroU64`; measured `Problem` layout is 120 bytes. These are changes to **public Rust field
  types in the unpublished server crate**, not source-level transparency. Public builder signatures and HTTP JSON /
  omission / header behavior remain unchanged and have a focused wire regression. Private row aliases and syntax
  fixes resolve the remaining baseline warnings; no lint suppression or authorization/ledger/minor-policy change.
- Primary sources: [PostgreSQL 18 row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS),
  [current timestamps](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
- Tests cover metadata validation, legacy compatibility, native scope/owner, uniform expiration/ownership errors,
  no-store, unchanged expiry, public-list/URI endpoint omission, concurrent binding/single redemption, preserved
  minor defaults, and bounded lock observation across expiry/staleness.

## Local validation and safety

- Existing local PostgreSQL cluster was inspected and started through the existing script only. No setup, download,
  account deployment or URL/password printing. Every API test uses its own copied database.
- Verified agent lane116 owner/path, cleaned only eight prior Studio workspace packages before switching repos,
  then used the reviewed Cargo lane guard with `--workspace server`; backend source paths confirmed. Dependencies
  are retained; no new runtime dependency or Cargo.lock edit.
- Focused eight connection tests and the three new lock-wait tests passed. Full guarded backend suite after the
  error representation change: 33 unit + 40 API tests passed with four test threads. The contract walkthrough
  explicitly calls all 62 operations. Original wire expiry (whole-second RFC3339) and exact stored timestamp are
  separately checked for preservation.
- Final guarded `cargo clippy --workspace --all-targets -j 4 -- -D warnings`: passed with no suppression.
- `cargo fmt --manifest-path server/Cargo.toml --all -- --check`, `cargo deny --manifest-path server/Cargo.toml check
  licenses`, and `git diff --check`: passed. License warnings are existing unused BSD-2-Clause/MPL-2.0 allowances.
- `pnpm dlx --package=@redocly/cli@1 redocly lint api/openapi.yaml`: passed; one existing explicit health-route lint
  ignore. No UI or screenshot requirement; no web generation/lint/build command or CI workflow exists on this base.
- Independent review found the two timing races; their fixes and the final ownership/pool/metadata/cleanup guards
  were reviewed again with no additional actionable findings. Lead review of age-band disclosure remains explicit.
- Local logs: `metallic-platform4-baseline.log`, `metallic-platform4-lock-red.log`,
  `metallic-platform4-lock-green.log`, `metallic-platform4-problem-wire.log`, `metallic-platform4-clippy-final.log`,
  `metallic-platform4-full-tests.log`, `metallic-platform4-openapi-lint.log`.

## Next / open questions

Implementation and all local gates are complete. [PR 11](https://github.com/Metallic-Club/plateform/pull/11) is open
against `platform/p1-backend`, closing #4 and the tracked #8/#9/#10 prerequisites when merged. Repository review
remains required, including explicit lead review of privileged age-band output. Coordinator approval of the
implementation approach is not repository lead acceptance. No main branch was created; no merge, publish or
deployment was performed. The existing local PostgreSQL cluster remains running for other development sessions.
