# Metallic platform: design

Date: 2026-10-30. Status: draft for owner approval. Author: Claude (platform design session).
Repo: `Metallic-Club/plateform` (website and backend). Engine and Studio live in `Metallic-Club/studio`.
Inputs: the owner's list `docs/platform-feature-list.md`; the engine repo's platform architecture document
(`docs/research/2026-10-30-platform-architecture.md`) and design spec sections 8 and 10; research for this design in
`docs/research/2026-10-30-platform-research.md` (cited below as R§n).
API contract: `api/openapi.yaml` (P1 endpoints).

Marking: **Owner** = the owner decided. **Lead** = the lead session decided. **Assistant's call** = I decided under the
mandate that platform architecture choices are mine; the owner may override any of them. Calls that resolve one of the
owner's "reading:" guesses carry **(confirm)** and appear again in section 14.

---

## 1. Intent

Metallic is a game platform with its own Rust engine. The platform is everything around the games: the website and
Launcher pages, accounts, friends, discovery, the server browser, the wardrobe and marketplace, currency, moderation,
and the APIs that Studio, the Player and the game servers call.

The owner wants it to feel better than Roblox: easier categories, better recommendations, better server finding, a
safer place for young players, and deep Discord ties. It must start cheap and small and still hold millions of users
"just in case".

## 2. Goals

1. One website, adapted per device, that is also what the desktop Launcher shows (Owner, engine spec §10). Tabs: Home,
   Explore, Wardrobe, Marketplace (Owner; order per the owner's list).
2. Sign-in that never puts a password into Studio, the Player or the Launcher (engine spec §8).
3. Every item on the owner's list mapped to defined behaviour (section 9), built in milestones that each end in
   something the owner can try (section 13).
4. Safety by default for minors: private by default, chat gated by age assurance, an economy that does not target
   children, a real appeals path.
5. One API contract (OpenAPI 3.1) that the web app, Launcher, Player and Studio all generate clients from.
6. A cost curve that stays low: about $0.03 per monthly active user at 1M MAU, game servers included (section 12).
7. A path to 1M+ MAU without a rewrite: module boundaries now, separate deployables when numbers demand it.

## 3. Non-goals for now

- Consoles and VR storefronts; native mobile apps (the website is mobile-friendly; store apps come after the engine's
  mobile clients).
- Creator cash-out for real money (DevEx-style). It changes the legal status of the currency (R§5) and needs counsel.
- Groups/clans with their own economies, ads and sponsored placements, voice chat infrastructure (engine milestone 2
  designs voice; the platform only issues tokens for it).
- A recommender trained with machine learning. Heuristics and co-play statistics come first.
- Building our own payment processing, age estimation or CSAM hashing. We buy or join those.

## 4. Anti-goals (failures even if they technically work)

- A child can be found, messaged or followed by an adult stranger with default settings.
- Someone loses items or currency to a bug, a duplicate request, or a scam the system could have stopped.
- A ban can be dodged by making a new account in a minute, or an innocent sibling is banned because of a shared router.
- Discovery that rewards clickbait thumbnails, bots or "free currency" scams over good games.
- Prices only in a made-up currency, so players cannot tell what they pay.
- A web page that waits on the slowest service: one slow dependency must not take Home down.
- Secrets, server addresses or personal data in git, logs or error messages.

## 5. Constraints

- Brand (Owner): name "Metallic" (never "Metallic Studios"); deep graphite/charcoal, silver/titanium, restrained violet;
  symbol-only emblem; no neon, glow, shields or starbursts.
- Licences: only permissive dependencies (MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0, PostgreSQL) in anything we ship
  or run. That rules out Redis 8 (RSAL/SSPL/AGPL), Grafana/Loki/Tempo (AGPL), MinIO (AGPL), Typesense (GPL-3), Nomad
  and Consul (BSL), and the BUSL parts of Meilisearch (R§6).
- Web frontend (Lead): Next.js App Router + TypeScript + pnpm in `web/`.
- No secrets in git. Configuration and keys come from the environment or a secret store at deploy time.
- Team of four, shared with the engine. Anything that needs a full-time operator is out.
- Nothing on the engine's milestone 1 critical path depends on the platform (engine architecture doc §1.8).

## 6. Decisions

| # | Decision | Marking | Why |
|---|----------|---------|-----|
| D1 | Backend language **Rust**: axum 0.8, tokio, sqlx 0.9 (compile-checked SQL), tower-http | Assistant's call | The team already writes Rust; shares `metallic_api_types` and protocol crates with the Player and `metallic-server`; no GC tail-latency spikes (Discord's Go to Rust case, R§4); lowest compute per request; all MIT/Apache |
| D2 | **Spec-first API**: `api/openapi.yaml` is the source of truth. TS types via `openapi-typescript` + `openapi-fetch` (MIT); the server has a contract test that every operation in the spec has a route | Assistant's call | Frontend and backend move in parallel against one file; no codegen lock-in on the server |
| D3 | **Modular monolith first**: one Rust workspace, one binary with roles (`api`, `worker`, later `realtime`, `matchmaker`), one Postgres with a schema per module | Assistant's call | Four people cannot run ten services. Module boundaries are enforced in code so a module can move out later |
| D4 | **PostgreSQL 18**, managed with high availability (PlanetScale Postgres on AWS us-east-1 at first) | Assistant's call | Accounts and the currency ledger need strong consistency and point-in-time recovery; managed HA avoids night-time failover work. Revisit self-hosting at 1M MAU (section 12) |
| D5 | **Valkey** (BSD) for sessions, cache, rate limits, presence, live counts, join tickets | Assistant's call | Redis 8 is not permissive |
| D6 | **NATS** (Apache-2.0) for events and fan-out from P2; until then a Postgres outbox table and `SKIP LOCKED` job queue | Assistant's call | Fewer moving parts in P1 |
| D7 | **Cloudflare** in front of web and API (DNS, TLS, WAF, DDoS, CDN); **R2** for assets and thumbnails | Assistant's call | Asset downloads dominate bandwidth; R2 has no egress fees (R§7) |
| D8 | **Hetzner** for API, workers and game servers (US-East Ashburn first; US-West and EU next); **OVHcloud Game** servers for regions or games that draw DDoS | Assistant's call | Several times cheaper than hyperscalers for steady load, US and EU sites, included traffic (R§7) |
| D9 | No Kubernetes, Nomad or Agones at first. A host agent on each game host plus our matchmaker allocate processes | Assistant's call | Matches the engine architecture doc §1.9; Nomad is BSL; Kubernetes is an operator job |
| D10 | Search on Postgres (full text + `pg_trgm`) until it hurts, then OpenSearch (Apache-2.0) | Assistant's call | Typesense GPL, Meilisearch partly BUSL |
| D11 | Observability: OpenTelemetry SDKs, VictoriaMetrics, Jaeger, Perses dashboards; no Grafana | Assistant's call | Licence rule |
| D12 | Next.js runs self-hosted (`output: "standalone"`) on the same Hetzner hosts behind Cloudflare | Assistant's call | Avoids per-request platform fees at scale; one deploy story |
| D13 | **Quick play opens a separate, fast-starting Player window**, not a game inside the Launcher window | Assistant's call (engine §10 left it open) | Same as Roblox; no native surface beside a web view; the Launcher stays stable when a game crashes |
| D14 | Native apps sign in with OAuth 2.0 device flow (RFC 8628) or authorization code + PKCE on a loopback redirect (RFC 8252); website uses an HttpOnly session cookie | Assistant's call | No passwords in native apps (engine spec §8) |
| D15 | One platform currency, working name "credits", bought with money; no paid random items anywhere on Metallic | Assistant's call (confirm name) | EU CPC principles and DSA minors guidance (R§1, R§5); simplest safe rule |

