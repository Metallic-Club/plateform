// GET /auth/launcher-handoff: redeem, cookie, redirect, and the failure paths.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleLauncherHandoff,
  isTrustedHandoffRequest,
  type Redeem,
  type WebSessionRedemption,
} from "../src/lib/launcher-handoff.ts";

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

/** What WebView2 sends when the Launcher itself navigates. */
const LAUNCHER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36 Edg/141.0 MetallicLauncher/0.1.0 bridge/1",
  "sec-fetch-site": "none",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
};

function get(query: string, headers: Record<string, string | undefined> = {}) {
  const merged = new Headers();
  for (const [k, v] of Object.entries({ ...LAUNCHER_HEADERS, ...headers })) if (v !== undefined) merged.set(k, v);
  return new Request(`${SITE}/auth/launcher-handoff${query}`, { headers: merged });
}

describe("launcher handoff", () => {
  it("sets the session cookie and redirects home", async () => {
    const api = mockApi();
    const res = await handleLauncherHandoff(get(`?code=${CODE}`), api.redeem);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/?signedin=launcher");
    assert.deepEqual(api.seen, [CODE]);

    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^metallic_session=${SESSION};`));
    for (const attr of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=2592000"]) {
      assert.ok(cookie.split("; ").includes(attr), `${attr} in ${cookie}`);
    }
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(res.headers.get("content-security-policy"), "frame-ancestors 'none'");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });

  it("redirects to a same-origin next path", async () => {
    const res = await handleLauncherHandoff(get(`?code=${CODE}&next=${encodeURIComponent("/games/42?server=7")}`), mockApi().redeem);
    assert.equal(res.headers.get("location"), "/games/42?server=7&signedin=launcher");
  });

  it("ignores next values that leave the site", async () => {
    for (const next of ["//evil.test", "/\\evil.test", "https://evil.test/", "javascript:alert(1)", "/.//evil.test"]) {
      const res = await handleLauncherHandoff(get(`?code=${CODE}&next=${encodeURIComponent(next)}`), mockApi().redeem);
      assert.equal(res.headers.get("location"), "/?signedin=launcher", next);
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

  describe("login CSRF", () => {
    const refused: [string, Record<string, string | undefined>][] = [
      ["a link on another site", { "sec-fetch-site": "cross-site" }],
      ["a link on a sibling site", { "sec-fetch-site": "same-site" }],
      ["a page of this site", { "sec-fetch-site": "same-origin" }],
      ["an iframe", { "sec-fetch-dest": "iframe" }],
      ["a fetch", { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }],
      ["no fetch metadata", { "sec-fetch-site": undefined, "sec-fetch-dest": undefined }],
      ["a normal browser", { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36" }],
      ["a lookalike user agent", { "user-agent": "Mozilla/5.0 XMetallicLauncher/0.1.0 bridge/1" }],
    ];
    for (const [what, headers] of refused) {
      it(`refuses ${what} without spending the code`, async () => {
        const api = mockApi();
        const res = await handleLauncherHandoff(get(`?code=${CODE}&next=%2Ffriends`, headers), api.redeem);
        assert.equal(res.status, 303);
        assert.equal(res.headers.get("location"), "/signin?handoff=blocked&next=%2Ffriends");
        assert.equal(res.headers.get("set-cookie"), null);
        assert.deepEqual(api.seen, []);
      });
    }

    it("trusts only the Launcher's own top-level navigation", () => {
      assert.equal(isTrustedHandoffRequest(new Headers(LAUNCHER_HEADERS)), true);
      assert.equal(isTrustedHandoffRequest(new Headers()), false);
    });
  });
});
