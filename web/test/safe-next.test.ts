// `next` redirect validation, including open-redirect attempts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNextPath } from "../src/lib/safe-next.ts";

const ORIGIN = "https://metallic.test";

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    assert.equal(safeNextPath("/", ORIGIN), "/");
    assert.equal(safeNextPath("/games/123", ORIGIN), "/games/123");
    assert.equal(safeNextPath("/explore?q=race&genre=racing#top", ORIGIN), "/explore?q=race&genre=racing#top");
    assert.equal(safeNextPath("/users/%2F%2Fodd", ORIGIN), "/users/%2F%2Fodd");
  });

  it("normalises dot segments that stay on the site", () => {
    assert.equal(safeNextPath("/games/../friends", ORIGIN), "/friends");
  });

  it("falls back to / for missing or empty values", () => {
    assert.equal(safeNextPath(null, ORIGIN), "/");
    assert.equal(safeNextPath(undefined, ORIGIN), "/");
    assert.equal(safeNextPath("", ORIGIN), "/");
  });

  it("uses the given fallback", () => {
    assert.equal(safeNextPath("//evil.test", ORIGIN, "/home"), "/home");
  });

  it("rejects open redirects", () => {
    for (const bad of [
      "//evil.test",
      "//evil.test/path",
      "/\\evil.test",
      "\\\\evil.test",
      "\\/evil.test",
      "https://evil.test",
      "https://metallic.test.evil.test/",
      "http://metallic.test/", // other scheme, so another origin
      "https:evil.test",
      "javascript:alert(1)",
      "data:text/html,hi",
      "evil.test",
      "games/1", // relative paths are not allowed either
      "/.//evil.test", // collapses to //evil.test
      "/..//evil.test",
      "/%09/evil.test".replace("%09", "\t"), // tab, stripped by URL parsers
      "/\n/evil.test",
      "/ /evil.test",
      "/games\\..\\..\\evil",
      "/auth/launcher-handoff?code=x", // no loops back into the handoff
      `/${"a".repeat(3000)}`,
    ]) {
      assert.equal(safeNextPath(bad, ORIGIN), "/", JSON.stringify(bad));
    }
  });
});