## 7. Services and boundaries

Modules live in one Cargo workspace under `server/`. Each module owns its Postgres schema; no module reads another's
tables. Modules call each other through Rust traits in-process today; the same traits become HTTP/NATS clients if a
module moves out.

| Module | Owns | Talks to | Deployable role |
|--------|------|----------|-----------------|
| `identity` | Accounts, credentials, sessions, OAuth clients and tokens, device codes, email verification, username rules, age band, person/alt links | `moderation` (account state), email sender | api |
| `social` | Friends, requests, blocks, privacy settings, social links, presence | `identity`, Valkey, `realtime` | api, realtime |
| `games` | Games, places, versions, genres, media, ratings, favourites, play sessions and history, creator dashboard data | `assets`, `moderation` | api, worker |
| `discovery` | Home rows, Explore lists, search, similar games, ranking jobs, curated rows | `games` (read models), Valkey | api, worker |
| `matchmaker` | Regions, hosts, server processes, join tickets, live counts, server list | `games`, host agents, game servers | matchmaker |
| `assets` | Uploads, content hashes, scanning, R2 storage, signed URLs, thumbnails and avatar renders | `moderation`, R2 | api, worker |
| `catalog` | Avatar items, inventory, avatars, outfits; later listings and trades | `economy`, `assets` | api |
| `economy` | Ledger accounts, transactions, balances, payment orders, refunds, chargebacks, gifts | payment provider | api, worker |
| `moderation` | Reports, cases, automated flags, actions, statements of reasons, appeals, text filter, audit log | everything (as subject) | api, worker |
| `notify` | Email, in-site notifications, push to `realtime` | email provider, NATS | worker |
| `realtime` (P2) | WebSocket gateway for presence and notifications | Valkey, NATS | realtime |

```mermaid
graph LR
  WEB["Next.js web (browser + Launcher web view)"] -- "HTTPS /v1 (cookie)" --> API
  LAUNCH["Launcher / Player / Studio"] -- "HTTPS /v1 (bearer)" --> API
  LAUNCH -- "WebSocket (P2)" --> RT["realtime"]
  API["api role: identity, social, games, discovery, catalog, economy, moderation, assets"] --> PG[("Postgres 18")]
  API --> VK[("Valkey")]
  WK["worker role: jobs, ranking, renders, deletions"] --> PG
  WK --> R2[("R2 + CDN")]
  API --> R2
  RT --> VK
  MM["matchmaker role"] --> VK
  MM --> PG
  GS["metallic-server processes"] -- "outbound: register, heartbeat" --> MM
  HA["host agent per game host"] -- "outbound: capacity, start/stop" --> MM
  LAUNCH -- "UDP/QUIC game protocol" --> GS
  API -. "events (P2+)" .-> NATS[("NATS")]
  WK -. .-> NATS
  RT -. .-> NATS
```

Public surface: only Cloudflare, the web/API hosts, the realtime gateway and game servers accept internet traffic.
Host agents and game servers dial out to the matchmaker; nothing on a game host accepts control connections.

## 8. Data model (core tables)

IDs are 64-bit integers from a time-ordered generator (Snowflake-style: 41-bit milliseconds, 10-bit worker, 12-bit
sequence), exposed as strings. All timestamps `timestamptz`. Schemas named after modules.

