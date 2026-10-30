import { getApi } from "@/lib/api";
import { handleLauncherHandoff } from "@/lib/launcher-handoff";

/*
 * The Launcher opens this after its device sign-in, with a one-time code from
 * POST /v1/oauth/web-session. The logic (code check, session cookie, safe
 * `next`) lives in lib/launcher-handoff.ts, where it is unit tested.
 */
export async function GET(request: Request) {
  return handleLauncherHandoff(request, async (code) => (await getApi()).redeemWebSession(code));
}
