import test from 'node:test';
import assert from 'node:assert/strict';
import { games } from '../src/catalog.js';
import { defaults, loadState } from '../src/store.js';
import { recommendGames, discoverGames, gameDetails, mutualFriends, marketplaceAssets, assetMatches, cosmeticSlots } from '../src/platform.js';

test('game recommendations respond to selected genres and saved favorites', () => {
  const state = structuredClone(defaults);
  state.preferredGenres = ['Racing'];
  assert.equal(recommendGames(games, state)[0].genre, 'Racing');
  state.preferredGenres = [];
  state.favorites = ['5'];
  const recommended = recommendGames(games, state);
  assert.equal(recommended[0].genre, 'Simulation');
  assert.notEqual(recommended[0].id, '5');
  assert.equal(games[0].id, '1');
});
test('hidden games leave discovery and filters combine without losing preferences', () => {
  const state = structuredClone(defaults);
  state.hiddenGames = ['13'];
  state.favorites = ['5'];
  const results = discoverGames(games, state, new URLSearchParams('category=Simulation&mood=Relaxed&mode=Co-op&rating=90&unplayed=1'));
  assert.equal(results.length, 0);
  state.hiddenGames = [];
  const visible = discoverGames(games, state, new URLSearchParams('category=Simulation&mood=Relaxed&mode=Co-op&rating=90&unplayed=1'));
  assert.deepEqual(visible.map(game => game.id), ['13']);
  assert.ok(visible.every(game => gameDetails[game.id].mode === 'Co-op'));
});
test('mutual friends are an actual intersection with no duplicate or self entries', () => {
  const state = structuredClone(defaults);
  assert.deepEqual(mutualFriends(state, 'heroX_x'), ['CRIMSONSLAYER', '00RIP_INDRA']);
  state.friends = ['CRIMSONSLAYER', 'CRIMSONSLAYER'];
  assert.deepEqual(mutualFriends(state, 'heroX_x'), ['CRIMSONSLAYER']);
  assert.deepEqual(mutualFriends(state, 'unknown'), []);
});
test('marketplace combines asset type, cosmetic slot, search, and price', () => {
  const shoes = marketplaceAssets.filter(asset => assetMatches(asset, new URLSearchParams('type=cosmetics&slot=Shoes&price=paid&q=Orbit')));
  assert.deepEqual(shoes.map(asset => asset.id), ['orbit-shoes']);
  const free = marketplaceAssets.filter(asset => assetMatches(asset, new URLSearchParams('price=free')));
  assert.ok(free.length > 0 && free.every(asset => asset.price === 0));
  for (const slot of ['Hats', 'Shirts', 'Pants', 'Shoes', 'Shoulders', 'Back', 'Neck']) assert.ok(cosmeticSlots.includes(slot));
});
test('new creator and discovery state migrates safely from old browser saves', () => {
  const state = loadState({ getItem: () => JSON.stringify({ profile: defaults.profile, projects: [] }) });
  assert.deepEqual(state.creatorAssets, []);
  assert.deepEqual(state.preferredGenres, []);
  assert.equal(state.updateNotifications, true);
  assert.deepEqual(state.readNotifications, []);
});
test('asset listing drafts and game preferences are normalized before rendering', () => {
  const state = loadState({ getItem: () => JSON.stringify({ preferredGenres: ['Racing', 'Racing', 'invalid'],
    creatorAssets: [{ id: 'asset-1', name: ' Shoes ', type: 'cosmetics', subcategory: 'Shoes', price: 125, listing: true },
      { id: 'asset-1', name: 'Duplicate', type: 'cosmetics' }, { id: 'bad', name: 'Invalid', type: '__proto__' }],
    savedAssets: ['orbit-shoes', '"><img>'], readNotifications: ['welcome', 'request-PixelNova'] }) });
  assert.deepEqual(state.preferredGenres, ['Racing']);
  assert.equal(state.creatorAssets.length, 1);
  assert.equal(state.creatorAssets[0].name, 'Shoes');
  assert.equal(state.creatorAssets[0].price, 125);
  assert.equal(state.creatorAssets[0].listing, true);
  assert.deepEqual(state.savedAssets, ['orbit-shoes']);
});
