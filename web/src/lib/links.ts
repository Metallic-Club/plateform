/** Deep link the desktop launcher handles. */
export function playHref(placeId: string, serverId?: string) {
  const q = new URLSearchParams({ place: placeId });
  if (serverId) q.set("server", serverId);
  return `metallic://play?${q.toString()}`;
}
