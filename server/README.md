# Metallic platform server

Rust (axum 0.8, sqlx 0.9, PostgreSQL 18). Contract: `../api/openapi.yaml` (all 63 operations implemented, none
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

## Tests

```sh
cargo test -j 4
```

The API tests (`tests/api/`) need the dev cluster running (or `METALLIC_TEST_DATABASE_URL` pointing at a server
whose user may create databases). Each test copies a migrated template database and drops it at the end; leftovers
from failed runs are dropped at the next run. Every response is validated against the OpenAPI schemas, and
`contract::every_operation_answers_as_documented` calls all 63 operations.

## Security notes

- argon2id (m=19456, t=2, p=1); emails, birth dates and parent emails encrypted with AES-256-GCM; lookups use keyed
  hashes. Session and refresh tokens stored as SHA-256 only.
- Session cookie: HttpOnly, Secure, SameSite=Lax. CSRF token = HMAC of the session, checked in constant time on
  unsafe methods; Origin allow-list on unsafe requests.
- Native apps: device flow (RFC 8628), 15-minute access tokens, rotating 30-day refresh tokens; reuse revokes the
  whole family. Rotation, replay handling and native sign-out share a transaction-scoped family lock, acquired
  before refresh-token row locks. Validation runs after waiting; revocation updates both token tables atomically.
  This prevents concurrent minting from escaping a completed family revocation. Access-token-only revocation
  retains its narrower effect. No password ever enters the Player or Studio.
- Rate limits per address and per account (in-memory; Valkey with scale-out). 64 KiB body limit, request timeout,
  security headers, CORS allow-list (never `*`).
- Logs carry method, route template and status; never emails, IPs, tokens or bodies.
- Ledger: append-only, double-entry, zero-sum enforced by Postgres triggers; every move has an idempotency key.

## Known gaps

- Presence and rate limits are in-memory: one API instance only.
- No production mailer or captcha provider; the server refuses to start outside dev.
- Recommendations and "similar games" are P1 heuristics (genres and popularity).
- The authorization-code (PKCE) grant answers `unsupported_grant_type` until the web authorize page exists.
