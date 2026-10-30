// The Content-Security-Policy the proxy sends on every page.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsp, makeNonce } from "../src/lib/csp.ts";

function directives(csp: string) {
  return new Map(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)] as const));
}

describe("buildCsp", () => {
  it("allows scripts only with the nonce, without eval, in production", () => {
    const d = directives(buildCsp({ nonce: "abc123", dev: false, https: true }));
    assert.deepEqual(d.get("script-src"), ["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    assert.ok(!buildCsp({ nonce: "abc123", dev: false, https: true }).includes("unsafe-eval"));
    assert.ok(!d.get("script-src")!.includes("'unsafe-inline'"));
  });

  it("forbids framing and frames, plugins and base changes", () => {
    const d = directives(buildCsp({ nonce: "n", dev: false, https: true }));
    assert.deepEqual(d.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(d.get("frame-src"), ["'none'"]);
    assert.deepEqual(d.get("object-src"), ["'none'"]);
    assert.deepEqual(d.get("base-uri"), ["'self'"]);
    assert.deepEqual(d.get("form-action"), ["'self'"]);
    assert.ok(d.has("upgrade-insecure-requests"));
  });

  it("names no third-party script or connect hosts", () => {
    const d = directives(buildCsp({ nonce: "n", dev: false, https: true }));
    for (const name of ["script-src", "connect-src", "default-src", "font-src"]) {
      for (const v of d.get(name)!) assert.ok(v.startsWith("'"), `${name} ${v}`);
    }
  });

  it("adds eval only in development and skips the upgrade on plain http", () => {
    const csp = buildCsp({ nonce: "n", dev: true, https: false });
    assert.ok(directives(csp).get("script-src")!.includes("'unsafe-eval'"));
    assert.ok(!csp.includes("upgrade-insecure-requests"));
  });
});

describe("makeNonce", () => {
  it("is fresh, base64 and 128 bits", () => {
    const a = makeNonce();
    const b = makeNonce();
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  });
});
