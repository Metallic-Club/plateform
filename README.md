# Metallic platform

Metallic's local game catalog API and creator publishing foundation. Built with TypeScript, Node's HTTP server, and SQLite. There are no runtime package dependencies.

Implemented here:

- Public discovery with literal text search, genre filters and cursor pagination.
- Creator drafts, validated metadata updates, publishing and unpublishing.
- Ownership checks, version conflicts, persisted records and structured API errors.
- A typed HTTP client for public consumers and trusted local creator tools.

This is a local development service. It does not host playable game packages, run game servers, authenticate player accounts, moderate content, or implement the economy. The owner's broader requirements remain in [the feature list](docs/platform-feature-list.md).

The parallel `platform/design-20261030` branch proposes a broader public OpenAPI contract. This service and its SDK do not implement that contract. See [contract integration](docs/platform-contract-integration.md) for the inspected revision, differences and migration gates before public integration.

## Run locally

Use Node.js 24 or 26 and npm. From this directory:

```sh
npm ci
npm run build
npm start
```

The public API listens on `http://127.0.0.1:3000`. `GET /health` checks the database connection. The catalog starts empty; published records come from creator actions rather than seeded activity or invented player counts.

`npm start` reads process environment variables. For a local `.env` file, copy `.env.example` to `.env` and use `npm run dev`, which builds and loads that file. SQLite data lives at `./data/catalog.sqlite` by default. `.env`, data files and build output are excluded from Git.

## Enable local creator tools

Creator routes are disabled until both `METALLIC_DEV_API_KEY` and `METALLIC_DEV_CREATOR_ID` are configured. Generate a unique local key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in your local `.env` and set a creator ID. The key is sent as `Authorization: Bearer <key>` by a trusted local tool. Do not put it in frontend bundles, public URLs, screenshots or repository files.

This credential represents one development creator, not a user login. Creator requests must come directly from the loopback interface and must not include an `Origin` header. Startup rejects development creator credentials in production mode and rejects non-loopback binding when they are enabled. Public discovery can be used without the key.

See [the API contract](docs/api.md) for request examples and error codes.

## Use the typed client

After building, Node tools can import `./dist/sdk/index.js`:

```js
import { createPlatformClient, PlatformApiError } from './dist/sdk/index.js';

const publicCatalog = createPlatformClient({ baseUrl: 'http://127.0.0.1:3000' });
const page = await publicCatalog.listGames({ genre: 'obby', limit: 20 });

const creator = createPlatformClient({
  baseUrl: 'http://127.0.0.1:3000',
  creatorKey: process.env.METALLIC_DEV_API_KEY,
});
const draft = await creator.createGame({
  title: 'Skyline Parkour',
  genre: 'obby',
  description: 'Jump across rooftops and reach every checkpoint.',
  tags: ['parkour'],
});

try {
  const published = await creator.publishGame(draft.id, draft.version);
  console.log(published.id);
} catch (error) {
  if (error instanceof PlatformApiError) {
    console.error(error.code, error.requestId);
  } else {
    throw error;
  }
}
```

The client defaults to a ten-second request timeout, accepts an `AbortSignal`, refuses redirects, and never retries mutations automatically. Public methods omit creator credentials even when a key is configured. `PlatformApiError` exposes HTTP status, API code and request ID; `PlatformTransportError` identifies connectivity, cancellation or invalid-response failures.

The SDK is source in this repository, not a published package. It is not yet wired into Metallic Studio's Rust runtime.

## Verify

```sh
npm run typecheck
npm test
npm audit --omit=dev --audit-level=high
```

Tests use isolated databases and real loopback HTTP servers. They cover draft visibility, creator isolation, stale edits, persistence, cursor pagination, input bounds and client credential handling. CI runs the suite on Windows and Linux with Node 24 and 26. A passing local run does not establish the status of a remote CI run; check the PR's checks.

## Storage and deployment limits

SQLite uses WAL, full synchronization, schema versioning, prepared statements and conditional version updates. Keep the database on a local disk. For an offline backup, stop the service cleanly before copying its data; copying only a live main database file can miss WAL contents. An online backup workflow has not been implemented.

The synchronous database driver and literal substring search suit a local, single-process catalog. No concurrency or throughput target has been established. Production needs account authentication, scoped authorization, moderation gates, rate limits, operational telemetry, migrations and restore drills before exposing creator publishing. Large-scale discovery, international search, object storage, server allocation and payments remain separate work.

Runtime implementation references: [Node HTTP](https://nodejs.org/api/http.html), [Node SQLite](https://nodejs.org/api/sqlite.html), and [SQLite WAL](https://www.sqlite.org/wal.html). No engine source was copied.
