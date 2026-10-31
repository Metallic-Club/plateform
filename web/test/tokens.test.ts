// One token source: the site's colours come only from the generated token file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Normalise line ends so a CRLF checkout reads the same.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tokens = read("../src/styles/metallic-tokens.css");
const globals = read("../src/app/globals.css");

describe("design tokens", () => {
  it("is the generated studio file with every theme", () => {
    assert.match(tokens, /GENERATED FILE: do not edit/);
    assert.match(tokens, /Generated from design\/tokens\/metallic\.tokens\.json/);
    for (const theme of ["graphite", "titanium", "light", "system"]) {
      assert.ok(tokens.includes(`[data-theme="${theme}"]`), `missing the ${theme} theme`);
    }
    assert.match(tokens, /@media \(prefers-color-scheme: light\) \{\n {2}\[data-theme="system"\]/);
  });

  it("is not redeclared by globals.css", () => {
    // Pointing one token at another (TV mode's larger cut) is fine; a value is not.
    const declared = [...globals.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)]
      .filter((m) => !/^var\(--[a-z0-9-]+\)$/.test(m[2].trim()))
      .map((m) => m[1]);
    const shared = declared.filter((name) => tokens.includes(`${name}:`) && name !== "--font" && name !== "--mono");
    assert.deepEqual(shared, [], "globals.css sets token values; change them in studio's token JSON instead");
    assert.doesNotMatch(globals, /#[0-9a-f]{3,8}\b/i, "globals.css has a colour literal");
  });
});
