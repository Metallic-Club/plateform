import { games } from './catalog.js';
import { community } from './avatar.js';
import { filterGames } from './store.js';
import { getGroups } from './social.js';

export function searchSite(state, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { games: [], people: [], groups: [] };
  const people = [{ name: state.profile.name, own: true }, ...community, ...state.friends.map(name => ({ name }))];
  const seen = new Set();
  return {
    games: filterGames(games, q),
    people: people.filter(person => !seen.has(person.name.toLowerCase()) && seen.add(person.name.toLowerCase())).filter(person => person.name.toLowerCase().includes(q)),
    groups: getGroups(state).filter(group => (group.name + ' ' + group.description + ' ' + group.category).toLowerCase().includes(q)),
  };
}
