import { games } from './catalog.js';

// Weekly earning quests, all derived from history and favorites the browser already holds.
export const QUESTS = [
  { id: 'play-three', title: 'Open three different games', detail: 'History counts a game once, so three worlds means three titles.', reward: 50, target: 3 },
  { id: 'two-genres', title: 'Play across two genres', detail: 'Step outside your usual shelf for one of them.', reward: 30, target: 2 },
  { id: 'save-one', title: 'Save a favorite game', detail: 'Favorites feed your recommendations as well.', reward: 20, target: 1 },
];
export const questById = id => QUESTS.find(quest => quest.id === id) || null;
export function weekKey(now = Date.now()) {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  return `${date.getUTCFullYear()}-W${String(Math.floor((day + new Date(start).getUTCDay()) / 7) + 1).padStart(2, '0')}`;
}
export function questProgress(state, now = Date.now()) {
  const week = weekKey(now);
  const played = state.playHistory.filter(entry => weekKey(entry.at) === week)
    .map(entry => games.find(game => game.id === entry.id)).filter(Boolean);
  const genres = new Set(played.map(game => game.genre));
  return { 'play-three': Math.min(played.length, 3), 'two-genres': Math.min(genres.size, 2), 'save-one': Math.min(state.favorites.length, 1) };
}
export function claimQuest(state, id, now = Date.now()) {
  const quest = questById(id);
  if (!quest) return { ok: false, error: 'That quest does not exist.' };
  const key = weekKey(now);
  const claimed = state.claimedQuests[key] || [];
  if (claimed.includes(id)) return { ok: false, error: 'Already claimed this week.' };
  if ((questProgress(state, now)[id] || 0) < quest.target) return { ok: false, error: 'Finish the quest first.' };
  state.claimedQuests = { [key]: [...claimed, id] };
  state.previewAlloy = Math.min(state.previewAlloy + quest.reward, 1000000000);
  return { ok: true, amount: quest.reward, week: key };
}
