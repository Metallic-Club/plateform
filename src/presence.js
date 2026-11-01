import { personInfo } from './avatar.js';

const labels = { offline: 'Offline', online: 'Online', playing: 'Playing a game', studio: 'Using Studio' };
export function resolvePresence(person = {}) {
  const status = String(person.status || person.activity || '').toLowerCase();
  let key = 'offline';
  if (person.hidden || person.invisible || ['offline', 'invisible', 'hidden'].includes(status)) key = 'offline';
  else if (status.includes('studio')) key = 'studio';
  else if (person.game || status === 'playing' || status.startsWith('playing ')) key = 'playing';
  else if (status === 'online') key = 'online';
  return { key, label: labels[key] };
}
export const presenceFor = (state, name) => resolvePresence(name === state.profile.name
  ? { status: state.activity ? 'online' : 'hidden' } : personInfo(name));
