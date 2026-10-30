# Metallic web: design notes

Why the site looks the way it does, one line per decision. Colours, spacing, radii, the cut and motion are the shared Metallic tokens in `src/styles/metallic-tokens.css` (a copy of studio's `docs/design/visual-language/assets/tokens.css`, from studio PR #199, until studio#196 generates it). `src/app/globals.css` adds the Titanium and Light theme blocks and the web-only values.

## Reading of the brief

- Product: a game platform's website, used for finding a game, seeing who is playing, joining, and dressing an avatar. It also runs inside the desktop Launcher.
- Audience: players of all ages, many on phones, some on a TV with a controller.
- The main job of every page is to get someone into a game or a server in as few steps as possible.
- Complaints about existing stores that shaped this (Roblox, Steam, Epic):
  - Ads and paid placement mixed into lists.
  - Server browsers that hide friends and fullness.
  - Ratings that cannot be trusted.
  - Cluttered home pages.
  - Slow pages.

## Dials

The design is set low on all three: ENERGY 2, RHYTHM 2, MOTION 1.

- **Energy 2.** The art and the game names carry the colour, so the interface around them stays quiet graphite.
- **Rhythm 2.** Sections differ in layout because their content differs:
  - Featured game: an art plate.
  - Most played: a numbered chart.
  - Made by Metallic: wide rows.
  - Genres: a wall of words.
- **Motion 1.** Only hover, press and the dialog move. `prefers-reduced-motion` removes even that.

## Decisions

- **Colour**
  - Graphite ground with three steps of surface, plus silver ink, because the brand names graphite, titanium and silver.
  - Violet is used only on the primary action of a screen, selection, focus and the "in a game" presence dot. It appears nowhere else, so it always means "go".
  - Text on violet is dark graphite in the dark themes (white on violet-400 fails contrast), white in Light.
  - There are no gradients, glows, glass or neon. The brand rules them out, and they would compete with the game art.
- **Themes**
  - The theme ids are Graphite (default), Titanium (a lighter dark), Light (shown as "Aluminium") and System. These ids match the spec's `Settings.theme`, so the choice can be saved to the account later.
- **Type**
  - One family, Archivo, with its width axis: 125% for display text, 100% for the interface.
  - Using one family keeps the site light, and the wide cut gives the wordmark-like headlines.
- **The milled corner**
  - One corner of every game and item picture is cut at 45 degrees, like machined metal. This is the single identity motif.
  - People are drawn round, so they never look like products.
- **Layout**
  - Lists of games are shelves that scroll sideways on phones and turn into grids on wide screens. No card borders, no shadows.
- **Icons**
  - The icon set is our own, with square caps and mitred joins to match the milled corner.
  - There are no emoji and no brand logos. Linked accounts are shown as text.
- **Art**
  - Games and items use procedural flat SVG scenes, because there are no uploads yet.
  - When the API sends real images (`thumbnailUrl`, `avatarHeadshotUrl`), the UI shows those instead. These fields are marked UI-only in `src/lib/api/types.ts`.
- **Numbers and honesty**
  - Ratings and player counts are shown as plain numbers, and ratings follow the spec's rule of no percentage under 20 votes.
  - The footer says that all data is sample data.
  - Purchases, sign-in, saving and friend requests say plainly that they are not connected yet.
- **Server browser**
  - Friends come first, then fullness.
  - Ping is not shown, because only the app can measure it honestly.
  - Filters are in the URL, and the API applies them.
- **Play**
  - Play always goes through `/play/<gameId>`. That route gets a join ticket from the API and redirects to its `metallic://` link.
  - In a browser, a dialog first explains that games run in the app.
- **Display modes**
  - The TV mode (`?display=tv` or Settings) enlarges text and focus rings, and adds arrow-key and d-pad navigation between focusable items.
- **States**
  - Every route has a loading, error and empty state.
  - `?mock=empty|guest|slow|error` (or Settings, under Preview tools) shows each one.

## Swapping the emblem

The emblem is a placeholder and is drawn in `src/components/Emblem.tsx` only. To change it, replace that file. The favicon is `src/app/icon.png`.

## Inside the desktop Launcher

- The `launcher` shell is chosen from the user-agent suffix ` MetallicLauncher/<version> bridge/<n>` (`src/lib/launcher-ua.ts`). The `metallic_shell` cookie (`?shell=`, Settings, Preview tools) overrides it for previews. Neither is a security boundary; they only change the layout.
- The page talks to the Launcher only through `src/lib/launcher-bridge.ts`, which feature-checks `window.metallic`, allows exactly the commands and events of plateform #7 and falls back to the plain site without a bridge.
- In the Launcher: Play calls the bridge's `play`; there are no "get the app" prompts; the header shows a status chip only when something needs attention ("Restart to update", an update or Studio install in progress); Downloads has Get Studio / Open Studio and the app's update state; Settings has the close-to-tray switch; sign-in and sign-up use the device flow and never show a password field.
- The layout is checked at the Launcher's minimum window, 960 x 600: the game page goes two-column from 900px, and the header search folds into its icon below 1200px.
- Every page gets a nonce-based CSP from `src/proxy.ts` and HSTS from `next.config.ts`. No third-party scripts, fonts or frames.
- `/healthz` on the public origin is this app's cheap liveness check (`src/app/healthz/route.ts`), used by the Launcher. API readiness is `/v1/readyz`, internal only.
- Screenshots: `docs/screenshots/launcher/` (before and after, browser at 1440 and Launcher at 960 x 600 with a stand-in bridge).
