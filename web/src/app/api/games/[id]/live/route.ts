import { ApiError, getApi } from "@/lib/api";

/** Live player and server count for one game, polled by the game page. Wraps GET /v1/games/live. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/[id]/live">) {
  const { id } = await ctx.params;
  try {
    const [count] = await (await getApi()).getLiveCounts([id]);
    if (!count) return Response.json({ code: "not_found", title: "Game not found" }, { status: 404 });
    // The spec says counts may be cached for 15 seconds.
    return Response.json(count, { headers: { "cache-control": "public, max-age=15" } });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return Response.json({ code: e instanceof ApiError ? e.code : "error", title: "Could not load the live count" }, { status });
  }
}
