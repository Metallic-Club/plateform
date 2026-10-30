import { ApiError, getApi } from "@/lib/api";

/** Live player count for one game, polled by the game page. */
export async function GET(_req: Request, ctx: RouteContext<"/api/games/[id]/presence">) {
  const { id } = await ctx.params;
  try {
    const presence = await (await getApi()).getPresence(id);
    return Response.json(presence, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return Response.json({ message: e instanceof Error ? e.message : "Unknown error" }, { status });
  }
}
