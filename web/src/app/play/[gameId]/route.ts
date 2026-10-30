import { ApiError, getApi } from "@/lib/api";

/*
 * Join: get a single-use ticket and hand the launch link to the launcher.
 * A GET with a side effect, on purpose: it has to work as a plain link inside
 * the launcher's web view. Tickets expire in 60 seconds, so a stray request
 * costs nothing. Links to it are plain <a> tags, never prefetched.
 */
export async function GET(req: Request, ctx: RouteContext<"/play/[gameId]">) {
  const { gameId } = await ctx.params;
  const url = new URL(req.url);
  const serverId = url.searchParams.get("server") ?? undefined;
  const followUserId = url.searchParams.get("follow") ?? undefined;
  const back = (reason: string) => Response.redirect(new URL(`/games/${encodeURIComponent(gameId)}?join=${reason}`, url), 303);
  try {
    const api = await getApi();
    const ticket = await api.createJoinTicket(gameId, serverId ? { serverId } : followUserId ? { followUserId } : {});
    return new Response(null, { status: 303, headers: { location: ticket.launchUri, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return Response.redirect(new URL(`/signin?next=${encodeURIComponent(`/games/${gameId}`)}`, url), 303);
    }
    if (e instanceof ApiError && e.code === "server_full") return back("full");
    return back("failed");
  }
}
