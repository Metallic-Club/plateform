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

- `src/app.js` — shared chrome (`shell()`) plus one view per route, and the
  click, submit and input handlers that drive them.
- `src/reference.css`, `src/styles.css`, `src/refinements.css`,
  `src/platform.css`, `src/social.css`, `src/features.css` — the stylesheets,
  loaded in that order from `index.html`; later files override earlier ones.
- `src/catalog.js`, `src/platform.js`, `src/social.js`, `src/store.js` — sample
  catalog, discovery and marketplace data, groups and servers, and the saved
  browser state with its normalization.
- `src/play.js`, `src/economy.js`, `src/theme.js` — play history, the daily
  Alloy claim and gifts, and the `data-theme` list.
- `src/router.js` — hash routes and query parameters, so filters and tabs are
  bookmarkable.
- `docs/platform-feature-list.md` — the owner's feature list, the source of truth
  for scope.
- One `index.html` entry point; pages are hash routes (`#/home`, `#/docs`), not
  separate files. Run `npm run dev` on the loopback port 4173, `npm test` for the
  node:test suite, and `npm run build` for `dist/`.

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
