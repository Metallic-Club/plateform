# M2 multiplayer: backend contract (platform side)

Status: implemented and tested on branch `platform/m2-net-backend` (stacks on #11). Source of truth for shapes:
`api/openapi.yaml` (0.2.0). Ticket bytes: `docs/m2-join-tickets.md`. Design: the studio repo's
`docs/superpowers/specs/2026-10-30-multiplayer-m2-design.md`, section 8 (the lead confirmed the backend's names
win where they differ; this file lists every difference).

## 1. Who talks to whom

- **Website, Launcher, Player** call `createJoinTicket`; the **Player** calls `connectJoinTicket`.
- **Host agent** (`metallic-host`) is the only process on a host with a backend credential, a `mht_` host token.
  It calls `registerHost`, `heartbeatHost`, `rotateHostToken`, `redeemJoinTicket` and `getNetKeys`.
  Everything is host-initiated HTTPS. The backend never connects to a host; its wishes come back as orders in
  heartbeat responses.
- **Edge** (`metallic-edge`) verifies tickets offline with the keys the agent fetched.
- Game-server processes never talk to the backend in hosted mode. The per-process `registerGameServer`,
  `heartbeatGameServer` and `stopGameServer` stay for compatibility (and accept a host token, scoped to that host).

## 2. Player-facing

| Operation | Request | Response |
|-----------|---------|----------|
| `createJoinTicket` `POST /v1/games/{gameId}/join` | `{serverId?, followUserId?, region?}` | `201 {status:"ready", ticket, launchUri, placeId, expiresAt, ticketId, serverId}`; `202 {status:"pending", retryAfterSecs, placeId}` + `Retry-After`; `409 server_full`; `503 no_capacity` + `Retry-After` |
| `connectJoinTicket` `POST /v1/join-tickets/connect` | `{ticket}`, bearer, `play` scope, owner | `200 {serverId, host, port, certSha256, sni, protocol, engineVersion, buildId, expiresAt, knockToken}` |
| `getNetKeys` `GET /v1/net/keys` | none (public, cacheable 5 min) | `{keysVersion, keys:[{kid, kty:"OKP", crv:"Ed25519", alg:"Ed25519", use:"sig", x, status, notBefore, notAfter}]}` |

- `ticket` is the signed string itself (`mjt1.`, at most 512 characters), also inside `launchUri`. Patterns in
  `JoinTicket`, `connectJoinTicket` and `redeemJoinTicket` accept it (`JoinTicketString`); legacy `jt_` tickets are
  still accepted on input.
- For a host-managed server `host`/`port`/`certSha256` are the host's **edge**: `edge.publicHost` if the agent gave
  one, else the agent's observed public address. `buildId` is the server's own if known, else the host's first
  `engineBuilds` entry. `protocol` is `metallic/<protocolMajor>`.
- `sni` = first 16 hex digits of `certSha256`. `knockToken` = signed `{ip, server, exp}` (section 4 of the ticket
  doc), `ip` = the Player's address as the backend saw it.

## 3. Host agent

| Operation | Request | Response |
|-----------|---------|----------|
| `registerHost` `POST /internal/v1/hosts/register` | `{region, agentVersion, engineVersion, protocolMajor, engineBuilds:[buildId], capacity:{cores, memoryMiB, maxServers, maxPlayers}, edge:{port, certSha256, certSha256Next?, publicHost?}}` | `201 {hostId, heartbeatIntervalSecs, observedAddress}` |
| `heartbeatHost` `POST /internal/v1/hosts/{hostId}/heartbeat` | `{load:{cpu, memoryMiB, upMbps}, edge:{certSha256, certSha256Next?}, servers:[{serverId, kind, status: starting\|ready\|draining\|stopped, players:[userId], joinable, tickP99Ms?, exitCode?}]}` | `200 {orders:[...], keysVersion, nextHeartbeatSecs}`; `410 host_not_registered` |
| `rotateHostToken` `POST /internal/v1/hosts/{hostId}/token/rotate` | none | `200 {token}`; the previous token works 10 more minutes |
| `redeemJoinTicket` `POST /internal/v1/join-tickets/redeem` | `{ticket, serverId}` | existing fields + `kind, canEdit, chatAllowed, voiceAllowed, accountStatus` |

Orders (`type` tag):

- `{type:"start", serverId, gameId, placeId, placeVersionId, assetHash, maxPlayers, kind, region}`: repeated on
  every heartbeat until the agent reports that `serverId` (starting is idempotent by id). `assetHash` is null
  until the asset service exists; `placeVersionId` is the place's live version (may be null in seed data).
- `{type:"drain", serverId, reason: "admin"|"host_draining", deadlineSecs}`: no new players; stop when empty or
  at the deadline. A draining server that reports zero players gets `stop`.
- `{type:"stop", serverId}`: also sent for any reported server the backend does not know for this host.
- `{type:"rotateToken"}`: call `rotateHostToken`, store the new token, use it.

Authentication: `Authorization: Bearer mht_<43 base64url>`. Only the SHA-256 is stored. Disabled hosts and any
bad token get one uniform 401; repeated failures per client address get 429. Per-host rate limit: 3,000 requests
a minute. A host can only address its own `hostId` (another id answers 404) and its own servers. The shared
`X-Metallic-Server-Secret` is deprecated: accepted only with `METALLIC_LEGACY_SERVER_SECRET=true` (default false)
and only for servers registered without a host.

## 4. Rules the backend enforces

- **Allocation** (quick join): live `running` servers of the place with room, requested region first, then
  servers with visible friends, then the fullest. Room counts players plus pending reservations (unredeemed,
  unexpired tickets bound to the server, distinct users). Servers of 8+ slots keep 1 slot free for friends (a
  follow, or a listed server where a friend plays, may use it). None: if a server for the place is already
  `starting`, `202 pending`; else allocate a new `starting` server on an active, live, registered host with
  spare capacity (requested region first, then fewest servers) and answer `202 pending`; the agent gets `start`.
  Registered hosts exist but none is active, live and has room (full, draining or silent fleet):
  `503 no_capacity`. No host ever registered (legacy deployment): the old unbound ticket.
- **Race safety:** quick joins for one place serialize on a transaction-scoped advisory lock; each placement locks
  the server row and recounts; allocation locks the host row and recounts its servers. Tested with 12 concurrent
  joins (`server/tests/api/m2.rs`): one allocation for an empty place; on a 4-slot server exactly 4 tickets and
  one more allocation, not eight.
- **Liveness:** host silent 30 s: its servers are unjoinable and not counted. 120 s: stopped. An allocation the
  agent never reports: stopped after 60 s. Legacy servers: unchanged (30 s live, 60 s stopped).
- **Live counts** (`getLiveCounts`, `getPlatformLive`, server browser, follows) count only `running` servers not
  asked to drain, on active, live hosts. Draining and dead servers are excluded.
- **Keys:** sign with `active`; `next` published at least 1 h before activation; retired listed until 10 minutes
  after its last ticket expired (`docs/m2-join-tickets.md` section 5.3).
- **Redeem permissions** (fail closed; lead review needed under the Children rule): `chatAllowed`/`voiceAllowed`
  are true only for 13+, email-verified, `active` accounts **and** while the policy switch
  (`METALLIC_GAME_CHAT_ENABLED` / `METALLIC_GAME_VOICE_ENABLED`, default false) is on. Under-13 and unknown age:
  always false. `canEdit` is false (no edit tickets yet). `accountStatus` is `active`, `limited` or `suspended`
  (other accounts cannot redeem).

## 5. Admin (CLI on the backend host)

```
metallic-platform host add --name home-1 --region us-central [--max-servers 8] [--max-players 500]
metallic-platform host list | host drain|disable|enable --name N | host rotate-token --name N | host reset-token --name N
metallic-platform server drain|stop SERVER_ID
metallic-platform ticket-key new --kid KID [--status active|next] [--not-before RFC3339]
```

`host add` and `host reset-token` print the token once. The owner's region code (for example `us-central`) must
exist in `matchmaker.regions` first.

## 6. Alignment points for spec section 8

Where this implementation differs from or adds to section 8 (backend names win per the lead):

1. `registerHost` also requires `engineVersion` and `protocolMajor` (the Player needs them from
   `connectJoinTicket`; section 8.3 has only `agentVersion` and `engineBuilds`).
2. `createJoinTicket` `201` also returns `ticketId` (the `jti`) and `serverId`; `202` also returns `placeId` and a
   `Retry-After` header. New `503 no_capacity` when registered hosts exist but none can take the player.
3. `getNetKeys` adds `kty`, `crv`, `use` (JWK) and a top-level `keysVersion`; `alg` is `Ed25519` as in 8.2.
4. The `start` order adds `region`; `assetHash` is always null until the asset service exists (agents load by
   `placeVersionId`).
5. `drain.reason` is `admin` or `host_draining`; `deadlineSecs` is 300.
6. `heartbeatHost` has no host-level status field; drain a host with `metallic-platform host drain`. Section 8.3
   lists none either; say if the agent should be able to request its own drain.
7. Single use is the online `redeemJoinTicket`. Heartbeats do not carry `jti`s; the edge keeps its replay set.
8. Tickets carry the display name (128 bytes max) besides 8.1's claims, so the edge can label a connection before
   redeem. `server = 0` means unbound (legacy); hosted edges must reject it.
9. Live servers of a host whose agent never called `registerHost` (per-process registration with a host token)
   resolve to their own registered facts, not an edge.
10. `chatAllowed`/`voiceAllowed` are false for everyone by default (switches above). Lead decision needed on when
    to turn them on.

## 7. Not in this change (next steps)

- M2b `POST /v1/places/{placeId}/test-sessions` and `kind: test` tickets.
- M2c `POST /v1/places/{placeId}/edit-session`, `edit-sessions/{serverId}/ops`, `places/{placeId}/versions`,
  `kind: edit` tickets and `canEdit`.
- M2d `POST /internal/v1/reports`.
- `assetHash` in `start` orders (asset service), nearest-region choice by latency (needs region coordinates), a
  Valkey-backed rate limiter for more than one API instance.
