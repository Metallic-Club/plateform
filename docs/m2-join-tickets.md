# M2 join tickets, knock tokens and ticket keys

Status: implemented and tested in the backend (`server/src/matchmaker/ticket.rs`). The edge, host agent and
`metallic_net::ticket` verify against this document and its test vectors.

A join ticket is issued by `createJoinTicket` (`POST /v1/games/{gameId}/join`). It is an Ed25519 signature over a
fixed binary payload, so `metallic-edge` can check it **offline** with the public keys from `GET /v1/net/keys`. The
backend stays the online, global single-use check: the host agent redeems every ticket with `redeemJoinTicket`
before the server admits the player.

A ticket is a bearer secret for 60 seconds. Never log it or put it in a crash report. The ticket id (`jti`, as
`ticketId` in the API) is not secret and may be logged.

## 1. String form

```
ticket = "mjt1." base64url(payload) "." base64url(signature)
```

- base64url is RFC 4648 section 5 **without padding**. Decoders must reject padding, other alphabets, and
  non-canonical trailing bits.
- `signature` is the 64-byte Ed25519 signature (RFC 8032, pure Ed25519, no prehash, no context) over exactly the
  `payload` bytes. The payload's first four bytes (`MJT` 0x01) are its domain separator; a knock token uses `MKT`
  0x01, so neither can be passed off as the other.
- The whole string is at most 512 characters (the longest possible payload encodes to 474).
- The `1` in `mjt1.` and the `0x01` in the magic are the format version. A new layout gets a new prefix and magic.

## 2. Payload layout

All integers are unsigned big-endian. "short string" = one length byte `n` followed by `n` bytes.

| Offset | Size | Field | Rules |
|-------:|-----:|-------|-------|
| 0 | 4 | magic | `4D 4A 54 01` (`MJT` 0x01) |
| 4 | 1+k | `kid` | short string, 1-32 bytes of `A-Z a-z 0-9 _ -`: the signing key |
| . | 16 | `jti` | ticket id, random |
| . | 8 | `iat` | issued at, Unix seconds |
| . | 8 | `exp` | expires at, Unix seconds; `exp - iat` is 1 to 60 |
| . | 8 | `user` | user id |
| . | 8 | `game` | game id |
| . | 8 | `place` | place id |
| . | 8 | `server` | server id the ticket is bound to; **0 = not bound** (legacy deployments only) |
| . | 1 | `kind` | 1 = `play`, 2 = `edit`, 3 = `test`; anything else is malformed |
| . | 1+a | `aud` | short string, 1-32 bytes; always `metallic-server` |
| . | 1+r | `region` | short string, 0-21 bytes (`us-central`); empty = none |
| . | 1+i | `ip` | family byte then address: `00` = none, `04` + 4 bytes, `06` + 16 bytes |
| . | 1+d | `name` | short string, 0-128 bytes of UTF-8: the display name (clipped on a character boundary) |

The payload ends exactly after `name`; trailing bytes make it malformed. Ids are positive and below 2^63.

`ip` is off unless the backend runs with `METALLIC_TICKET_BIND_IP=true`. When present it is the client address
**as the backend saw it**; an edge that enforces it compares it with the QUIC client address and should allow for
NAT changes between the HTTPS call and the UDP connection (that is why it is off by default).

## 3. Verifying (edge, `metallic_net::ticket`)

In this order; any failure closes the connection with one generic error code, never the reason:

1. Length at most 512, prefix `mjt1.`, exactly one more `.`, both parts decode as unpadded base64url, the
   signature part is exactly 64 bytes.
2. Read the magic and `kid` from the payload. Find the key by `kid` among keys whose status is `active`, `next`
   or `retired` (all published keys verify). Unknown `kid`: refetch `/v1/net/keys` once (rate limited, at most
   once a minute), then fail.
3. Verify the signature with **strict** Ed25519 verification (reject non-canonical `S`, small-order `R` and
   small-order public keys; `ed25519-dalek` `verify_strict`).
4. Decode the full payload strictly (section 2).
5. `aud == "metallic-server"`.
6. `0 < exp - iat <= 60`, `iat <= now + 5 s` (clock skew), `now < exp`.
7. `server` is a live, joinable server on this host (never 0 in hosted mode), and `kind` matches it (`edit` only
   to edit sessions).
8. If `ip` is present and the edge enforces it: it matches the client address.
9. `jti` is not in the replay set; add it with expiry `exp`. Keep the set in memory until `exp`.
10. Admit, then the host agent calls `redeemJoinTicket {ticket, serverId}` (global single use, identity,
    permissions). No answer within 3 s: refuse the join.

The backend's reference verifier is `metallic_platform::matchmaker::ticket::verify` (steps 1-6).

## 4. Knock token (`connectJoinTicket.knockToken`)

For the edge's under-attack mode (spec 7.2): a valid knock allowlists one address for 10 s.

```
knock = "mkt1." base64url(payload) "." base64url(signature)
```

| Offset | Size | Field | Rules |
|-------:|-----:|-------|-------|
| 0 | 4 | magic | `4D 4B 54 01` (`MKT` 0x01) |
| 4 | 1+k | `kid` | as in tickets |
| . | 1+i | `ip` | `04` + 4 bytes or `06` + 16 bytes (never `00`): the Player's address as the backend saw it |
| . | 8 | `server` | server id |
| . | 8 | `exp` | Unix seconds; the ticket's expiry |

Signed with the same keys as tickets. The edge checks the signature, `now < exp`, `ip` equals the datagram source
address and `server` is on this host.

## 5. Keys

### 5.1 Publication (`GET /v1/net/keys`)

