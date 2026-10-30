// GET /auth/launcher-handoff: redeem, cookie, redirect, and the failure paths.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleLauncherHandoff, type Redeem, type WebSessionRedemption } from "../src/lib/launcher-handoff.ts";

const SITE = "https://metallic.test";
const CODE = "wsc_4f1a9cE7bQ2kLm0X";
const SESSION = "sess_Zp0q81c5rTn6yVwA";

/** A mock of the API's redeem call: single use, like the real endpoint. */
function mockApi(result: WebSessionRedemption = { ok: true, session: SESSION, maxAge: 2_592_000 }) {
  const used = new Set<string>();
  const seen: string[] = [];
  const redeem: Redeem = async (code) => {
    seen.push(code);
    if (!result.ok) return result;
    if (used.has(code)) return { ok: false, reason: "invalid" };
    used.add(code);
    return result;
  };
  return { redeem, seen };
}

function get(query: string) {
  return new Request(`${SITE}/auth/launcher-handoff${query}`);
}

describe("launcher handoff", () => {
  it("sets the session cookie and redirects home", async () => {
    const api = mockApi();
    const res = await handleLauncherHandoff(get(`?code=${CODE}`), api.redeem);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/");
    assert.deepEqual(api.seen, [CODE]);

    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^metallic_session=${SESSION};`));
    for (const attr of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=2592000"]) {
      assert.ok(cookie.split("; ").includes(attr), `${attr} in ${cookie}`);
    }
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  });

  it("redirects to a same-origin next path", async () => {
    const res = await handleLauncherHandoff(get(`?code=${CODE}&next=${encodeURIComponent("/games/42?server=7")}`), mockApi().redeem);
    assert.equal(res.headers.get("location"), "/games/42?server=7");
  });

  it("ignores next values that leave the site", async () => {
    for (const next of ["//evil.test", "/\\evil.test", "https://evil.test/", "javascript:alert(1)", "/.//evil.test"]) {
      const res = await handleLauncherHandoff(get(`?code=${CODE}&next=${encodeURIComponent(next)}`), mockApi().redeem);
      assert.equal(res.headers.get("location"), "/", next);
      assert.ok(res.headers.get("set-cookie"), "still signs in");
    }
  });

  it("a used code shows the sign-in page", async () => {
    const api = mockApi();
    await handleLauncherHandoff(get(`?code=${CODE}`), api.redeem);
    const again = await handleLauncherHandoff(get(`?code=${CODE}&next=%2Ffriends`), api.redeem);
    assert.equal(again.status, 303);
    assert.equal(again.headers.get("location"), "/signin?handoff=expired&next=%2Ffriends");
    assert.equal(again.headers.get("set-cookie"), null);
  });

  it("an expired code shows the sign-in page", async () => {
    const res = await handleLauncherHandoff(get(`?code=${CODE}`), mockApi({ ok: false, reason: "invalid" }).redeem);
    assert.equal(res.headers.get("location"), "/signin?handoff=expired");
    assert.equal(res.headers.get("set-cookie"), null);
  });

  it("missing or malformed codes never reach the API", async () => {
    const api = mockApi();
    for (const q of ["", "?code=", "?code=short", `?code=${"x".repeat(300)}`, "?code=has%20space%20in%20it%20ok", "?code=abc%3Bdef%3Dghi12345"]) {
      const res = await handleLauncherHandoff(get(q), api.redeem);
      assert.equal(res.headers.get("location"), "/signin?handoff=expired", q);
    }
    assert.deepEqual(api.seen, []);
  });

  it("an API failure says so, without a cookie", async () => {
    const down = await handleLauncherHandoff(get(`?code=${CODE}`), mockApi({ ok: false, reason: "unavailable" }).redeem);
    assert.equal(down.headers.get("location"), "/signin?handoff=failed");
    const throws = await handleLauncherHandoff(get(`?code=${CODE}`), async () => {
      throw new Error("ECONNREFUSED");
    });
    assert.equal(throws.headers.get("location"), "/signin?handoff=failed");
    assert.equal(throws.headers.get("set-cookie"), null);
  });

  it("refuses a session value that could inject cookie attributes", async () => {
    const res = await handleLauncherHandoff(
      get(`?code=${CODE}`),
      mockApi({ ok: true, session: "abcdefghijklmnop; Domain=evil.test" }).redeem,
    );
    assert.equal(res.headers.get("location"), "/signin?handoff=failed");
    assert.equal(res.headers.get("set-cookie"), null);
  });

  it("caps the cookie lifetime at the API's 30 days", async () => {
    const res = await handleLauncherHandoff(get(`?code=${CODE}`), mockApi({ ok: true, session: SESSION, maxAge: 10 ** 9 }).redeem);
    assert.ok(res.headers.get("set-cookie")?.includes("Max-Age=2592000"));
  });
});
