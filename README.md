# Metallic

A social gaming platform concept: chart-driven discovery, first-party and community experiences, an avatar and
marketplace economy, a creator hub, and a published trust-and-safety model.

The layout follows the familiar platform pattern — light UI, top navigation, wide 16:9 experience cards, ranked
charts and a two-column experience page — under the Metallic brand, with its own logo, colours and copy.

Static site, no build step, no runtime dependencies. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 3000
```

GitHub Pages serves the repository root, so every page is already at its final path.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home: featured hero, Continue, Popular, Recommended, Top rated |
| `charts.html` | Charts: Popular / Top rated / Top earning / Up and coming, with category filters |
| `game.html?id=1` | Experience page: vote bar, servers, published capacity, recommendations |
| `avatar.html` | Avatar editor and inventory (equip cosmetics) |
| `marketplace.html` | Alloy marketplace with a flat 5% fee |
| `servers.html` | Server browser with seats used against hard limits |
| `create.html` | Creator hub: revenue, experiences, sandbox replica orchestration |
| `safety.html` | Verification, alt limits, ban propagation, name-sniping rules |
| `features.html` | The owner's full feature scope with build status |
| `docs.html` | Backend API reference and webhooks |

## Structure

```
assets/css/app.css   design tokens, components, responsive layout
assets/js/data.js    mock experiences, servers, inventory, market, feature scope
assets/js/app.js     shared shell (top bar, modal, toasts, footer) + page renderers
docs/                owner's raw feature list (source of truth for scope)
```

Each page sets `data-page` on `<body>`; `app.js` builds the shell and runs the matching renderer.
All content is mock data for the design concept — there are no accounts, payments or live servers.