```json
{ "keysVersion": "3f1c0d2a9b8e7f60",
  "keys": [ { "kid": "2026-10a", "kty": "OKP", "crv": "Ed25519", "alg": "Ed25519", "use": "sig",
              "x": "<32-byte public key, base64url>", "status": "active",
              "notBefore": "2026-10-30T00:00:00Z", "notAfter": null } ] }
```

- `status`: `active` signs new tickets (exactly one); `next` is published ahead of activation; `retired` no longer
  signs and disappears from the list after its `notAfter`.
- `keysVersion` changes whenever the published set changes; host heartbeats carry it, so agents refetch at once.
  Agents also refetch every 10 minutes. The response is cacheable for 5 minutes.

### 5.2 Configuration

The backend reads a keyset (JSON) from `METALLIC_TICKET_KEYS_FILE` (a path) or `METALLIC_TICKET_KEYS` (the same
JSON, base64), never both. Neither set: dev only, a random key with a loud warning (tickets die on restart);
staging and prod refuse to start. The keyset is a secret: it holds the active private key. Never commit one.

```json
{ "keys": [
  { "kid": "2026-11a", "status": "active",  "d": "<private seed, 32 bytes base64url>", "notBefore": "2026-11-01T00:00:00Z" },
  { "kid": "2026-12a", "status": "next",    "x": "<public key>", "notBefore": "2026-12-01T00:00:00Z" },
  { "kid": "2026-10a", "status": "retired", "x": "<public key>", "notAfter": "2026-11-01T01:00:00Z" } ] }
```

Rules the backend enforces at start: 1 to 16 keys, unique `kid`s, exactly one `active` key with `d`, `x` (when
given with `d`) must match it, retired keys need `notAfter`, the active key must be inside its own
`notBefore`/`notAfter` window with at least 10 minutes left. Unknown fields are rejected.

### 5.3 Rotation runbook

1. `metallic-platform ticket-key new --kid 2026-12a --status next` prints a new entry (with `d`). Store `d` in the
   secret store. Add the entry to the keyset as `next` (you may keep only `x` there until activation) and deploy.
2. Wait **at least 1 hour** (agents refetch every 10 minutes; the response caches 5 minutes).
3. Edit the keyset: the new key becomes `active` (with `d`); the old active key becomes `retired` with only `x`
   and `notAfter` = deploy time + 60 s (longest ticket) + 10 minutes. Deploy. Its `d` can now be destroyed.
4. After `notAfter`, remove the retired entry at the next deploy (it already stopped being published).

Compromised key: make a new key `active` at once (skip the hour; edges refetch on the unknown `kid`), drop the
compromised key from the keyset entirely, and deploy. Its tickets die at once; at most 60 s of joins fail.

## 6. Test vectors

The test key is the 32-byte seed `00 01 02 ... 1f` (public key below). It is a published test key: never accept it
anywhere real. `server/src/matchmaker/ticket.rs` (`test_vectors_are_exact`) checks these strings byte for byte;
`metallic_net::ticket` must decode and verify them with the public key and `now = 1793318410`.

- `kid` = `test-2026-10`
- public key `x` = `A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg`

**Vector 1** (`play`, bound, no `ip`): `jti` = 16 x `11`, `iat` = 1793318400 (2026-10-30T00:00:00Z), `exp` =
1793318460, `user` = 1000000000000001, `game` = 1000000000000101, `place` = 1000000000001101, `server` =
4050000000000301, `aud` = `metallic-server`, `region` = `us-central`, `name` = `Ada`.

```
mjt1.TUpUAQx0ZXN0LTIwMjYtMTARERERERERERERERERERERAAAAAGrj3gAAAAAAauPePAADjX6kxoABAAONfqTGgGUAA41-pMaETQAOY3QbVyEtAQ9tZXRhbGxpYy1zZXJ2ZXIKdXMtY2VudHJhbAADQWRh.4_GX-BYlIsxEI4cKOSvmMelHM7VNt1agtMwmDhAAvljcJ34Ki9zjPBOJQ9iF0s0sWXZUlNaMo71qFw9LR2xaAg
```

**Vector 2** (`edit`, unbound, IPv4 `203.0.113.7`, no region, `name` = `Zoë` (UTF-8 `5A C3 AB`), other fields as
vector 1):

```
mjt1.TUpUAQx0ZXN0LTIwMjYtMTARERERERERERERERERERERAAAAAGrj3gAAAAAAauPePAADjX6kxoABAAONfqTGgGUAA41-pMaETQAAAAAAAAAAAg9tZXRhbGxpYy1zZXJ2ZXIABMsAcQcEWm_Dqw.qdcOECZRhd5N2dTh8Vxpfzo2kovL6RWHHqdCNr35FNvXcnK-pyyRjbffU7bVMKiPPIUfSVHFC9g6XyN7k7mCDQ
```

**Knock 1**: `ip` = `203.0.113.7`, `server` = 4050000000000301, `exp` = 1793318460, `kid` = `test-2026-10`:

```
mkt1.TUtUAQx0ZXN0LTIwMjYtMTAEywBxBwAOY3QbVyEtAAAAAGrj3jw.e9cJZHMerZQ8xPq2jELlbF2gC9P3wL1vWs4yAel8Ee4b6-rF6tbL8n-VfKI0mW1RsArKN6Ohn7AvVyozI-6gCQ
```

Negative checks every verifier must pass: flip any character of the payload or signature (fails), `now = exp`
(expired), `now = iat - 60` (not yet valid), a payload with `aud` other than `metallic-server`, `exp - iat = 61`,
a trailing byte after `name`, `kind` = 4, a padded base64 part, a `kid` that is not published.
