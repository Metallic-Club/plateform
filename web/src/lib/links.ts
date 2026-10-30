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

/**
 * Links that leave the site. Only plain `https` URLs qualify: the Launcher
 * opens those in the system browser and blocks every other scheme, and in a
 * browser nothing else belongs on a profile either. Returns null otherwise.
 */
export function externalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