### identity
| Table | Key columns |
|-------|-------------|
| `users` | `id`, `username` (citext, unique), `display_name`, `display_name_changed_at`, `bio`, `email_ciphertext`, `email_hash` (HMAC, for lookups), `email_verified_at`, `birth_date_ciphertext`, `age_band`, `age_assurance_level` (none, self_declared, estimated, verified), `status` (active, limited, suspended, banned, pending_deletion), `delete_after`, `person_id`, `is_first_party`, `created_at` |
| `credentials` | `user_id`, `password_hash` (Argon2id), `updated_at` |
| `mfa_factors` | `id`, `user_id`, `kind` (totp, webauthn), `secret_ciphertext` or `credential_public_key`, `created_at`, `last_used_at` |
| `sessions` | `id_hash`, `user_id`, `created_at`, `last_seen_at`, `expires_at`, `ip_hmac`, `user_agent`, `revoked_at` |
| `device_authorizations` | `device_code_hash`, `user_code`, `client_id`, `scopes`, `status`, `user_id`, `expires_at`, `last_polled_at` |
| `refresh_tokens` | `token_hash`, `family_id`, `user_id`, `client_id`, `scopes`, `parent_hash`, `expires_at`, `revoked_at` |
| `email_tokens` | `token_hash`, `user_id`, `purpose` (verify, reset, parent_consent), `expires_at`, `used_at` |
| `username_history` | `user_id`, `old_username`, `new_username`, `changed_at` |
| `name_holds` | `name_lower`, `reason` (rename, deletion, reserved, brand, staff), `holder_user_id`, `hold_until`, `release_after` |
| `persons` | `id`, `created_at`, `banned_until`, `ban_reason_code` |
| `account_links` | `user_id`, `person_id`, `link_kind` (same_email, declared, phone, payment, install, ip_review), `strength` (strong, weak), `created_at`, `confirmed_by` |
| `signup_signals` | `user_id`, `ip_hmac`, `install_id_hmac`, `asn`, `created_at` (kept 180 days) |
| `parental_consents` | `child_user_id`, `parent_email_hash`, `method`, `granted_at`, `revoked_at`, `settings_json` |

### social
`friendships(user_low, user_high, since)` with `user_low < user_high`; `friend_requests(id, from_user, to_user,
created_at)`; `blocks(blocker, blocked, created_at)`; `user_settings(user_id, theme, language, presence_visibility,
join_policy, friend_requests, social_links_visibility)`; `social_links(user_id, platform, handle, external_id,
verified_at)`. Presence lives in Valkey only (`presence:{user}` with a 60 s TTL).

### games
`games(id, owner_kind, owner_id, name, description, genres[], content_label, status (draft, private, friends, public,
under_review, removed), max_players, is_first_party, start_place_id, created_at, updated_at)`;
`places(id, game_id, live_version_id)`; `place_versions(id, place_id, asset_hash, published_by, created_at)`;
`game_media(game_id, kind, asset_hash, position)`; `genres(id, name, description, position)`;
`ratings(user_id, game_id, vote, updated_at)`; `rating_totals(game_id, up, down)`; `favorites(user_id, game_id,
created_at)`; `play_sessions(id, user_id, game_id, server_id, started_at, ended_at)` partitioned by month;
`play_history(user_id, game_id, last_played_at, minutes, hidden)`; `game_stats_daily(game_id, day, visits, players,
minutes, qualified_sessions, d1_returners, impressions, organic_plays)`.

### matchmaker
`regions(code, name, probe_url, active)`; `hosts(id, region, cores, memory_mb, status, agent_version,
last_seen_at)`; `servers(id, game_id, place_id, host_id, region, status (starting, running, draining, stopped),
max_players, started_at, stopped_at)`. Hot state in Valkey: `server:{id}` (players, joinable, last heartbeat),
`game:{id}:servers` sorted by player count, `ticket:{t}` (60 s TTL), `live:game:{id}`.

### assets
`assets(hash, size_bytes, content_type, kind, uploaded_by, scan_status, moderation_status, created_at)`;
`asset_owners(hash, owner_kind, owner_id)`. Files live in R2 at `assets/{hash}`; URLs are immutable.

### catalog
`items(id, creator_kind, creator_id, category, name, description, asset_hash, price, on_sale, limited_supply,
limited_remaining, status, created_at)`; `inventory(id, user_id, item_id, serial, source, acquired_at,
trade_lock_until)`; `avatars(user_id, body_colors, equipped_inventory_ids[], updated_at)`; `outfits(id, user_id, name,
body_colors, inventory_ids[])`. Later: `listings`, `trades`, `trade_items`.

### economy
`ledger_accounts(id, owner_kind (user, game, creator, platform, system), owner_id, currency, bucket (available,
escrow, giftable_hold))`; `ledger_transactions(id, kind, idempotency_key unique, initiated_by, reference_kind,
reference_id, created_at)`; `ledger_entries(transaction_id, account_id, amount)` with a deferred constraint that each
transaction sums to zero; `balances(account_id, amount, updated_at)` updated in the same database transaction;
`payment_orders(id, user_id, provider, provider_ref, money_amount, money_currency, credits, status, created_at)`;
`disputes(id, payment_order_id, status, opened_at, resolved_at)`; `gifts(id, from_user, to_user, kind, amount_or_item,
status, created_at)`.

### moderation
`reports(id, reporter_id, target_kind, target_id, category, details, created_at, status)`;
`cases(id, subject_kind, subject_id, priority, assignee, status, created_at)`;
`actions(id, case_id, subject_user_id, subject_person_id, kind (warn, remove_content, mute, suspend, ban),
reason_code, statement_of_reasons, starts_at, ends_at, created_by, automated)`;
`appeals(id, action_id, user_id, text, status, decided_by, decided_at)`; `flags(id, source, target_kind, target_id,
score, created_at)`; `audit_log(id, staff_id, action, target, at, details)` (append-only).

