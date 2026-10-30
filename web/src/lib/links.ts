/**
 * Where Play and Join buttons point. The /play route asks the API for a join
 * ticket (POST /v1/games/{gameId}/join) and redirects to the ticket's
 * metallic:// launchUri, which the installed launcher handles.
 */
export function joinHref(gameId: string, opts: { serverId?: string; followUserId?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.serverId) q.set("server", opts.serverId);
  else if (opts.followUserId) q.set("follow", opts.followUserId);
  const s = q.toString();
  return `/play/${encodeURIComponent(gameId)}${s ? `?${s}` : ""}`;
}
