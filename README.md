# Metallic

A social gaming platform concept: game discovery, first-party and community worlds, an avatar and marketplace
economy, a creator hub, and a published trust-and-safety model.

Static site, no build step, no dependencies at runtime. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 3000
```

GitHub Pages serves the repository root, so every page is already at its final path.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home: spotlight, continue playing, recommendations, trending, trust strip |
| `explore.html` | Browse and filter by category, search and sort |
| `game.html?id=1` | Game detail: live servers, published capacity, similar games |
| `avatar.html` | Avatar preview and wardrobe (equip cosmetics) |
| `marketplace.html` | Alloy marketplace with a flat 5% fee |
| `servers.html` | Server browser with seats used against hard limits |
| `creators.html` | Creator hub: games, revenue, sandbox replica orchestration |
| `safety.html` | Verification, alt limits, ban propagation, name-sniping rules |
| `features.html` | The owner's full feature scope, grouped, with build status |
| `docs.html` | Backend API reference and webhooks |

## Structure

```
assets/css/app.css   design tokens, components, responsive layout
assets/js/data.js    mock games, servers, wardrobe, market, feature scope
assets/js/app.js     shared shell (top bar, rail, modals, footer) + page renderers
docs/                owner's raw feature list (source of truth for scope)
```

Each page carries `data-page` on `<body>`; `app.js` builds the shell and runs the matching renderer.
All content is mock data for the design concept — there are no accounts, payments or live servers.
