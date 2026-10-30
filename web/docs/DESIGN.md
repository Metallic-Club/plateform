# Metallic web: design notes

Why the site looks the way it does, one line per decision. Tokens live in `src/app/globals.css`.

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
  - Violet is used only on the primary action of a screen and on the "in a game" presence dot. It appears nowhere else, so it always means "go".
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
