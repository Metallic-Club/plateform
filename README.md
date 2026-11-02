# Metallic website

A responsive front-end foundation for the Metallic gaming platform, based on the supplied `refrence/Metallic — Roblox-style home.html`. Its charcoal palette, layout, game artwork, avatar artwork, and game catalog are retained and extended. The original reference is preserved unchanged. Servers appear inside individual game pages, with Groups in the Community sidebar.

## Run locally

Requires Node.js 22 or newer. No dependencies or installation step.

```sh
npm run dev
npm test
npm run build
```

Open http://127.0.0.1:4173. The production build is in `dist/`; `node scripts/serve.mjs --dist` previews it. Deploy the contents of `dist/` to any static host. Hash routing works without rewrite rules and supports hosting under a repository subpath.

## Pages

Landing `/`, login `/login`, signup `/signup`, launcher `/download`, home `/home`, explore `/explore`, wardrobe `/wardrobe`, creator hub `/create`, Alloy store `/alloy`, profile `/profile`, settings `/settings`, friends `/friends`, API documentation `/docs`, safety `/safety`, trading `/trades`, community `/community`, and game details `/game/:id`. Browser paths use `#/` before each route. The four primary tabs are Home, Explore, Wardrobe, and Marketplace; Create, groups, friends, downloads, docs, and safety live in the sidebar.

## Working interactions

- Game search with keyboard-accessible suggestions, URL-backed genre filters and sorting, detailed game pages, share links, and persistent favorites.
- Outfit, accessory, and color selection with front/back previews, unsaved-change indicators, and saved looks reflected in the header and profile.
- Local game drafts with editable names, templates, descriptions, and deletion confirmation.
- Friend profiles, search, incoming requests, pending outgoing requests, request cancellation, and removal confirmation.
- Profile editing, local preference switches, notifications, and preview data reset.
- Validated signup/login preview forms and accessible pack-preview dialogs.
- Four primary top tabs, a supplementary sidebar, a keyboard-contained mobile drawer, semantic forms, preserved keyboard focus, native modal dialogs, and reduced-motion support.
- Unsaved settings protection and normalization of previously saved browser data.

Explore filters and friend tabs survive reloads and can be bookmarked. For example: `#/explore?category=Action&sort=rating` and `#/friends?tab=sent`. Community profile previews use `#/profile?user=heroX_x`. Game servers use `#/game/1?tab=servers`; groups use `#/groups` and `#/groups/metallic-studio`.

- Play history records each game opened from a play control, powers the home continue shelf and the history section, and can be cleared from the profile.
- Trading offers Alloy, an owned accessory, or both to a friend; offers stay pending until accepted or cancelled, and accepting updates the demo balance and collection.
- Weekly quests pay Alloy for opening three games, playing across two genres, and saving a favorite, once per quest per week.
- Titles from Metallic itself carry a studio flag and their own shelf on Home.
- Reporting and blocking live on other profiles; a block ends the friendship and stops further friend requests and trades in the preview.
- The community page previews the Discord channels, roles, and what carries between the site and the server, using the optional link saved in settings.
- A daily Alloy claim is available once per day, and friends can be sent Alloy through a gift dialog that spends the demo balance.
- Settings gains Themes (Charcoal, Slate, Ember) and profile links for Discord, YouTube, Twitch, and TikTok, stored locally and shown as text.
- Game pages include active-session previews, player avatars with hover/focus names, full-server and join-privacy states, friend joining, and links to the owning group or player.
- Reserved server previews cost 100 demo Alloy once. Creation supports public or invite-only access, specific friends, and allowing all friends. Reconfiguration does not charge again.
- Home friends show a compact activity popup on hover, keyboard focus, or tap, with game artwork and join controls that respect the same session access rules as game pages.
- Global search covers games, people (including your profile and saved friends), and groups, with grouped suggestions and category-filtered results. Search placeholders fade when focused.
- Friend presence uses gray for offline/hidden, blue for online, green for playing, and orange for Studio across Home, Friends, and profile friend lists. Status labels are available on hover and to assistive technology.
- Square profile group and badge tiles fit desktop and mobile layouts. The mutual-friend summary uses a text link above the friend list.
- Profile groups display membership roles and a crown badge for owned groups, using the same role data as group member lists.
- Groups include discovery, interests, open or approval-based membership, member roles, announcements, games, and local owner management. A locally created group can own a game draft through the Creator field in the game editor.

## Integration boundaries

This is a browser-only prototype. All catalog activity, friends, prices, and the Alloy balance are sample data. Local non-sensitive state is stored under `metallic-demo-v1`. Login/signup validate input but do not authenticate or create accounts; emails and passwords are never stored or transmitted. Live identity, sessions, authorization, email verification, account recovery, privacy enforcement, and moderation must be implemented in a trusted backend before launch.

The launcher is explicitly unavailable until signed release artifacts and supported-platform requirements exist. The store previews illustrative packs; there is no checkout or money collection. The browser-local demo Alloy balance starts at 1,450 and is reduced by 100 when a server preview is created. It is not a real wallet. Add a trusted authoritative ledger before enabling live currency operations. Creator projects, groups, and server reservations are local previews; server creation does not provision a running server. Joining previews a launcher handoff. No group requests, messages, or friend requests are sent to real people.

## Structure

- `src/app.js`: route views, shared components, and UI event handling.
- `src/store.js`: browser-state adapter, normalization, escaping, and catalog filtering.
- `src/router.js`: route and query parsing for persistent filters and tabs, with legacy game-link support.
- `src/platform.js`: discovery ranking, filters, mutual-friend fixtures, creator categories, and marketplace sample data.
- `src/social.js`: server previews, access checks, demo Alloy transitions, game ownership, groups, and social-state migration.
- `src/play.js`: play history, newest first, one entry per game.
- `src/economy.js`: the daily Alloy claim plus Alloy and accessory gifts, including the demo-balance checks.
- `src/trade.js`: trade offers between friends, with the pending, accepted, and cancelled states.
- `src/quests.js`: the weekly earning quests, measured from this week's play history and favorites.
- `src/theme.js`: the theme list and the `data-theme` switch applied on every render.
- `src/avatar.js`: saved-avatar portraits and stable sample community identities.
- `src/catalog.js`: sample catalog extracted from the supplied reference.
- `src/reference.css`: original reference styles.
- `src/styles.css`: page additions and responsive styles.
- `src/refinements.css`: shared platform layout refinements.
- `src/platform.css`: revised navigation, profile layouts, settings sections, creator libraries, marketplace, discovery, and responsive rules.
- `src/social.css`: neutral discovery surfaces, game sessions, player tooltips, and group layouts.
- `src/features.css`: theme palettes, the theme picker, play history rows, the gift dialog, and the API and safety pages.
- `art/`: artwork beside `index.html`, so every path resolves the same in `npm run dev`, in `dist/` and when the repository root is deployed. The 14 game posters are graded crops of CC0, public-domain and CC BY photographs from Wikimedia Commons, fetched by `tools/fetch-art.py` and credited in `docs/art-credits.md`; the avatars are original SVG.
- `scripts/`: dependency-free development server and build copier.
- `tests/`: state migration, friendship transitions, filtering, routing, escaping, SVG integrity, and preview HTTP tests using the Node test runner.

The preview server listens only on loopback and serves application assets. Repository metadata and local configuration are excluded from HTTP access. Production builds replace only the generated `dist/` directory so deleted assets cannot remain in a release.

See [the verification record](docs/verification.md) for the latest review coverage.

Keep authentication, user data, wallet operations, and creator publishing behind service adapters when connecting a backend; do not treat localStorage as an authority for any live account or purchase.
