"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, getApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/launcher-handoff";
import { COOKIES, MOCK_SCENARIOS, THEMES } from "@/lib/prefs";

const YEAR = 60 * 60 * 24 * 365;

const allowed: Record<keyof typeof COOKIES, readonly string[]> = {
  theme: THEMES.map((t) => t.id),
  shell: ["browser", "launcher"],
  display: ["standard", "tv"],
  mock: MOCK_SCENARIOS,
};

export async function setPreference(kind: keyof typeof COOKIES, value: string) {
  if (!allowed[kind]?.includes(value)) throw new Error(`Invalid ${kind}`);
  (await cookies()).set(COOKIES[kind], value, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

export type LaunchResult =
  | { ok: true; launchUri: string }
  | { ok: false; reason: "signin" | "full" | "failed" };

/**
 * A join ticket's launch link (POST /v1/games/{gameId}/join), for the Launcher's
 * `play` bridge command. The browser path is still the /play/<gameId> redirect.
 */
export async function createLaunchUri(
  gameId: string,
  opts: { serverId?: string; followUserId?: string } = {},
): Promise<LaunchResult> {
  if (typeof gameId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(gameId)) return { ok: false, reason: "failed" };
  const req = opts.serverId ? { serverId: String(opts.serverId) } : opts.followUserId ? { followUserId: String(opts.followUserId) } : {};
  try {
    const ticket = await (await getApi()).createJoinTicket(gameId, req);
    if (!/^metallic:\/\/play\?/.test(ticket.launchUri)) return { ok: false, reason: "failed" };
    return { ok: true, launchUri: ticket.launchUri };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { ok: false, reason: "signin" };
    if (e instanceof ApiError && e.code === "server_full") return { ok: false, reason: "full" };
    return { ok: false, reason: "failed" };
  }
}

/** The site's own sign-out. In the Launcher the caller also sends the bridge's `signOut`. */
export async function signOut() {
  try {
    await (await getApi()).logOut();
  } catch {
    // The cookie is cleared below either way; the API session expires on its own.
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signin?signedout=1");
}
