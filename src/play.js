// Play history keeps the newest first and one entry per game.
export const HISTORY_LIMIT = 12;
export function recordPlay(state, gameId, now = Date.now()) {
  const id = String(gameId);
  if (!/^\d+$/.test(id)) return false;
  state.playHistory = [{ id, at: now }, ...state.playHistory.filter(entry => entry.id !== id)].slice(0, HISTORY_LIMIT);
  return true;
}
export function historyGames(catalog, state) {
  const byId = new Map(catalog.map(game => [game.id, game]));
  return state.playHistory.map(entry => byId.get(entry.id)).filter(Boolean);
}
