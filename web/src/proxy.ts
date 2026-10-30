import { NextResponse, type NextRequest } from "next/server";
import { COOKIES, MOCK_SCENARIOS, THEMES } from "@/lib/prefs";

/*
 * Query flags that stick as cookies, so a host sets them once:
 *   ?shell=launcher|browser  the desktop launcher's web view opens the site with shell=launcher
 *   ?display=tv|standard     10-foot / controller layout
 *   ?theme=graphite|aluminium|anodised
 *   ?mock=normal|empty|error|slow|guest   preview scenarios (mock API only)
 * The flag is applied to this request too, so the first render already matches.
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
  if (updates.length === 0) return NextResponse.next();

  for (const [name, value] of updates) request.cookies.set(name, value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const [name, value] of updates) {
    response.cookies.set(name, value, { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/|api/|icon|favicon|.*\\.(?:png|svg|ico|jpg|webp|txt)$).*)"],
};
