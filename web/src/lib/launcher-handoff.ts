/**
 * GET /auth/launcher-handoff?code=...&next=...  (plateform #7, section 4)
 *
 * The Launcher signs in with the device flow and holds the tokens. Its web
 * view has a separate cookie jar, so it asks the API for a one-time code
 * (POST /v1/oauth/web-session, bearer) and opens this route with it. Here the
 * site redeems the code server-side, sets the normal website session cookie and
 * redirects to `/` or to a same-origin `next` path. A used, expired or malformed
 * code lands on the sign-in page with a short explanation.
 *
 * Login CSRF: a hostile page could send someone's browser here with the
 * attacker's own code and sign them in as the attacker. So the code is only
 * redeemed for a top-level navigation nobody else started: the Launcher's own
 * navigation sends `Sec-Fetch-Site: none` and `Sec-Fetch-Dest: document`, a
 * link or form on another site sends `cross-site`, an iframe sends `iframe`.
 * The Launcher user agent is required as well (another browser has no reason
 * to come here). Refused requests never reach the API, so the code is not
 * spent. After a good handoff the page shows "Signed in as ... Not you?"
 * (`signedin=launcher` on the target, read by HandoffNotice).
 *
 * Kept free of Next imports (the route file wires it up), so the Node test
 * runner can load it directly.
 */
import { isLauncherUserAgent } from "./launcher-ua.ts";
import { safeNextPath } from "./safe-next.ts";

export const SESSION_COOKIE = "metallic_session";
/** 30 days, the API's session lifetime (SetSessionCookie in api/openapi.yaml). */
export const DEFAULT_SESSION_MAX_AGE = 2_592_000;

export type WebSessionRedemption =
  | { ok: true; session: string; maxAge?: number }
  | { ok: false; reason: "invalid" | "unavailable" };

export type Redeem = (code: string) => Promise<WebSessionRedemption>;

// Codes are opaque, URL-safe and short-lived; anything else is not worth a call.
const CODE = /^[A-Za-z0-9_-]{16,256}$/;
// Cookie values the API may hand back: RFC 6265 cookie-octets minus a few.
const SESSION_VALUE = /^[A-Za-z0-9._~+/=-]{16,1024}$/;

// Only used to resolve `next`; the redirect itself is a relative Location, so
// it stays on whatever host served the request.
const RESOLVE_ORIGIN = "https://site.invalid";

function redirect(location: string, extra: [string, string][] = []): Response {
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    // The code is in this URL; do not leak it to the next page's requests.
    "referrer-policy": "no-referrer",
    // Never inside a frame, even though this answer is only a redirect.
    "content-security-policy": "frame-ancestors 'none'",
    "x-frame-options": "DENY",
  });
  for (const [k, v] of extra) headers.append(k, v);
  return new Response(null, { status: 303, headers });
}

/** The query flag HandoffNotice looks for on the page the handoff lands on. */
export const SIGNED_IN_PARAM = "signedin";

function toSignIn(reason: "expired" | "failed" | "blocked", next: string): Response {
  const q = new URLSearchParams({ handoff: reason });
  if (next !== "/") q.set("next", next);
  return redirect(`/signin?${q.toString()}`);
}

/**
 * True only for a top-level navigation the Launcher started itself. Fetch
 * metadata is required: WebView2 (Chromium) always sends it, and a client
 * that leaves it out cannot prove where the navigation came from.
 */
export function isTrustedHandoffRequest(headers: Headers): boolean {
  return (
    isLauncherUserAgent(headers.get("user-agent")) &&
    headers.get("sec-fetch-site") === "none" &&
    headers.get("sec-fetch-dest") === "document"
  );
}

function withSignedInFlag(next: string): string {
  const url = new URL(next, RESOLVE_ORIGIN);
  url.searchParams.set(SIGNED_IN_PARAM, "launcher");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function handleLauncherHandoff(request: Request, redeem: Redeem): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), RESOLVE_ORIGIN);
  if (!isTrustedHandoffRequest(request.headers)) return toSignIn("blocked", next);
  const code = url.searchParams.get("code");
  if (!code || !CODE.test(code)) return toSignIn("expired", next);

  let result: WebSessionRedemption;
  try {
    result = await redeem(code);
  } catch {
    result = { ok: false, reason: "unavailable" };
  }
  if (!result.ok) return toSignIn(result.reason === "invalid" ? "expired" : "failed", next);
  if (!SESSION_VALUE.test(result.session)) return toSignIn("failed", next);

  const maxAge =
    typeof result.maxAge === "number" && Number.isInteger(result.maxAge) && result.maxAge > 0
      ? Math.min(result.maxAge, DEFAULT_SESSION_MAX_AGE)
      : DEFAULT_SESSION_MAX_AGE;
  return redirect(withSignedInFlag(next), [["set-cookie", sessionCookie(result.session, maxAge)]]);
}
