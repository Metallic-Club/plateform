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

## Anti-slop filter

Every task also runs through https://github.com/miqdadbadjuber/anti-slop, saved
verbatim at `docs/antislop.md`. Read it before any UI, copy or code work here.

- It is a filter, not a style guide: 40 rules (R-01 to R-40) in three tiers —
  Hard Gate, Purpose-Gate and Quality Locks — plus a Liveliness Toolkit and a
  Delivery Gate report.
- Work in "during" mode: let the rules shape the work as it is built, then close
  with the Delivery Gate PASS/FAIL report (four blocks) before saying it is done.
- The filter only removes slop; visual direction still comes from the DESIGN.md
  collection above. Both apply to the same task, in that order: direction first,
  then filter.
- Consequences for this repo: no invented statistics, fake testimonials or
  made-up social proof; no performance number unless it was measured; no
  decorative gradient blobs, emoji-as-UI or generic "elevate your experience"
  copy; comments explain why, never narrate the diff.
