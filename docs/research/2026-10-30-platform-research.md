# Metallic platform research: accounts, safety, discovery, economy, backend, hosting

Date: 2026-10-30. Author: Claude (platform design session). Feeds `docs/superpowers/specs/2026-10-30-platform-design.md`.

Evidence labels:
- **Sourced (fetched)**: I opened the page in this session; URL given.
- **Sourced (search)**: a search result summary said it; I did not open the page. Weaker.
- **Judgment**: my reasoning or general knowledge I could not confirm this session.

Limits of this pass: the shared web-search quota ran out twice during the session, so several topics rest on pages I
fetched by known URL rather than on broad searching. Some primary pages (Roblox Help Center, Ofcom, White & Case,
EUR-Lex HTML, Xsolla pricing, CFPB) refused or returned nothing; where that happened I used a secondary source and
say so. Section 9 lists what is still unverified.

---

## 1. Child safety law and age assurance

| Topic | Finding | Evidence |
|-------|---------|----------|
| COPPA amendments (US) | Final rule announced 16 Jan 2025. Adds separate, opt-in parental consent before disclosing a child's data to third parties (e.g. targeted ads); data may be kept only as long as reasonably necessary, never indefinitely; "personal information" now includes biometric and government-issued identifiers; safe-harbor programs must publish members | Sourced (fetched): [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-finalizes-changes-childrens-privacy-rule-limiting-companies-ability-monetize-kids-data) |
| COPPA dates | Published in the Federal Register 22 Apr 2025, effective 23 Jun 2025, full compliance by 22 Apr 2026 (now passed) | Sourced (fetched): [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/coppa-rule-amendment-compliance-deadline-approaches); dates also in search results ([Latham](https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule)) |
| COPPA written security program and retention policy | Reported as mandatory under the amendments | Sourced (search): [Securiti](https://securiti.ai/ftc-coppa-final-rule-amendments/). The FTC release I fetched does not mention the security program |
| Epic/FTC 2022 | $275M COPPA penalty plus $245M refunds. Order: voice and text chat off by default for children and teens, on only with parent (under 13) or teen consent; no charging without affirmative consent; no locking accounts of people who dispute charges | Sourced (fetched): [FTC](https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations) |
| GDPR Art. 8 | Consent-based processing for a child under 16 needs parental consent; member states may lower this to no less than 13; the controller must make reasonable efforts to verify parental consent | Sourced (fetched): [gdpr-info.eu Art. 8](https://gdpr-info.eu/art-8-gdpr/) |
| EU DSA Art. 28 guidelines | Published 14 Jul 2025. Minors' accounts private by default; recommender systems should weight explicit signals over behavioural ones; block/mute any user; streaks, autoplay, push notifications off by default for minors; avoid exploiting minors with virtual currencies and loot boxes; age estimation where terms set a minimum age below 18, verification for adult content. Micro and small enterprises are exempt | Sourced (fetched): [European Commission](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors) |
| DSA Art. 19 | Online-platform duties in Section 3 do not apply to micro or small enterprises, and the exemption runs 12 more months after losing that status | Sourced (fetched): [Art. 19 text](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_19.html) |
| DSA Art. 20 | Free electronic complaint system for removal, suspension and demonetisation decisions, open for at least six months, decided with qualified staff and not solely by automation | Sourced (fetched): [Art. 20 text](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_20.html) |
| DSA Art. 16, 17 | Notice-and-action mechanism and a statement of reasons for every restriction | Judgment (EUR-Lex returned an empty page) |
| UK Online Safety Act scope | Games with chat, matchmaking, livestreaming, user-generated avatars or worlds are user-to-user services in scope. Duties: illegal-harm and children's risk assessments, easy in-game reporting, terms that explain protections, child-suitable complaints. Fines up to £18m or 10% of global revenue | Sourced (fetched): [Lewis Silkin, Mar 2026](https://www.lewissilkin.com/insights/2026/03/13/digital-commerce-creative-101-online-safety-act-navigation-for-the-video-games-industry); scope also in search results ([Digital Policy Alert on Ofcom's Oct 2025 gaming guidance](https://digitalpolicyalert.org/event/34389-office-of-communications-released-guidance-on-online-gaming-compliance-under-the-online-safety-act)) |
| Ofcom children's codes | Enforceable from 25 Jul 2025. "Highly effective age assurance" examples: photo-ID matching, facial age estimation, mobile-operator checks, credit card checks, open banking, digital identity services. Self-declaration does not count | Sourced (search): [SCL](https://www.scl.org/ofcom-publishes-final-guidance-on-age-checks-to-protect-children-online/), [Yoti](https://www.yoti.com/blog/comply-ofcom-protection-of-children-codes-age-assurance). Ofcom's own page returned 403 |
| US CSAM reporting | Providers with actual knowledge must report apparent CSAM to NCMEC's CyberTipline; a report preserves the content for 1 year (raised from 90 days in 2024); fines up to $600k first failure for providers under 100M MAU | Sourced (fetched): [18 U.S.C. 2258A](https://www.law.cornell.edu/uscode/text/18/2258A) |
| Australia minimum age 16 | Applies to age-restricted social media; whether online games are excluded | Not verified (eSafety page timed out). Judgment: online gaming was reported as excluded; confirm before an Australian launch |

### 1.1 What platforms do

| Platform | Practice | Evidence |
|----------|----------|----------|
| Roblox | Facial age estimation (vendor Persona; images deleted after processing) or ID (13+) required for chat. Voluntary from 19 Nov 2025, enforced in AU/NZ/NL in December, worldwide in early January 2026. Six age groups (under 9, 9-12, 13-15, 16-17, 18-20, 21+); chat only with the same or neighbouring groups; chat off for under 9 without parental consent; age-checked 13+ users can add "Trusted Connections" | Sourced (fetched): [Roblox newsroom](https://about.roblox.com/newsroom/2025/11/roblox-requires-age-checks-limits-minor-and-adult-chat) |
| Roblox account tiers | Content labels map to account tiers: Roblox Kids (5-8) and Select (9-15) see Minimal and Mild; Select and standard (16+) see Moderate; Restricted is for age-verified 18+. Unrated games are blocked for everyone | Sourced (fetched): [Content maturity docs](https://create.roblox.com/docs/production/promotion/content-maturity) |
| Roblox Sentinel | Apache-2.0 Python library: embeds recent messages per user, scores similarity to rare harmful examples, aggregates per user; high-recall candidate generator for human review. Roblox says it led to over 1,000 NCMEC reports in its first months | Sourced (fetched): [GitHub Roblox/Sentinel](https://github.com/Roblox/Sentinel) |
| VRChat | Optional ID check through Persona for 18+ features; keeps only the verified birth date and a hash; trust level does not affect it | Sourced (search): [VRChat wiki](https://wiki.vrchat.com/wiki/Age_Verification), [VRChat blog](https://hello.vrchat.com/blog/age-verification) |
| Rec Room | Shut down 1 Jun 2026; said costs always exceeded revenue despite 150M lifetime players | Sourced (search): [UploadVR](https://uploadvr.com/rec-room-to-shut-down-in-june), [PocketGamer.biz](https://www.pocketgamer.biz/rec-room-to-shut-down-after-failing-to-achieve-profitability-from-150m-players) |
| Discord | Age-assurance rollout details | Not verified (search quota ran out). Do not cite |

Takeaways (Judgment): an age gate by self-declared birth date is the floor, not enough for chat in the UK. Plan
age assurance through a vendor before any chat or voice ships (engine milestone 2). Keep minors private by default,
chat off by default for under-13s, and design the economy so it does not target minors.

---

## 2. Accounts, alts, names

| Topic | Finding | Evidence |
|-------|---------|----------|
| Roblox rule on alts | Prohibits "creating or using an account to avoid enforcement action taken against another account"; prohibits selling or sharing account access; prohibits trading Robux for money via third parties | Sourced (fetched): [Roblox Community Standards](https://about.roblox.com/community-standards) |
| Roblox Ban API | Ban API includes real-time alt detection; `excludeAltAccounts` defaults to false, so bans propagate to suspected alts. Developers cannot see the alt list. Community reports: shared Wi-Fi flags unrelated players; changing network identifiers evades it | Sourced (fetched): [Open Cloud bans and blocks](https://create.roblox.com/docs/en-us/cloud/reference/features/bans-and-blocks.md); behaviour details Sourced (search): [DevForum](https://devforum.roblox.com/t/how-to-use-the-new-ban-api-with-code-examples/3045051), [DevForum alt detection request](https://devforum.roblox.com/t/give-us-access-to-the-alt-account-detection-api/4909414) |
| Roblox social links | Off-platform links only through the Social Links feature, which Roblox says needs age 16+; age checks now gate social links | Sourced (fetched): [Community Standards](https://about.roblox.com/community-standards), [Roblox newsroom](https://about.roblox.com/newsroom/2025/11/roblox-requires-age-checks-limits-minor-and-adult-chat) |
| Discord usernames | Moved from name#1234 to unique lowercase usernames (a-z, 0-9, period, underscore) plus free display names; almost half of friend requests had failed on discriminators; names were allotted by account age; old names keep working as aliases; changes are rate-limited | Sourced (fetched): [Discord blog](https://discord.com/blog/usernames) |
| Steam account protection | Items leaving an account not protected by the mobile authenticator for 7 days are held up to 15 days; removing the authenticator blocks trading for 15 days | Sourced (search): [Steam Support](https://help.steampowered.com/en/faqs/view/34A1-EA3F-83ED-54AB) |
| IP as an alt signal | Many unrelated people share one public IP (carrier-grade NAT on mobile, schools, households, VPNs); IP addresses are personal data under GDPR | Judgment, consistent with the Roblox shared Wi-Fi false-positive reports above |
| Deleting unverified accounts | No platform precedent found (search quota). GDPR storage limitation supports deleting data you no longer need | Judgment |

Takeaways (Judgment): treat IP as a weak signal for review, never as proof. Strong signals are a shared verified
phone, payment instrument, or install id plus login history. Let people declare their alts so honest users are never
caught by detection.

---

## 3. Discovery, ratings, recommendations

| Topic | Finding | Evidence |
|-------|---------|----------|
| Roblox Home ranking | Two stages: retrieval, then personal ranking. Most important signals: play-through rate, first-play bounce rate (negative), play days per user, playtime per user. Next: intentional co-play days, qualified sessions, spend days, Robux per user. Only organic Home traffic counts; ad traffic does not. A custom thumbnail is required for Home impressions. Small player counts can earn wider tests. Search uses semantic search; mismatched metadata and look-alike games rank lower | Sourced (fetched): [Roblox discovery docs](https://create.roblox.com/docs/discovery) |
| Fortnite Discover | Metrics: average playtime (sessions capped at 120 min), CCU, bounce rate (sessions under a threshold, often 5 min), retention, social play (invites, party play), qualified play-through rate weighted by depth, unique users over 7 days. New islands get a test window of up to 2 weeks. Curated rows ("By Epic", "Epic's Picks") sit beside algorithmic ones ("For You", genre rows) and a paid Sponsored row. Automatic thumbnail checks; duplicates shown less; wrong genre removed from genre rows | Sourced (fetched): [Epic docs](https://dev.epicgames.com/documentation/en-us/fortnite/how-discover-works-in-fortnite) |
| Fortnite test exposure | A test is about 50,000 impressions, ideally within 20-60 minutes; social metrics weigh more from June 2026 | Sourced (search): same Epic docs and [fortnite.com news](https://www.fortnite.com/news/how-fortnite-discover-works?lang=en-US) |
| Steam Interactive Recommender | Recommends from your playtime history with machine learning; filters for popular vs niche, release date and tags | Sourced (fetched): [Steam Labs](https://store.steampowered.com/labs/). Press reports say it ignores tags and review scores as inputs: Sourced (search), [PCGamingWiki](https://community.pcgamingwiki.com/topic/4280-steam-deploys-neural-network-technology-for-game-recommendations) |
| Roblox content labels | See 1.1 | Sourced (fetched) |
| Small-team recommender | Start with item-to-item co-play ("people who played X for 10+ minutes also played Y"), genre tags, and a fixed share of exploration slots for new games; move to learned two-tower retrieval only with enough data | Judgment |

Takeaways: weight engagement depth over clicks, count only organic traffic, give every new game a bounded test, keep
curated and algorithmic rows separate and labelled. Explicit "why am I seeing this" text also matches the DSA minors
guidance on explicit signals.

---

## 4. Servers, presence, social integrations

| Topic | Finding | Evidence |
|-------|---------|----------|
| Discord presence at scale | Each client WebSocket is a session process; presence fans out from guild processes. Fan-out needed batching per node (Manifold) to keep up; ~5M concurrent users; up to 500k sessions per Erlang VM; a semaphore lets sessions fail fast instead of piling onto registries | Sourced (fetched): [Discord engineering](https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users) |
| Discord Go to Rust | Read States service had latency spikes every ~2 min from Go's forced GC scanning a large cache; the Rust rewrite removed the spikes and beat Go on latency, CPU and memory; cache raised to 8M entries | Sourced (fetched): [Discord engineering](https://discord.com/blog/why-discord-is-switching-from-go-to-rust) |
| Discord Social SDK | Account linking, friends lists, game invites, voice and rate-limited text chat inside games | Sourced (fetched): [Discord docs](https://docs.discord.com/developers/discord-social-sdk/overview). Pricing and platform list were not on the page |
| Discord OAuth2 | Scopes `identify`, `email`, `connections`, `guilds`, `guilds.join`, `role_connections.write`; authorization code with PKCE recommended; check `state` and `iss` | Sourced (fetched): [Discord OAuth2 docs](https://docs.discord.com/developers/topics/oauth2) |
| Discord Linked Roles | An app registers role-connection metadata; server admins gate roles on it; users connect through OAuth2 with `role_connections.write` | Sourced (fetched): [Discord tutorial](https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles) |
| Roblox Open Cloud | REST APIs with API keys or OAuth 2.0; covers data stores, memory stores, restarting servers, user restrictions, inventory; OpenAPI descriptions published; webhooks for refunds and subscriptions; legacy cookie APIs have no stability guarantee | Sourced (fetched): [Open Cloud](https://create.roblox.com/docs/cloud) |
| Server browsers and live counts | Roblox, VRChat public-server details | Not verified this session. Judgment: counts must come from servers we run, not from clients or creators |

---

## 5. Economy, currency, trading, marketplace

| Topic | Finding | Evidence |
|-------|---------|----------|
| Roblox DevEx | $0.0038 per earned Robux (was $0.0035 before 5 Sep 2025); higher $0.0054 for some purchases by US players age-verified 18+; minimum 30,000 Robux; creator must be 13+, have a verified email, DevEx account and tax form | Sourced (fetched): [DevEx docs](https://create.roblox.com/docs/production/monetization/developer-exchange) |
| Roblox marketplace splits | Creator gets 30% on marketplace sales (progressive up to 70% at 6x price floor); in-game sale 30% creator + 40% game owner; 30-day escrow per purchase; upload fee 80 Robux; refundable publishing advances (e.g. hat 1,500 Robux); limited resale: 30% creator, 40% seller, 30% Roblox; resale needs Plus/Premium and a holding period up to 30 days | Sourced (fetched): [Fees and commissions](https://create.roblox.com/docs/marketplace/marketplace-fees-and-commissions) |
| Roblox trading eligibility | Premium needed; limited items only | Sourced (search), low-quality pages only. Treat as unverified |
| EU CPC principles (21 Mar 2025) | Show prices in real money; no mixing currencies or multi-step exchanges that hide cost; let players buy the amount they need instead of forced bundles; clear pre-contract info including the 14-day withdrawal right; plain terms; do not exploit vulnerabilities, especially of children. Non-binding; industry groups objected | Sourced (fetched): [Linklaters](https://techinsights.linklaters.com/post/102k6t4/game-changer-eu-introduces-consumer-protection-guidance-for-in-game-virtual-curr); date and Star Stable action Sourced (search): [Lewis Silkin](https://www.lewissilkin.com/insights/2025/03/26/eu-bodies-act-against-gaming-companies-to-protect-children-from-in-game-purchase-102k658) |
| Steam refunds | Games: within 14 days and under 2 hours played; in-game purchases in Valve games within 48 hours if not consumed, modified or transferred; abuse can end refunds | Sourced (fetched): [Steam refunds](https://store.steampowered.com/steam_refunds/) |
| Steam trade holds | See section 2 | Sourced (search) |
| Apple rules | Virtual currency must use in-app purchase and may not expire; loot boxes must show odds before purchase; US storefront apps may link to outside payment; apps that offer mini games not in the binary must filter content, allow reporting and blocking, index the software, and age-gate content above the app's rating (4.7) | Sourced (fetched): [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) |
| Stripe | 2.9% + 30¢ US cards, +1.5% international, +1% currency conversion, $15 per dispute; Stripe Tax 0.5%; Managed Payments (merchant of record) +3.5% | Sourced (fetched): [Stripe pricing](https://stripe.com/pricing) |
| itch.io | Seller picks the platform's share ("open revenue sharing"); payments direct or collected by itch.io, which then handles EU VAT | Sourced (fetched): [itch.io creator FAQ](https://itch.io/docs/creators/faq) |
| Xsolla | Fees not published on the pricing page | Not verified |
| Closed-loop currency and money transmission | Not verified this session. Judgment: a currency that cannot be cashed out or sent to third parties for money stays out of money-transmitter rules in the US; creator cash-out (DevEx-style) changes that and needs counsel | Judgment |
| Ledger design | Judgment: double-entry, append-only ledger with idempotency keys; balances derived from entries; holds on new funds so chargebacks reverse cleanly | Judgment |

---

## 6. Backend stack

| Topic | Finding | Evidence |
|-------|---------|----------|
| axum | MIT; routing without macros; extractors; uses `tower::Service` so tower/tower-http middleware (timeouts, tracing, compression, auth) works; 0.8 on crates.io, 0.9 in progress; MSRV 1.80 | Sourced (fetched): [tokio-rs/axum](https://github.com/tokio-rs/axum) |
| sqlx | MIT or Apache-2.0; compile-time checked SQL against a dev database; offline mode always on; pure-Rust Postgres driver with LISTEN/NOTIFY; not an ORM; 0.9 current | Sourced (fetched): [launchbadge/sqlx](https://github.com/launchbadge/sqlx) |
| PostgreSQL 18 | Released 25 Sep 2025: async I/O (up to 3x in some scans), `uuidv7()`, OAuth authentication, virtual generated columns, B-tree skip scan | Sourced (fetched): [postgresql.org](https://www.postgresql.org/about/news/postgresql-18-released-3142/) |
| Redis licence | Redis 8+ is RSALv2, SSPLv1 or AGPLv3: none acceptable under our licence rule | Sourced (fetched): [redis.io licences](https://redis.io/legal/licenses/) |
| Valkey | BSD-3-Clause, LF Projects | Sourced (fetched): [valkey-io/valkey](https://github.com/valkey-io/valkey) |
| NATS | Apache-2.0, CNCF project | Sourced (fetched): [nats-io/nats-server](https://github.com/nats-io/nats-server) |
| Meilisearch | "MIT AND BUSL-1.1": enterprise parts are under Business Source; avoid or build community-only with care | Sourced (fetched): [Meilisearch LICENSE](https://github.com/meilisearch/meilisearch/blob/main/LICENSE) |
| MinIO | AGPLv3; repo archived 25 Apr 2026, community edition source-only | Sourced (fetched): [minio/minio](https://github.com/minio/minio) |
| Nomad | Business Source License 1.1 (converts to MPL-2.0 after 4 years) | Sourced (fetched): [Nomad LICENSE](https://github.com/hashicorp/nomad/blob/main/LICENSE) |
| Agones | Apache-2.0; game-server fleets on Kubernetes | Sourced (fetched): [googleforgames/agones](https://github.com/googleforgames/agones) |
| Grafana, Loki, Tempo | Moved from Apache-2.0 to AGPLv3 in 2021 | Sourced (fetched): [Grafana licensing](https://grafana.com/licensing/) |
| Typesense | Server GPL-3.0 (clients Apache) | Sourced (fetched): [typesense/typesense](https://github.com/typesense/typesense) |
| Perses | Apache-2.0, CNCF sandbox; dashboards for Prometheus-style metrics, traces, logs | Sourced (fetched): [perses/perses](https://github.com/perses/perses) |
| VictoriaMetrics | Open-source single-node and cluster editions under Apache-2.0 | Sourced (fetched): [VictoriaMetrics](https://github.com/VictoriaMetrics/VictoriaMetrics) |
| PgBouncer | ISC licence | Sourced (fetched): [COPYRIGHT](https://raw.githubusercontent.com/pgbouncer/pgbouncer/master/COPYRIGHT) |
| openapi-typescript / openapi-fetch | MIT; generate TS types and a typed fetch client from OpenAPI | Sourced (fetched): [openapi-ts](https://github.com/openapi-ts/openapi-typescript) |
| Scalar API reference | MIT; Next.js integration listed | Sourced (fetched): [scalar/scalar](https://github.com/scalar/scalar) |
| RFC 8628 device grant | Endpoints, `authorization_pending`/`slow_down`/`access_denied`/`expired_token`; user codes from the 20-letter set BCDFGHJKLMNPQRSTVWXZ, 8 characters, rate-limited, short-lived; warn users they are authorising a device (remote phishing) | Sourced (fetched): [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) |
| Password hashing | Argon2id minimum m=19 MiB, t=2, p=1 (or equivalents); bcrypt only legacy | Sourced (fetched): [OWASP cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| Roblox infrastructure | 2021 outage lasted 73 hours; 18,000+ servers and 170,000 containers in own data centers; caching layer ~1B requests/s; one Consul cluster for everything was a single point of failure; lessons: split clusters, second data center, no monitoring that depends on the thing it monitors | Sourced (fetched): [Roblox return to service](https://about.roblox.com/newsroom/2022/01/roblox-return-to-service-10-28-10-31-2021) |

Language comparison (Judgment, informed by the rows above):

| | Rust (axum + sqlx) | Go | TypeScript (Node) |
|---|---|---|---|
| Same language as engine, client, game server | yes: shared crates (`metallic_api_types`, net protocol) | no | no |
| Same language as web | no (types shared through OpenAPI instead) | no | yes |
| Tail latency with big in-memory caches | no GC pauses | GC pauses (Discord case) | GC pauses, single thread per process |
| Hosting cost per request | lowest | low | higher |
| Hiring and learning curve | steeper; the team already writes Rust | easy | easiest |
| Compile times | slow; mitigate with a workspace split and `sccache` | fast | none |
| Money and ledger correctness | strong types, compile-checked SQL | good | weaker by default |

---

## 7. Storage, CDN, hosting prices (seen 2026-10-30, excluding VAT)

| Item | Price | Evidence |
|------|-------|----------|
| Cloudflare R2 Standard | $0.015/GB-month; Class A $4.50/M, Class B $0.36/M; egress free; free tier 10 GB, 1M A, 10M B | Sourced (fetched): [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Backblaze B2 | $6.95/TB-month; egress free up to 3x stored, then $0.01/GB; free to Cloudflare, Fastly, bunny.net | Sourced (fetched): [B2 pricing](https://www.backblaze.com/cloud-storage/pricing) |
| Hetzner Object Storage | €6.49/month incl. 1 TB storage + 1 TB egress; EU locations only | Sourced (fetched): [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage) |
| bunny.net CDN | $0.01/GB EU/NA, $0.03 Asia; volume network from $0.005/GB | Sourced (fetched): [bunny pricing](https://bunny.net/pricing/cdn/) |
| Hetzner Cloud dedicated vCPU (US, Ashburn/Hillsboro) | CCX13 2 vCPU/8 GB €43.99 (1 TB traffic); CCX23 4/16 €87.99 (2 TB); CCX33 8/32 €141.49 (3 TB); CCX43 16/64 €279.99; CCX53 32/128 €538.99. EU locations ~€0.50-6.50 cheaper with 20-60 TB traffic | Sourced (fetched): [Hetzner General Purpose](https://www.hetzner.com/cloud/general-purpose) |
| Hetzner dedicated AX | AX41 6c/64 GB €59; AX42 8c/64 GB €79-99; AX102 16c/128 GB €159-259; AX162 48c €319-614 (setup fees apply). US availability not shown | Sourced (fetched): [Hetzner AX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-ax) |
| OVHcloud Game servers | GAME-1 Ryzen 7 9800X3D 8c/64 GB $397.20/month incl. VAT; GAME-2 9950X3D 16c $445.20; game DDoS protection with 35+ game profiles, 17 Tbps capacity; US region available | Sourced (fetched): [OVHcloud Game](https://www.ovhcloud.com/en/bare-metal/game/) |
| PlanetScale Postgres (AWS us-east-1, HA = primary + 2 replicas) | PS-10 (1/8 vCPU, 1 GB) $30-39; PS-320 (4 vCPU, 32 GB) $570-699; Metal M-320 $1,149+ | Sourced (fetched): [PlanetScale pricing](https://planetscale.com/pricing) |
| Stripe | see section 5 | Sourced (fetched) |
| AWS egress, RDS | Not fetched. Judgment: internet egress ~$0.09/GB in the first tier, which is why we keep large downloads on R2 | Judgment |

---

## 8. Decisions this research supports (summary; the spec has the detail)

| Decision | Main reasons |
|----------|--------------|
| Backend in Rust (axum, sqlx, tokio), one modular service first | Team already writes Rust; shares types and protocol crates with Player and game server; no GC tail-latency spikes; permissive licences |
| Postgres 18 as the system of record; managed HA Postgres | Ledger and accounts need strong consistency; a team of four should not run failover at 3 a.m. |
| Valkey for cache, sessions, presence, rate limits; NATS for events from P2 | Both permissive; Redis 8 is not |
| Cloudflare in front; R2 for assets | Zero egress fees on the data that dominates bandwidth |
| Hetzner for API and game-server compute; OVH Game where DDoS protection is needed | 3-10x cheaper than hyperscalers for steady load (Judgment); US and EU locations |
| No Kubernetes, Nomad or Agones at first | Nomad is BSL; Agones needs Kubernetes; a fixed host pool plus our own allocator is enough until tens of thousands of CCU (matches the engine architecture doc) |
| Search on Postgres first, OpenSearch later | Typesense server is GPL-3, Meilisearch has BUSL parts |
| Observability on OpenTelemetry, VictoriaMetrics, Jaeger and Perses dashboards; no Grafana | Grafana stack is AGPL; the others are Apache-2.0 (Jaeger licence: Judgment) |

---

## 9. Not verified this session

- Discord's 2025-2026 age-assurance rollout and alt/ban-evasion wording.
- Roblox trading eligibility, trade cooldowns, username-change price and how released names return.
- Roblox friend limit (often cited as 200; may have changed with the 2025 "Connections" rename).
- Xsolla fees; CFPB 2024 report on gaming currencies (URL returned 404); FinCEN treatment of closed-loop currencies.
- Australia's social-media minimum age and games.
- Jaeger and OpenSearch licences (believed Apache-2.0), AWS/RDS prices, TechEmpower numbers.
- Whether Hetzner AX dedicated servers are offered in its US locations.
