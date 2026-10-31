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

## Merge of platform/p1-backend (after #13, #16, #18, #20)

Normal merge, no rebase. Conflicts only in `server/tests/api/main.rs` (both sides' test modules kept) and the
operation count in `server/README.md` (68). `support.rs` is p1-backend's cleanup plus `TestApp::with_config` and
the legacy-secret flag. No migration collision (p1-backend ends at 000006; #11 has 000007, this branch 000008).
No `web/` folder on this base, so no spec copy.

The merged suite (61 API tests) failed intermittently under a parallel `cargo test` in timing-bounded tests:
p1-backend's `oauth_family` and `web_session_expiry` races, and readiness in the contract walkthrough. Causes were
CPU and database load, not code races. Unoptimized argon2 in dev builds made every signup and seed slow. A 20 s
guard also covered test setup (serialized template copies). There were 2 s to 7 s lock windows, and readiness had
a 2 s database budget while Windows Postgres starts a process per connection.
Fixes: `argon2` and `blake2` built with `opt-level = 3` in the dev profile (tests only; release unchanged);
`waiting_pid` deadline 30 s, race guards 120 s, unblocked operations 15 s; web-session expiry window 20 s with a
60 s request timeout (same pattern as the connection lock tests); the walkthrough waits (30 s, every answer
schema-checked) for readiness 200. What each test proves is unchanged; nothing is ignored or single-threaded.

## Security review fixes (FIX-FIRST)

No auth bypass was found. Fixed, each with a test (`server/tests/api/m2.rs` unless noted):
1. A server stuck in `starting` is measured from `started_at` (allocation time), not the last heartbeat, both in
   placement and in the stale job (`a_server_stuck_in_starting_stops_blocking_quick_join`).
2. Slot squatting: issuing a ticket expires the account's other unredeemed tickets
   (`one_account_holds_one_live_ticket_and_kinds_must_match`; index in migration 000009).
3. Only the current host token rotates. The previous token, during its 10-minute window, gets the same pending token
   back (stored encrypted with the data key, `hosts.pending_token_enc`)
   (`rotation_with_the_previous_token_returns_the_same_token_and_never_mints_another`).
4. Client IP: the forwarded header counts only from `METALLIC_TRUSTED_PROXIES` peers, right-most untrusted hop,
   `to_canonical()`; outside dev (`METALLIC_ALLOW_PRIVATE_ADDRESSES`) no knock token for non-public callers and
   hosts on non-public addresses need a public `edge.publicHost`. Tests send from the trusted proxy 127.0.0.1
   (`client_addresses_come_only_from_trusted_proxies_and_must_be_public_outside_dev`, unit tests in `http.rs`).
5. Host locks are taken for all candidate hosts in one statement in id order (no `SKIP LOCKED`: it would turn
   contention into false `no_capacity`)
   (`concurrent_allocations_across_places_and_regions_do_not_deadlock`).
6. `kind` is checked in `hold_slot` and redeem.
7. Key windows: `notBefore <= iat`, `exp <= notAfter + 5 s` in the verifier; the keyring never signs outside the
   active key's window (`ticket.rs` unit tests).
8. The published test key is refused outside dev (`config.rs` unit test).
9. Host-reported player lists vs redeemed tickets: issue #23.
