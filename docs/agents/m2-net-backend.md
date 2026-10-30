# M2 multiplayer backend (host agents, signed tickets, allocation)

## Goal and base

Backend half of M2 multiplayer, following section 8 of the studio M2 spec (studio PR #291,
`docs/superpowers/specs/2026-10-30-multiplayer-m2-design.md`). Branch `platform/m2-net-backend`, stacked on
`platform/4-game-server-contract` (PR #11). Additive: legacy per-process servers, `jt_` tickets and the shared
secret (behind a flag) keep working.

## Implemented

- Ed25519 join tickets `mjt1.` (`server/src/matchmaker/ticket.rs`): fixed binary payload with kid, jti, iat/exp
  (at most 60 s), user, game, place, server, kind, aud `metallic-server`, region, optional ip, display name.
  Strict verification. Knock tokens `mkt1.` bound to the client IP. Byte layout and test vectors in
  `docs/m2-join-tickets.md`; vectors cross-checked with an independent Ed25519 library (Python `cryptography`).
- Keyring from `METALLIC_TICKET_KEYS_FILE` or `METALLIC_TICKET_KEYS` (active/next/retired, `notBefore`/`notAfter`
  rules); dev falls back to a random key with a warning. `GET /v1/net/keys` publishes it.
- Hosts (`matchmaker.hosts`, migration `20261030000008_m2_hosts.sql`): `mht_` tokens stored as SHA-256, printed
  once by `host add`; rotation keeps the previous token 10 minutes. Per-host rate limit, auth-failure limit per
  address. Hosts only touch their own servers and their own id.
- `registerHost`, `heartbeatHost` (orders `start`/`drain`/`stop`/`rotateToken` in the response), `rotateHostToken`.
- Race-safe placement (`allocate.rs`): per-place advisory lock, server row lock plus pending reservations, friend
  slot on 8+ servers, allocation on the host with room (region first), `202 pending` + `Retry-After`,
  `503 no_capacity` when the fleet is full, draining or silent.
- Live counts and joins exclude draining servers and silent hosts (30 s); silent hosts' servers stop at 120 s.
- Redeem adds `kind`, `canEdit`, `chatAllowed`, `voiceAllowed`, `accountStatus`. Chat/voice stay off unless the
  policy switches are on, and then only for verified, active 13+ accounts. **Needs the lead's review (Children
  rule).**
- Admin CLI: `host add|list|drain|disable|enable|rotate-token|reset-token`, `server drain|stop`, `ticket-key new`.

## Tests

`server/tests/api/m2.rs`: full host flow (pending, start order, ready, signed ticket verified with the published
key, connect with edge facts and knock token, single-use redeem, live counts), 12 concurrent joins (one
allocation; a 4-slot server gets exactly 4 tickets; one more server, not eight; 503 at the host limit), host
scoping, bad-token 401/429, rotation/reset/disable, input validation, drain and silent-host liveness. The contract
walkthrough calls all 68 operations. #11's redeem test now expects `chatAllowed`/`voiceAllowed` = false for an
under-13 account (section 8 adds the fields).

#11's three lock-wait tests (`lock_waiting_cannot_revive...`, `server_lock_wait_rechecks...`,
`redeem_lock_wait_cannot_consume...`) failed intermittently under a parallel `cargo test`: they gave the request
2 s from setting a time boundary to reaching the held row lock, and the observer 5 s in total. Under load the
request sometimes arrived after the boundary, so the observer never saw it. Test-timing only; the responses were
correct. Fixed in the tests without changing what they prove (the locked row stays unchanged, and the waiting
transaction starts before the boundary): a 20 s window (`LOCK_WINDOW_SECS`), the waiter is found exactly with
`pg_blocking_pids` against the blocker's pid, with a 40 s deadline and a clear failure if it arrives late. These three tests build their app with a
60 s request timeout (`TestApp::with_config`), since the request may now wait up to 20 s on the lock.

## Out of scope (next steps)

M2b test sessions, M2c edit sessions/ops/versions, M2d reports. Open alignment points are listed in
`docs/m2-backend-contract.md`.
