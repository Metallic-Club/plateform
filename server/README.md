# Metallic platform server

Rust (axum 0.8, sqlx 0.9, PostgreSQL 18). Contract: `../api/openapi.yaml` (all 62 operations implemented, none
answer 501). Design: `../docs/superpowers/specs/2026-10-30-platform-design.md`.

## Local database (no Docker, no admin rights)

`scripts/dev-postgres.ps1` downloads the official EDB PostgreSQL 18.6 Windows binaries (SHA-256 pinned, matches
Scoop's manifest), extracts only `bin`, `lib` and `share`, and runs a cluster for the current user:

- data and binaries in `%LOCALAPPDATA%\Metallic\pg`, port 54329, `127.0.0.1` only, scram-sha-256;
- user `metallic`, random password in `%LOCALAPPDATA%\Metallic\pg\dev-password` (never in git);
- `fsync=off` (dev and tests only).

```powershell
powershell -File server/scripts/dev-postgres.ps1 setup   # install + init + start + create database "metallic"
powershell -File server/scripts/dev-postgres.ps1 status
powershell -File server/scripts/dev-postgres.ps1 url     # prints METALLIC_DATABASE_URL for your shell
powershell -File server/scripts/dev-postgres.ps1 stop
```

Assistant's call: the official EDB zip over `postgresql_embedded` (third-party repackaged binaries, many crates).

## Run

```sh
cargo run -- keygen            # prints METALLIC_HMAC_KEY / METALLIC_DATA_KEY / METALLIC_SERVER_SECRET
# put them and METALLIC_DATABASE_URL in your shell (see .env.example)
cargo run -- migrate
cargo run -- seed              # fictitious demo data; password from METALLIC_SEED_PASSWORD or printed once
cargo run                      # API on 127.0.0.1:8080; in dev it also runs migrations and background jobs
```

Only `METALLIC_ENV=dev` starts today: emails go to the log-only dev mailer (kind only; set `METALLIC_DEV_MAIL_DIR`
to get the full messages as files) and the captcha accepts `dev-captcha-ok`. Real providers come with deployment.

Seed accounts (all `@example.com`, invented): `nova_pilot`, `quartz_fox`, `ember_lane`, `pixel_otter` (adults),
`rivet_jay` (16-17), `tiny_comet` (under 13) and the first-party `Metallic`. 16 invented games, 14 catalog items,
3 regions. Images point at the reserved `cdn.metallic.example` domain, so they do not load; the web app should
show its placeholder art.

## Switching the web app to the real API

Branch `platform/web-ui`, folder `web/`: `getApi()` in `src/lib/api/index.ts` uses the HTTP client when
`METALLIC_API_URL` is set, and the mock otherwise.

```sh
# web/.env.local
METALLIC_API_URL=http://127.0.0.1:8080
```

Notes for the web side:
- Set `METALLIC_PUBLIC_WEB_URL` (default `http://localhost:3000`) or `METALLIC_CORS_ORIGINS` on the server to the
  web origin; cookie writes from other origins get 403 `origin_not_allowed`.
- The HTTP client still has `TODO(auth)`: forward the visitor's `metallic_session` cookie and send `X-CSRF-Token`
  (from `GET /v1/auth/session`) on POST/PUT/PATCH/DELETE.
- `METALLIC_COOKIE_SECURE=false` is needed for plain-http localhost sign-in (dev default).
- Studio templates stay on fixtures (no endpoint in P1).

## Game servers

Internal endpoints under `/internal/v1` (in the OpenAPI file, tag `internal`) take the `X-Metallic-Server-Secret`
header (`METALLIC_SERVER_SECRET`, compared in constant time): register, heartbeat every 5 s with the full player
list, stop, and redeem join tickets. Servers silent for 30 s stop counting and are stopped by the job loop. The
gateway must not expose `/internal/` to the internet.

Registration may include `host`, `port`, `certSha256`, `protocolMajor`, `engineVersion` and `buildId`, all together
or all omitted. Host is a bounded ASCII DNS name or unbracketed IP literal; port is 1-65535; certificate is the
64-digit SHA-256 hex digest of the complete DER certificate; protocol major is a positive PostgreSQL integer.
Version/build labels are bounded ASCII, with no backend version negotiation. Certificates are normalized to
lowercase. Register a new server process to rotate connection facts; metadata is not mutable through heartbeat.
Legacy P1 registrations remain valid for existing callers, but their connection metadata cannot resolve.

The Player uses `POST /v1/join-tickets/connect` with its bearer token (`play` scope) and `{ticket}` to get the
registered `serverId`, `host`, `port`, `certSha256`, `protocol` (QUIC ALPN `metallic/<major>`), `engineVersion`,
`buildId` and original `expiresAt`. Cookie sessions are refused for this native-only operation. All responses are
`no-store`; endpoints never appear in public server lists or the `metallic://play?place=...&ticket=...` URI.
Resolution does not consume or extend a ticket. An unbound ticket selects a live, joinable server for its exact
game/place with the existing region/friend/fill/block policy, then binds atomically; a bound ticket never redirects.
Unavailable, full, draining, stale or metadata-less bound servers return 409 `server_unavailable`; unknown, expired,
redeemed and wrongly owned tickets share 410 `ticket_invalid`. A later attempt can retry an unbound ticket until
its original expiry. There is no capacity reservation or host-process provisioning in this endpoint.

Ticket/server row locks protect selection and binding. Fresh database-clock predicates after lock acquisition and
in final writes prevent a lock wait from reviving an expired ticket or stale heartbeat. Redemption remains single
use, with the same place/server binding and wrong-server errors. Its privileged response adds the current identity
`ageBand` and explicit `partyId: null`; it adds no chat/voice permission or party membership. This age-band output
requires the lead's review under the Children rule. Existing minor defaults and content/social policy are unchanged.

## Tests

```sh
cargo test -j 4
```

The API tests (`tests/api/`) need the dev cluster running (or `METALLIC_TEST_DATABASE_URL` pointing at a server
whose user may create databases). Each test copies a migrated template database and drops its own database at the
end. Failed runs retain their databases for inspection. Automatic startup cleanup only considers strictly validated
current-process names, skips connected databases and never uses FORCE; other process databases and shared templates
are never swept. No cleanup terminates another connection. See issue #8 for the fixed cross-process hazard.
Every response is validated against OpenAPI, and `contract::every_operation_answers_as_documented` explicitly calls
all 62 operations. Connection tests include native scope/ownership, non-consuming/unchanged-expiry resolution,
legacy compatibility, exact eligibility, concurrent single-use admission and deterministic row-lock expiry races.

## Security notes

- argon2id (m=19456, t=2, p=1); emails, birth dates and parent emails encrypted with AES-256-GCM; lookups use keyed
  hashes. Session and refresh tokens stored as SHA-256 only.
- Session cookie: HttpOnly, Secure, SameSite=Lax. CSRF token = HMAC of the session, checked in constant time on
  unsafe methods; Origin allow-list on unsafe requests.
- Native apps: device flow (RFC 8628), 15-minute access tokens, rotating 30-day refresh tokens; reuse revokes the
  whole family. No password ever enters the Player or Studio.
- Rate limits per address and per account (in-memory; Valkey with scale-out). 64 KiB body limit, request timeout,
  security headers, CORS allow-list (never `*`).
- Logs carry method, route template and status; never emails, IPs, tokens or bodies.
- Ledger: append-only, double-entry, zero-sum enforced by Postgres triggers; every move has an idempotency key.

## Known gaps

- Presence and rate limits are in-memory: one API instance only.
- No production mailer or captcha provider; the server refuses to start outside dev.
- Recommendations and "similar games" are P1 heuristics (genres and popularity).
- The authorization-code (PKCE) grant answers `unsupported_grant_type` until the web authorize page exists.
