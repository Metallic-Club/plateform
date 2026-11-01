# Project instructions

## Design references

Before any visual, layout or component work, consult the DESIGN.md collection at
https://github.com/VoltAgent/awesome-design-md

- It is a curated set of plain-text `DESIGN.md` files, one per well-known product,
  describing that product's design system: colour tokens, type scale, spacing,
  radius, motion, component patterns and voice.
- Pick the entry closest to the look being asked for, fetch that `DESIGN.md`, and
  follow its tokens and rules instead of inventing values. If the request names a
  product or brand, look for its entry first.
- Treat these files as style references, not assets: never copy a brand's wordmark,
  logo, mascot, illustration or proprietary copy into this project. Layout,
  spacing, type and colour reasoning are fine; branding stays original.

## This project

Metallic is a static platform site with no build step and no runtime dependencies.

- `assets/css/app.css` — the whole design system: tokens, header, left rail,
  shelves, cards, experience page, footer and breakpoints.
- `assets/js/app.js` — shared chrome (`shell()`) plus one renderer per page;
  `poster()` generates the game cover art as inline SVG.
- `assets/js/data.js` — `window.METALLIC` mock data (games, servers, wardrobe,
  market, feature groups).
- `docs/platform-feature-list.md` — the owner's feature list, the source of truth
  for scope.
- Pages are plain HTML that set `<body data-page="...">`; bump the `?v=` asset
  stamp on every page whenever CSS or JS changes, because GitHub Pages caches
  assets for about ten minutes.