## 9. The owner's list, mapped to behaviour

### 9.1 Navigation
Home, Explore, Wardrobe, Marketplace, in that order (Owner's list, reading confirmed by its order). Profile, friends,
settings and the currency balance sit in the top bar. Inside the Launcher the web app detects the host (a user-agent
token plus a `window.metallic` bridge object) and hides "download" prompts; Play buttons call the join endpoint and
open the returned `metallic://` link.

### 9.2 Accounts and safety

**Secure login.** Website: username or email plus password (Argon2id at OWASP's minimum or stronger, R§6; minimum 10
characters; breached-password check with a local k-anonymity list; no composition rules), optional TOTP and passkeys
(webauthn-rs, MPL-2.0) from P1, captcha after failures, generic error messages, lockout by rate limit not by account
freeze. Native apps: device flow or PKCE (D14); access tokens 15 minutes, rotating refresh tokens with reuse detection.
Staff accounts must use passkeys.

**Profiles.** Display name (1-32 characters, any script, filtered; change every 7 days), bio (1,000 characters,
filtered), avatar headshot, social links (Discord, YouTube, Twitch, TikTok, X, Bluesky, Instagram, GitHub). P1 stores
handles only and builds the URL server-side (no free-form links). Verified badges come from OAuth linking (Discord in
P2; others later). Social links are hidden for under-16s, matching Roblox's 16+ rule for off-platform links (R§2), and
need age assurance before they show to anyone.

**Friends.** Mutual friends with requests; limit 500 (Assistant's call); one-click block that also removes friendship
and hides each party from the other everywhere. Friend requests from strangers are off by default for under-13s
(friends-of-friends only) and need a parent's approval when parental controls say so.

**Verification and auto-deletion** (Owner: "deleted if not verified within a month"). Assistant's call **(confirm)**:
"verify" means confirming an email address by link or 6-digit code. Under-13 accounts count as verified when a
parent confirms by email. Rules:
- An unverified account can play and edit its avatar, but cannot chat, add friends, rate, buy, receive gifts, publish
  games or change its username.
- Reminders go out on day 1, 7, 21 and 28. On day 30 a daily job deletes the account: personal data erased,
  username held 30 days then released (see name sniping), play-session rows anonymised. `Me.verification.deleteAfter`
  in the API shows the date.
- Accounts created by the first-party staff tool are exempt.

**Alts: up to 5 accounts per person** (Owner wrote "minimum"; Assistant's call **(confirm)**: maximum 5).
- A "person" is a cluster of accounts the system believes one human controls (`persons` + `account_links`).
- One email address can verify at most 5 accounts. Accounts verified with the same email are linked as one person
  automatically. This makes the honest path easy and visible: the Launcher and site offer an account switcher for the
  linked accounts.
- Strong links also come from: the same verified phone number (if the user adds one for 2FA), the same payment
  instrument fingerprint, and the same Launcher install id used to sign in to both accounts within 30 days.
- Sign-up or verification that would make a sixth account in a person is refused with a clear message.
- Weak links (shared IP or ASN only) never count toward the limit and never ban anyone by themselves. They raise a
  review flag when combined with suspicious behaviour (sign-up bursts, reports, ban evasion patterns).

**Many accounts from the same IP** (Owner wrote "ai address"; Assistant's call **(confirm)**: IP address).
Detection, not punishment, because households, schools and mobile carriers put many people behind one address (R§2):
- Sign-up throttle per IP: 3 per 24 h freely, then captcha, then from 10 per 24 h a manual-review hold, except for IP
  ranges marked shared (schools, carrier NAT) where the throttle is per install id instead.
- Raw IPs are kept 30 days in security logs. For linking we keep a keyed HMAC of the IP and the ASN for 180 days.
- Moderators see "N accounts share signals with this one" with the signal kinds, never raw IPs.

**A ban on one account bans all of that person's alts** (Owner). Suspensions and bans apply to the person: every
strongly linked account gets the same action and the same end date. Weakly linked accounts get a review case, not an
automatic ban. A new account that strongly links to a banned person is refused at sign-up or banned on link
("ban evasion" is its own reason code). Unbanning the original account lifts the person-level action; an appeal
on a wrongly linked account can unlink it. Warnings and content removals stay per account.

**Name sniping is not allowed** (Owner). Assistant's call **(confirm)** on what it covers:
- Freed names (rename, deletion, unverified-account deletion) are held: 90 days after a rename (the old owner can take
  it back), 30 days after deletion. When a hold ends the name returns to the pool at a random time in the following
  7 days, so no bot can wait on the exact second.
- Reserved names: Metallic staff and product names, a brand list, and well-known creators who ask with proof. Names
  impersonating staff ("metallic_admin") are blocked by the filter.
- No taking names from inactive accounts, no selling or trading names (a ban reason), username-check endpoint rate
  limited and captcha-protected after 30 checks an hour.
- Username changes: first change free after the account is 30 days old, then once every 90 days.
  Rules: 3-20 characters, letters, digits and single underscores, case-insensitive unique, filtered.

**Age.** Birth date at sign-up sets an age band (under 13, 13-15, 16-17, adult). Before any chat or voice ships
(P2, engine M2), users need age assurance through a vendor (facial age estimation, or ID for 13+), as Roblox did
(R§1.1). Chat then follows age bands: same or neighbouring bands only; under-13 chat off until a parent consents.
UK users must pass assurance before features Ofcom treats as higher risk. Parental controls (P2): a linked parent
account sets chat, friend requests, spending limit and play time, and sees a weekly summary.

### 9.3 Good moderation

- **Reporting everywhere**: profiles, games, items, display names, chat lines (from the Player, P2), servers. Categories
  map to UK and EU illegal-harm categories plus our rules. Reporters get a decision notice.
- **Queues by severity**: child safety and threats first (target: triage within 1 hour around the clock once public),
  then harassment, scams, cheating, other. Automated flags add to the same queues.
- **Text**: every user string (names, bios, game titles and descriptions, item names, chat) goes through one filter
  service with per-locale lists; under-13s get the strict mode (no links, no numbers that look like contact details).
  A classifier comes later; Roblox Sentinel (Apache-2.0) is a model for spotting grooming patterns per user (R§1.1).
- **Images and uploads**: hash matching against known CSAM (apply for PhotoDNA; PDQ hashing as a fallback), a nudity
  and violence classifier, and human review of a new creator's first uploads. Confirmed CSAM is removed, preserved
  1 year and reported to NCMEC (US law, R§1).
- **Games**: creators fill a content questionnaire that sets the label (everyone, mild, moderate; restricted later and
  only for age-assured adults). A new creator's first public game is reviewed before it lists. Unlabelled games are
  not playable by anyone, as on Roblox (R§1.1).
- **Actions**: warn, remove content, mute (chat), suspend (1, 3, 7, 30 days), ban. Strikes expire after 180 days.
  Every action stores a statement of reasons the user can read (DSA Art. 17).
- **Appeals**: in-site, free, open 6 months, decided by a person who did not take the action (DSA Art. 20, R§1).
- **Staff tools**: an admin area inside the Next.js app on its own route group, staff passkeys only, every view of
  personal data and every action written to the append-only audit log.
- **Transparency**: a yearly report of reports, actions and appeal outcomes. We may qualify for the DSA small-enterprise
  exemption at first (R§1); we build to the full rules anyway because the UK OSA has no such exemption.

### 9.4 Discovery

**Home** rows, in order, each with a visible reason line (`HomeSection.reason`): Continue playing, Friends are playing,
Featured (curated, says so), Recommended for you, Made by Metallic, Popular now, Trending, New and rising. Signed-out
visitors see Featured, Made by Metallic, Popular.

**Explore: easier categories.** A fixed list of about 16 genres with a one-line description each (Obby & Parkour,
Shooter, Roleplay, Simulator, Tycoon, Horror, Racing, Sports, Fighting, Survival, Puzzle, Building, Adventure,
Strategy, Party, Social), chosen by the creator (up to 3) and checked by moderation. Filters: players per server,
device, rating, "friends play this", first-party only. Sorts: popular, top rated, trending, new, recently updated.

**Ranking v1** (P2, published to creators): only organic plays count; only sessions of 60 s or more from verified
accounts 3+ days old. Score from qualified play-through rate, day-1 return rate, median minutes per player and the
Wilson lower bound of the rating; bounce rate subtracts. These follow what Roblox and Epic publish (R§3). Duplicate or
misleading metadata and thumbnails lower a game's score or remove it from genre rows.

**New games get a fair test**: 10% of slots in Popular, Recommended and genre rows go to games in their first 14 days,
each up to a fixed impression budget scaled to platform size, like Fortnite's test window (R§3).

**Better recommendations** (Owner): P2 item-to-item co-play ("people who played X for 10+ minutes also played Y"),
computed nightly; P3 personal rows from the last 30 days of play, favourites and ratings. For minors, explicit signals
(favourites, ratings, genres picked at onboarding) count more than behaviour (DSA minors guidelines, R§1). A setting
turns personal recommendations off.

**Ratings**: thumbs up or down after 10 minutes of total play, from email-verified accounts at least 3 days old; the
percentage shows from 20 votes; sorting uses the Wilson lower bound. Sudden vote swings from new accounts freeze the
displayed number for review.

**Play history and favourites**: history is written by the matchmaker when a session ends, kept 2 years, hideable per
game (also removes it from recommendations); favourites capped at 1,000.

**Search**: Postgres full text plus trigram similarity over names, creators and genres; typo tolerant. OpenSearch when
query volume or features need it (D10).

**First-party games** (Owner): games from the Metallic account carry a badge and get their own row. They get no boost
in algorithmic rows (Assistant's call **(confirm)**), so creators can trust the ranking.

### 9.5 Economy and trading

**Money and in-game currency** (Owner). One currency (D15). Bought on the website and in the Launcher through Stripe;
Managed Payments as merchant of record at first so we do not register for VAT and sales tax in dozens of places
(+3.5%, R§5). Mobile store apps must use Apple and Google purchase when they exist (R§5).
- Every price shows its real-money value next to the credits (EU CPC principle 1, applied worldwide).
- Packs plus a custom amount, so nobody is forced to buy more than they need (CPC principle 3).
- Credits never expire.
- Under-13: no purchase without a parent's approval and a parent-set monthly limit (default 0). 13-17: a default
  monthly limit the user can see, raised only by a linked parent.

**Ledger.** Double-entry, append-only. Each change is a transaction whose entries sum to zero across ledger accounts
(user available, user giftable hold, game revenue, creator escrow, platform revenue, system mint and burn). Every
write carries an idempotency key; retries cannot double-charge or double-credit. Balances update in the same database
transaction. A nightly job re-sums all entries and pages a human on any mismatch.

**Ways to earn free currency** (Owner). Small and hard to farm:
- Daily play reward after 15 minutes of play in any game, from verified accounts; capped per day and week; counted by
  our game servers, not by clients.
- First-party events and achievements.
- From P4, creators can pay rewards out of their game's own earned balance.
- No offer walls and no "watch an ad for credits" for minors. Games promising "free credits" are removed as scams.

**Gifts** (Owner: currency and accessories). Both sides verified; friends for at least 7 days; sender 13+; recipient
under 13 needs parental approval on; daily caps; purchased credits become giftable 72 hours after purchase (so a
chargeback cannot launder them); gifted credits cannot be re-gifted for 7 days. Item gifts buy a catalog item for a
friend.

**Refunds and chargebacks.** Unspent purchased credits are refundable within 14 days on request worldwide (covers the
EU withdrawal right). A catalog purchase can be undone within 48 hours if the item was not gifted or traded, three
times per 30 days (like Steam's 48-hour rule for unconsumed items, R§5). On a chargeback we reverse the credits; if
they were spent the balance goes negative and spending pauses until it is positive again. We never lock the account
for disputing a charge (FTC order against Epic, R§1).

**Paid random items** (loot boxes): not allowed on Metallic, for creators or first party (D15).

**Trading** (Owner), P4, Assistant's call **(confirm)** on the rules:
- Only limited items; items for items, no credits in trades (keeps the currency closed and reduces real-money trading).
- Both sides: 16+ with age assurance, verified email, 2FA on for at least 7 days, account at least 30 days old.
- A trade completes 24 hours after both accept; either side can cancel in that window and support can reverse trades
  from compromised accounts. Items received by trade cannot be traded again for 7 days (Steam uses holds of up to
  15 days, R§2).
- Warnings when one side gives far more than recent sale prices; daily trade caps; real-money trading and account
  sales are ban reasons.
- No duplication: each copy is one `inventory` row with a serial; a trade moves rows in one database transaction.
- Fraud signals: one-way value flows into one account, many new accounts feeding one, value moving right after a
  password change.

**Creator earnings** (P3-P4): game passes and in-game items in a creator's game pay 70% to the game's owner
(Assistant's call; Roblox's game-pass share was not verified this session), held in escrow for 7 days. Marketplace
sales pay the item creator 30% with a 30-day escrow, as Roblox does (R§5). Cash-out for real money is a non-goal for
now.

### 9.6 Wardrobe and Marketplace

- **Wardrobe** (tab 3): owned items by category, the avatar editor (body colours, one item per slot, up to 5
  accessories), up to 50 saved outfits, headshot and full-body renders made by a worker within a minute of a change.
- **Marketplace** (tab 4): browse by category, search, sort, item page with real-money value, buy, gift. P3 sells
  first-party items. P4 opens creator uploads: 16+ with age assurance and 2FA, non-refundable upload fee in credits
  (spam brake), automated checks plus human review of a creator's first items, limited items with fixed supply and
  serials, resale of limiteds with 70% to the seller, 10% to the creator and 20% to Metallic (Assistant's call).

### 9.7 Games and servers

**Game management for creators** (Owner): the Creator area of the site. Create a game, publish place versions from
Studio (device-flow token with the `publish` scope), edit the page, thumbnails and screenshots, genres, content
questionnaire, visibility (private, friends, public), server settings (max players 1-200, regions), live and daily
stats (visits, CCU, minutes, qualified play-through, day-1 return, revenue), moderation status, and later
collaborators and groups.

**Server activity and live player counts** (Owner). Game servers are our own `metallic-server` processes, so counts
come from authenticated connections, not from creator code or clients:
- Each server heartbeats every 5 s to the matchmaker with its player list. Live counts per game are sums in Valkey,
  served with a 15 s cache (`/v1/games/live`), never older than 30 s.
- Every minute a worker snapshots counts into Postgres for charts (per game and platform-wide).

**In-game server browser and better server finding** (Owner). One list, used by the website and by the Player's
in-game menu (same API): friends' servers first, then by sort; filters for region, hide full, fresh servers; ping from
region probes (`/v1/regions`); join a specific server, join a friend (respecting their join setting), or quick join.
Quick join scores servers by region ping, friends present, and fill (prefers 60-90% full so games feel alive), and asks
the host agent for a new process when none fits. Private servers for friends come in P3. Server addresses never
appear in the API: joining is by a single-use 60-second ticket.

### 9.8 Community and Discord

- P1: Discord handle as a social link; an official Metallic Discord server linked from the site footer.
- P2: "Link Discord" through OAuth2 with the `identify` scope only, which gives a verified badge (R§4). Linking is
  not a sign-in method (alt rules stay on email). Not offered to under-13s (Discord requires 13+).
- P3: Discord Linked Roles for the official server (roles such as "verified player" and "creator"; never age), and
  Rich Presence with a join button from the Player through the Discord Social SDK (R§4).
- P4: creators can show their game's Discord server on the game page, visible to viewers 13+ only.
- Later: a Metallic bot for release notes and game update posts.

### 9.9 Themes
Site themes Graphite (default dark), Titanium (lighter dark), Light, and System, all inside the brand palette: violet
only for focus and primary actions, no glow or neon. The theme is stored on the account (`Settings.theme`) so the
website, the Launcher and Studio's web panels match. A high-contrast variant follows in P2 for accessibility.

### 9.10 Backend APIs and API docs
- The public API is the OpenAPI file. The site renders it at `/developers/api` with Scalar (MIT, R§6). Versioned by
  path (`/v1`); additive changes only within a version; deprecations announced 90 days ahead with a `Deprecation`
  header.
- P4: creator API keys scoped per game (read stats, list and shut down servers, publish versions, ban from a game with
  the person-level alt option, send in-game announcements), webhooks (purchase, refund, moderation outcome) signed
  with HMAC, per-key rate limits. OAuth apps for third parties later, like Roblox Open Cloud (R§4).
- Game data storage (DataStore-like per-game key-value) is a platform service that arrives with engine milestone 2-3;
  Postgres tables partitioned by game first. Its API is designed with the engine team.

## 10. Security and privacy

- **Transport and edge**: TLS everywhere, HSTS, Cloudflare WAF and bot rules, strict CSP on the website.
- **Sessions**: opaque 256-bit tokens stored hashed; cookie `HttpOnly; Secure; SameSite=Lax`; CSRF token on unsafe
  methods; sessions listed and revocable in settings; password change revokes all other sessions and refresh tokens.
- **Tokens for native apps**: device codes with high entropy, user codes from RFC 8628's 20-letter alphabet with
  attempt limits and a 10-minute life; the approval page names the app and warns about codes sent by strangers
  (R§6). Refresh tokens rotate; reuse revokes the family.
- **Join tickets**: single use, 60 s, bound to user, place and server.
- **Rate limits** on every endpoint by user, IP and token (Valkey token buckets); stricter on auth, username checks,
  friend requests, reports and money.
- **Money paths**: idempotency keys, serialisable transactions for transfers, nightly reconciliation, payment webhooks
  verified by signature, no client-supplied prices.
- **Personal data**: email and birth date encrypted at the application layer (keys from the secret store); lookups by
  keyed HMAC. Raw IPs 30 days, HMAC'd IPs 180 days, play sessions 2 years, chat logs (P2) 90 days unless held for a
  case. Data export and deletion from settings (GDPR Art. 15, 17). A written retention policy and security program
  (COPPA 2025, R§1).
- **Children**: private by default; no personalised ads (we run no ads); no third-party data sharing; parental
  consent before any data leaves us.
- **Staff**: least privilege roles (support, moderator, senior moderator, economy admin, engineer), passkeys, audit log,
  no production database access without a ticket and a second person.
- **Secrets**: none in git; `.env.example` lists names only; production secrets in the host's secret store.
- **Supply chain**: `cargo deny` (licences and advisories) and `pnpm audit` in CI; lockfiles committed; Renovate-style
  updates weekly.

## 11. Scale plan

Planning ratios (Judgment): DAU = 30% of MAU, peak concurrent users (CCU) = 3% of MAU, about 0.2 API requests per
second per online user at peak, 20 players per game server on average.

| Stage | Users | Shape |
|-------|-------|-------|
| A | up to 100k MAU, 3k CCU, ~600 req/s | One region (US-East). 2-3 api nodes running all modules, 1 worker node, managed HA Postgres, Valkey primary + replica. Outbox jobs in Postgres. |
| B | up to 1M MAU, 30k CCU, ~6k req/s | Roles split onto their own nodes (api, realtime, matchmaker, worker). Postgres read replicas for discovery and catalog reads; `play_sessions`, `ledger_entries` partitioned by month. Valkey cluster, NATS cluster, ClickHouse (Apache-2.0) for event analytics. Game-server regions US-East, US-West, EU. Cloudflare caches signed-out GETs (home, game pages, catalog) for 15-60 s. |
| C | 10M+ MAU | Economy gets its own database. Users sharded by id range behind the identity module. Read-mostly data replicated per region. Cells: each region's API serves its own players and fails alone. Search moves to OpenSearch. |

Rules that make the next stage a move, not a rewrite:
- No cross-module SQL joins; modules expose read models.
- Every list is cursor-paginated and bounded; no unbounded queries.
- Hot read paths (home, game detail, live counts, presence) never block on more than one Postgres query and cache in
  Valkey; if Valkey is down they degrade (stale counts, no presence) instead of failing.
- Every external call has a timeout and a circuit breaker (tower middleware).
- Load tests before each stage change: P2 exit needs a test at 3x the expected peak.
- Lessons from Roblox's 73-hour outage (R§6): no single shared cluster for everything, monitoring that does not
  depend on what it monitors, a tested cold start.

Latency targets (server time, p99): game detail 100 ms, home 150 ms, join ticket 150 ms, presence change visible to
friends in under 2 s (P2).

## 12. Hosting and monthly cost

Prices from R§7 (seen 2026-10-30, before VAT; €1 = $1.08 assumed). Platform = everything except game servers. Staff,
moderators, legal, age-assurance checks per user and payment fees are not included.

| Item | 1k MAU | 100k MAU | 1M MAU |
|------|--------|----------|--------|
| API + web nodes (Hetzner) | 2x CCX13: $95 | 3x CCX23: $285 | 6x AX102 (16 cores): $1,300 |
| Workers, realtime, matchmaker | on the API nodes | 2x CCX23: $190 | 6x AX102: $1,300 |
| Postgres, managed HA | PS-10 class: $39 | PS-320 class (4 vCPU, 32 GB): $700 | primary + replicas, economy split: ~$3,500 (Judgment) |
| Valkey | on the API nodes | 2x CCX23: $190 | 3x AX42: $320 |
| NATS | none | 3x CCX13: $145 | 3x AX42: $320 |
| Analytics (ClickHouse) | none | none | 3x AX102: $650 |
| Observability | 1x CCX13: $48 | 2x CCX23: $190 | 2x AX102: $430 |
| R2 storage + operations | ~$1 | ~$60 (2 TB) | ~$700 (20 TB, CDN in front) |
| Cloudflare plan | $0-25 | $25-250 | $250 to enterprise quote |
| Email | ~$1 | ~$30 | ~$300 |
| **Platform subtotal** | **~$200** | **~$2,000** | **~$9,000-12,000** |
| Game servers | 1x AX41 or CCX33: $70-150 | ~6x AX102 across 2 regions: ~$1,300 | ~50 hosts across 3 regions, some OVH Game for DDoS: ~$11,000-20,000 |
| **Total** | **~$300-350** | **~$3,300** | **~$20,000-32,000** |
| Per MAU | $0.30 | $0.03 | $0.02-0.03 |

Game-server sizing assumes about 800 light concurrent players per 16-core host at peak plus 30% headroom (Judgment;
measure in engine M2). The same platform on a hyperscaler with managed everything would cost roughly 2.5-4x more,
mostly in compute and egress (Judgment). Age assurance costs money per check; budget it once a vendor quotes.

Why not a hyperscaler from day one: we would pay for elasticity we do not need while traffic is small and steady.
Why managed Postgres anyway: losing the ledger is the one failure we cannot afford. If PlanetScale's cross-provider
latency from Hetzner Ashburn to AWS us-east-1 is above 2 ms p99 in P1 testing, the API moves to AWS us-east-1 with
the database (Judgment: both sit in the Ashburn area).

## 13. Milestones

Each milestone ends in something the owner can do. Engine milestones from the engine design spec §6 and architecture
doc §1.8.

| Milestone | Runs with | Delivers | Owner can try |
|-----------|-----------|----------|---------------|
| **P0** design | now | This document, research, OpenAPI P1, working agreement, backend scaffold | Read and approve |
| **P1** accounts and catalog | engine M1A-M1D | Sign-up, email verification and the 30-day deletion job, login, TOTP/passkeys, device and PKCE sign-in, profiles, settings and themes, friends and blocks, alt linking by email and the 5-account limit, username rules and holds, games list/detail/search/genres with first-party seed data, favourites, ratings, report button and a minimal staff tool (ban person, remove content, statement of reasons), asset upload and serve by hash, Studio publish endpoint, the web app on the real API, staging environment | Make an account on the site, verify, add a friend, favourite Parkour, sign Studio in with a code, publish a test game and see it listed |
| **P2** play together | engine M2a-M2d (server, multi-client, Team Create, Launcher) | Matchmaker and host agent, join tickets, `metallic://` launch from the site and Launcher, server browser, live counts, play history, presence over the realtime gateway, home rows and ranking v1, co-play "similar games", age assurance vendor, chat age bands, parental controls v1, Discord account link, report from the Player, appeals | Click Play on the site, the Player opens, join a friend's server from the browser, see live counts move |
| **P3** wardrobe and currency | engine M3-M4 | Avatar items, wardrobe and outfits, marketplace for first-party items, Stripe purchase of credits with merchant of record, ledger, daily play reward, gifts, refunds and chargeback handling, game passes for creators with escrow, private servers, personal recommendations, Linked Roles and Rich Presence, transparency report | Buy credits in test mode, buy and wear an item, gift a friend an accessory |
| **P4** creator economy and trading | engine M5-M7 (toolbox, marketplace at scale) | UGC uploads with review, limited items and resale, trading with holds, creator API keys and webhooks, public API docs, creator payouts only if the owner approves cash-out | List a creator item, trade two limiteds between test accounts |
| **P5** scale out | when stage B numbers approach | Role split, read replicas, partitions, NATS and Valkey clusters, ClickHouse, more regions, load tests | Watch a load test at 3x peak hold its targets |

Before public launch (between P2 and P3): UK OSA risk assessments, DSA-ready notice and appeals, privacy policy and
terms reviewed by counsel, a 24/7 child-safety moderation rota, CSAM hash matching live.

## 14. Questions for the owner

1. **Verify** = confirm an email within 30 days (parent's email for under-13s). Is that what you meant, or do you want
   phone verification too?
2. **Alts**: is "5 accounts per person" a maximum? Is one email verifying up to 5 linked accounts the right way to
   count them?
3. **"ai address"** = IP address? Is it fine that a shared IP only raises a review flag and never bans by itself?
4. **Name sniping**: does the scheme in 9.2 (holds, random release, reserved names, no name sales) cover what you meant?
5. **Under-13 players at launch**, or 13+ first and under-13 once parental consent and age assurance are proven? 13+
   first is cheaper and safer; under-13 is a large part of Roblox's audience.
6. **Currency name** and price per credit. "Credits" is a placeholder.
7. **No paid random items (loot boxes) at all**: agree? It limits some creator monetisation.
8. **Trading** limited to 16+ and items-only, as in 9.5?
9. **Cash-out for creators** (real money): a goal, and when? It needs a lawyer and a company setup for payouts.
10. **First-party games**: own row and badge but no ranking boost. Agree?
11. **Company and jurisdiction**: which country and state is the company in? It decides which laws apply first and
    who signs the payment and age-assurance contracts.
12. **Budget**: is ~$350/month during P1-P2 and ~$3,300/month at 100k MAU acceptable?
13. **Discord**: does an official Metallic Discord server exist, and who administers it?

## 15. Left to the builder

- Exact Rust crate layout under `server/`, error types, migration tool details (sqlx migrations by default).
- Exact rate-limit numbers and cache TTLs within the targets above.
- Which age-assurance, email and captcha vendors, among those with acceptable terms and prices.
- Thumbnail and avatar render pipeline (headless `metallic-player` render or a dedicated renderer), with the engine team.
- The text filter word lists and the classifier choice.
