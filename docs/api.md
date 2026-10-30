# Catalog API v1

Base URL for local development: `http://127.0.0.1:3000`.

This document describes the implemented local catalog contract. It is separate from the broader public OpenAPI proposal on `platform/design-20261030`; see [the integration note](platform-contract-integration.md) before connecting a public client.

All responses are JSON. Mutations require `Content-Type: application/json`, and request bodies are capped at 16 KiB. Responses include `X-Request-Id` and `Cache-Control: no-store`. IDs are server-generated UUIDs. Timestamps are UTC ISO 8601 strings. A game's `version` begins at 1 and increases after a successful state change.

## Routes

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| GET | `/health` | Public | `{status:"ok",storage:"sqlite"}` |
| GET | `/api/v1/games` | Public | `{games: Game[], nextCursor: string \| null}` |
| GET | `/api/v1/games/:id` | Public, published only | `{game: Game}` |
| GET | `/api/v1/creator/games` | Local creator | Paginated creator records, including drafts |
| GET | `/api/v1/creator/games/:id` | Owning creator | `{game: Game}` |
| POST | `/api/v1/creator/games` | Local creator | `201`, `{game: Game}` and `Location` header |
| PATCH | `/api/v1/creator/games/:id` | Owning creator, draft only | `{game: Game}` |
| POST | `/api/v1/creator/games/:id/publish` | Owning creator | `{game: Game}` |
| POST | `/api/v1/creator/games/:id/unpublish` | Owning creator | `{game: Game}` |

An unpublished game and a game owned by another creator both produce `404 GAME_NOT_FOUND` when the caller cannot access them. The API does not disclose draft existence through public detail routes.

## Discovery

Both list routes accept:

| Parameter | Rule |
| --- | --- |
| `q` | Trimmed literal substring in title or description, 1 to 100 Unicode code points; SQLite's default ASCII case folding |
| `genre` | One genre from the list below |
| `limit` | Integer from 1 to 100, default 20 |
| `cursor` | Opaque `nextCursor` from the previous response |

Creator lists additionally accept `visibility=draft` or `visibility=published`. Unknown and repeated query parameters are rejected. SQL wildcard characters in `q` are treated literally. Search is not a recommendation algorithm and does not provide language-aware Unicode case folding.

Public results sort by publication time descending, then ID descending. Creator results sort by creation time descending, then ID descending. Keep the same filters when following a cursor; a changed filter produces `422 INVALID_CURSOR`. The page size may change. Cursors are not snapshots: publishing or unpublishing while paging can change the available results. Refresh discovery to see the current first page.

Genres: `action`, `adventure`, `obby`, `simulation`, `strategy`, `racing`, `roleplay`, `puzzle`, `sports`, `other`.

## Metadata and lifecycle

Create a draft:

```http
POST /api/v1/creator/games
Authorization: Bearer <local-development-key>
Content-Type: application/json

{
  "title": "Skyline Parkour",
  "description": "Jump across rooftops and reach every checkpoint.",
  "genre": "obby",
  "tags": ["parkour", "time-trial"]
}
```

Only `title` and `genre` are required on create. Title length is 3 to 80 Unicode code points. Description length is 0 to 2,000 code points, with at least 20 required to publish. Text is trimmed and normalized to NFC. Unpaired UTF-16 surrogates and control characters are rejected except tabs and newlines. A visible character composed of several code points counts more than once. Up to eight distinct tags are allowed, each 1 to 32 lowercase ASCII letters or digits with optional internal hyphens. Unknown body fields are rejected.

The response's `Game` contains:

```json
{
  "id": "<server-generated-uuid>",
  "creatorId": "<configured-local-creator>",
  "title": "Skyline Parkour",
  "description": "Jump across rooftops and reach every checkpoint.",
  "genre": "obby",
  "tags": ["parkour", "time-trial"],
  "visibility": "draft",
  "createdAt": "<UTC timestamp>",
  "updatedAt": "<UTC timestamp>",
  "publishedAt": null,
  "version": 1
}
```

Edit metadata with a `PATCH` containing `expectedVersion` and at least one metadata field:

```json
{"expectedVersion": 1, "title": "Skyline Parkour: Rooftops"}
```

Publish or unpublish with `{"expectedVersion": 2}`, using the latest returned version. A stale version produces `409 VERSION_CONFLICT`; fetch the creator record and reconcile the change before retrying. Published metadata must be unpublished before editing. Repeating a visibility action with the current version and existing state returns the same record without incrementing its version.

Publishing makes metadata publicly discoverable. It does not upload an engine scene, launch a player, reserve a server, or approve content through moderation.

## Local creator access

Configure `METALLIC_DEV_API_KEY` (32 to 512 printable, non-space ASCII characters) and `METALLIC_DEV_CREATOR_ID` (1 to 128 letters, digits, underscores or hyphens, starting with a letter or digit). Send the key in a single bearer authorization header. The service uses the configured creator ID; accepting a creator ID in a request body is not supported.

This mechanism is for trusted local CLI or Studio development tools. It is not player authentication. Creator routes reject browser `Origin` headers and non-loopback connections. With credentials enabled, configuration rejects a non-loopback host and `NODE_ENV=production`. Without credentials, creator routes return `503 CREATOR_AUTH_UNAVAILABLE`; public reads remain available.

No CORS policy is provided. A future web frontend needs a separately designed user authentication and authorization flow. The developer credential must never be included in that frontend.

## Errors

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "The game changed. Reload it before retrying.",
    "requestId": "<request-uuid>"
  }
}
```

Validation errors may include `details`, a field-to-message object. Use `code` for application logic and `requestId` when reporting a failed request. Unexpected storage failures return a generic message, not a stack trace or database path.

| HTTP | Codes |
| --- | --- |
| 400 | `INVALID_URL`, `INVALID_JSON`, `INVALID_BODY` |
| 401 | `UNAUTHORIZED` |
| 403 | `LOCAL_ACCESS_ONLY`, `BROWSER_CREATOR_ACCESS_DENIED` |
| 404 | `GAME_NOT_FOUND`, `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED`, with `Allow` header |
| 409 | `VERSION_CONFLICT`, `GAME_PUBLISHED` |
| 413 | `BODY_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `VALIDATION_ERROR`, `INVALID_CURSOR`, `PUBLISH_VALIDATION_FAILED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `CREATOR_AUTH_UNAVAILABLE`, `STORAGE_UNAVAILABLE` |

Malformed HTTP framing can be rejected by Node before routing, outside this JSON error contract.
