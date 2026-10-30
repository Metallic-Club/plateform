import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp";
import { COOKIES, MOCK_SCENARIOS, THEMES } from "@/lib/prefs";

/*
 * Runs before every page:
 *
 * 1. Content-Security-Policy with a fresh nonce (plateform #7, section 5).
 *    Next.js reads the nonce from the request's CSP header and puts it on its
 *    own scripts. HSTS and the other static headers are in next.config.ts.
 *
 * 2. Query flags that stick as cookies, so a host or reviewer sets them once:
 *      ?shell=launcher|browser  preview override; the Launcher itself is
 *                               detected from its user agent (lib/launcher-ua.ts)
 *      ?display=tv|standard     10-foot / controller layout
 *      ?theme=graphite|titanium|light|system
 *      ?mock=normal|empty|error|slow|guest   preview scenarios (mock API only)
 *    The flag is applied to this request too, so the first render already matches.
 */
const FLAGS: { param: string; cookie: string; allowed: readonly string[] }[] = [
  { param: "shell", cookie: COOKIES.shell, allowed: ["launcher", "browser"] },
  { param: "display", cookie: COOKIES.display, allowed: ["tv", "standard"] },
  { param: "theme", cookie: COOKIES.theme, allowed: THEMES.map((t) => t.id) },
  { param: "mock", cookie: COOKIES.mock, allowed: MOCK_SCENARIOS },
];

const YEAR = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const updates: [string, string][] = [];
  for (const f of FLAGS) {
    const v = url.searchParams.get(f.param);
    if (v && f.allowed.includes(v)) updates.push([f.cookie, v]);
  }
  // Updates the request's Cookie header, so it must run before the copy below.
  for (const [name, value] of updates) request.cookies.set(name, value);

  const https = url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp({ nonce: makeNonce(), dev: process.env.NODE_ENV === "development", https });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  for (const [name, value] of updates) {
    response.cookies.set(name, value, { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|api/|healthz$|icon|favicon|.*\.(?:png|svg|ico|jpg|webp|txt)$).*)",
      // Prefetches carry no document, so they need no policy.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
