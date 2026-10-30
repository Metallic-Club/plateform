// GET /healthz: the Launcher's site check. Cheap, always 2xx, never cached.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "../src/app/healthz/route.ts";

describe("healthz", () => {
  it("answers 200 with plain text and no caching", async () => {
    const res = GET();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(await res.text(), "ok\n");
  });
});
