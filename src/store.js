import { games } from './catalog.js';
import { genres, cosmeticSlots, creatorTypes } from './platform.js';
import { DEFAULT_ALLOY, normalizeSocialState } from './social.js';
import { isTheme } from './theme.js';
export const STORAGE_KEY = 'metallic-demo-v1';
export const outfits = ['Classic', 'Explorer', 'Streetwear'];
export const accessories = ['None', 'Cap', 'Headphones'];
export const templates = ['Blank canvas', 'Obby', 'Open world', 'Social hangout'];
export const colors = [
  { value: '#394c60', name: 'Slate blue' }, { value: '#7e4fba', name: 'Violet' },
  { value: '#a84354', name: 'Crimson' }, { value: '#3e8274', name: 'Forest' },
  { value: '#d0a554', name: 'Gold' }, { value: '#e5e7eb', name: 'Cloud' },
  { value: '#24262b', name: 'Charcoal' }, { value: '#d97c47', name: 'Terracotta' },
];
export const defaults = {
  profile: { name: 'RavenDev', bio: 'Building worlds. Finding adventures.', visibility: 'Everyone' },
  outfit: 'Classic', color: '#394c60', accessory: 'None', favorites: [], friends: ['heroX_x', 'CRIMSONSLAYER', '00RIP_INDRA'],
  requests: ['PixelNova', 'CloudBuilder'], outgoing: [], projects: [], notifications: true, activity: true, launcherDismissed: false,
  preferredGenres: [], hiddenGames: [], creatorAssets: [], savedAssets: [], readNotifications: [],
  updateNotifications: true, friendPolicy: 'Everyone',
  previewAlloy: DEFAULT_ALLOY, reservedServers: [], myGroups: [], groupMemberships: [], groupRequests: [], joinPolicy: 'Friends',
  playHistory: [], lastDailyClaim: '', gifts: [], theme: 'charcoal', links: { discord: '', youtube: '', twitch: '', tiktok: '' },
};
const username = value => typeof value === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(value);
const gameIds = new Set(games.map(game => game.id));
const unique = (list, valid, limit = 200) => [...new Set(list.filter(valid))].slice(0, limit);
export function loadState(storage) {
  const state = structuredClone(defaults);
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return state;
    if (Array.isArray(data.favorites)) state.favorites = unique(data.favorites, id => gameIds.has(id));
    if (Array.isArray(data.hiddenGames)) state.hiddenGames = unique(data.hiddenGames, id => gameIds.has(id));
    if (Array.isArray(data.preferredGenres)) state.preferredGenres = unique(data.preferredGenres, genre => genres.includes(genre), 6);
    for (const key of ['savedAssets', 'readNotifications']) if (Array.isArray(data[key])) state[key] = unique(data[key], value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value));
    if (Array.isArray(data.creatorAssets)) {
      const ids = new Set();
      state.creatorAssets = data.creatorAssets.filter(asset => asset && typeof asset.id === 'string' && /^[\w-]{1,64}$/.test(asset.id)
        && typeof asset.name === 'string' && asset.name.trim() && Object.hasOwn(creatorTypes, asset.type) && asset.type !== 'games')
        .filter(asset => !ids.has(asset.id) && ids.add(asset.id)).slice(0, 100).map(asset => ({
          id: asset.id, name: asset.name.trim().slice(0, 60), type: asset.type,
          subcategory: asset.type === 'cosmetics' ? (cosmeticSlots.includes(asset.subcategory) ? asset.subcategory : 'Hats') : (typeof asset.subcategory === 'string' ? asset.subcategory.slice(0, 30) : ''),
          description: typeof asset.description === 'string' ? asset.description.slice(0, 500) : '',
          price: Number.isSafeInteger(asset.price) ? Math.max(0, Math.min(asset.price, 1000000)) : 0,
          listing: asset.listing === true,
        }));
    }
    for (const key of ['friends', 'requests', 'outgoing']) if (Array.isArray(data[key])) state[key] = unique(data[key], username);
    state.requests = state.requests.filter(name => !state.friends.includes(name));
    state.outgoing = state.outgoing.filter(name => !state.friends.includes(name) && !state.requests.includes(name));
    if (Array.isArray(data.projects)) {
      const ids = new Set();
      state.projects = data.projects.filter(p => p && typeof p.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(p.id)
        && typeof p.name === 'string' && p.name.trim() && templates.includes(p.template))
        .filter(p => !ids.has(p.id) && ids.add(p.id)).slice(0, 100)
        .map(p => ({ id: p.id, name: p.name.trim().slice(0, 60), template: p.template,
          description: typeof p.description === 'string' ? p.description.slice(0, 500) : '', groupId: typeof p.groupId === 'string' ? p.groupId : '' }));
    }
    if (data.profile && typeof data.profile === 'object') {
      if (username(data.profile.name)) state.profile.name = data.profile.name;
      if (typeof data.profile.bio === 'string') state.profile.bio = data.profile.bio.slice(0, 240);
      if (['Everyone', 'Friends only', 'Only me'].includes(data.profile.visibility)) state.profile.visibility = data.profile.visibility;
    }
    if (outfits.includes(data.outfit)) state.outfit = data.outfit;
    if (accessories.includes(data.accessory)) state.accessory = data.accessory;
    if (typeof data.color === 'string' && /^#[a-f0-9]{6}$/i.test(data.color)) state.color = data.color;
    for (const key of ['notifications', 'activity', 'launcherDismissed', 'updateNotifications']) if (typeof data[key] === 'boolean') state[key] = data[key];
    if (['Everyone', 'Friends of friends', 'Nobody'].includes(data.friendPolicy)) state.friendPolicy = data.friendPolicy;
    if (Array.isArray(data.playHistory)) {
      const seen = new Set();
      state.playHistory = data.playHistory.filter(entry => entry && gameIds.has(String(entry.id)) && Number.isFinite(entry.at))
        .filter(entry => !seen.has(String(entry.id)) && seen.add(String(entry.id))).slice(0, 12).map(entry => ({ id: String(entry.id), at: entry.at }));
    }
    if (typeof data.lastDailyClaim === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.lastDailyClaim)) state.lastDailyClaim = data.lastDailyClaim;
    if (isTheme(data.theme)) state.theme = data.theme;
    if (data.links && typeof data.links === 'object' && !Array.isArray(data.links)) {
      for (const key of ['discord', 'youtube', 'twitch', 'tiktok']) if (typeof data.links[key] === 'string') state.links[key] = data.links[key].trim().slice(0, 80);
    }
    if (Array.isArray(data.gifts)) {
      state.gifts = data.gifts.filter(gift => gift && /^[\w-]{1,40}$/.test(String(gift.id)) && username(gift.to)
        && Number.isSafeInteger(gift.amount) && gift.amount > 0 && gift.amount <= 500 && Number.isFinite(gift.at))
        .slice(-50).map(gift => ({ id: String(gift.id), to: gift.to, amount: gift.amount, at: gift.at }));
    }
    normalizeSocialState(data, state);
  } catch { /* Unavailable or corrupt storage uses safe defaults. */ }
  return state;
}
export function saveState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function filterGames(games, query = '', category = 'All', sort = 'recommended') {
  const result = games.filter(g => (category === 'All' || g.genre === category) && `${g.title} ${g.genre}`.toLowerCase().includes(query.trim().toLowerCase()));
  if (sort === 'players') {
    const count = value => parseFloat(value) * (value.endsWith('K') ? 1000 : 1);
    return result.sort((a, b) => count(b.playing) - count(a.playing));
  }
  return sort === 'rating' ? result.sort((a, b) => b.rating - a.rating) : sort === 'name' ? result.sort((a,b) => a.title.localeCompare(b.title)) : result;
}
// Preview transitions model requests without contacting real users.
export function updateFriendship(state, action, name) {
  if (!username(name) || name === state.profile.name) return false;
  if (action === 'send' && ![...state.friends, ...state.requests, ...state.outgoing].includes(name)) state.outgoing.push(name);
  else if (action === 'accept' && state.requests.includes(name)) {
    state.requests = state.requests.filter(n => n !== name);
    state.outgoing = state.outgoing.filter(n => n !== name);
    if (!state.friends.includes(name)) state.friends.push(name);
  } else if (action === 'decline') state.requests = state.requests.filter(n => n !== name);
  else if (action === 'cancel') state.outgoing = state.outgoing.filter(n => n !== name);
  else if (action === 'remove') state.friends = state.friends.filter(n => n !== name);
  else return false;
  return true;
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
