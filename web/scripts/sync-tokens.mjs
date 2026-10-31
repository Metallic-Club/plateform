#!/usr/bin/env node
// Writes src/styles/metallic-tokens.css from studio's generated token CSS.
//
// Studio is the one source of the design tokens: design/tokens/metallic.tokens.json,
// exported to design/tokens/metallic-tokens.css by `cargo run -p metallic_tokens
// --example export_css` (in a Metallic-Club/studio checkout). This script copies that
// file unchanged and adds one thing the site needs and studio does not have: the
// `system` theme (Graphite, or Light when the device asks for light). The system block
// is built from studio's own graphite and light blocks, so no value is typed here.
//
// Usage (from web/): node scripts/sync-tokens.mjs <studio>/design/tokens/metallic-tokens.css [studio-commit]
// The commit is read from the studio checkout when it is not given.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/sync-tokens.mjs <studio>/design/tokens/metallic-tokens.css");
  process.exit(2);
}
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles", "metallic-tokens.css");

const css = readFileSync(source, "utf8").replace(/\r\n/g, "\n");

const GRAPHITE = ':root, [data-theme="graphite"] {';
const LIGHT = '[data-theme="light"] {';
if (!css.startsWith("/* Metallic design tokens. Generated from design/tokens/metallic.tokens.json")) {
  throw new Error(`${source} does not look like studio's generated token CSS`);
}
for (const selector of [GRAPHITE, '[data-theme="titanium"] {', LIGHT]) {
  if (css.split(selector).length !== 2) throw new Error(`expected exactly one \`${selector}\` block`);
}

const lightStart = css.indexOf(LIGHT) + LIGHT.length;
const lightBody = css.slice(lightStart, css.indexOf("\n}", lightStart)).replace(/^\n/, "");

let commit = process.argv[3] ?? "";
if (!commit) try {
  commit = execFileSync("git", ["-C", dirname(source), "log", "-1", "--format=%h", "--", basename(source)], {
    encoding: "utf8",
  }).trim();
} catch {
  // Not a git checkout: the header just leaves the commit out.
}

const header = `/*
 * GENERATED FILE: do not edit. One source for the site's colours, space, radii, the cut,
 * type sizes and motion: Metallic-Club/studio design/tokens/metallic.tokens.json.
 *
 * Below is studio's design/tokens/metallic-tokens.css${commit ? ` (studio commit ${commit})` : ""}, unchanged except
 * that the graphite block also names [data-theme="system"] and a light-scheme system
 * block (a copy of studio's light block) is added at the end.
 *
 * Regenerate:
 *   1. in a studio checkout: cargo run -p metallic_tokens --example export_css
 *   2. in web/: node scripts/sync-tokens.mjs <studio>/design/tokens/metallic-tokens.css
 */
`;

const system = `
/* The site's System theme: Graphite (above) unless the device asks for light. */
@media (prefers-color-scheme: light) {
  [data-theme="system"] {
${lightBody
  .split("\n")
  .map((line) => (line ? `  ${line}` : line))
  .join("\n")}
  }
}
`;

const out =
  header + css.replace(GRAPHITE, ':root,\n[data-theme="graphite"],\n[data-theme="system"] {').trimEnd() + "\n" + system;

writeFileSync(target, out);
console.log(`wrote src/styles/metallic-tokens.css${commit ? ` from studio ${commit}` : ""}`);
