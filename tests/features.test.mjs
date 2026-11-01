import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, loadState } from '../src/store.js';
import { games } from '../src/catalog.js';
import { recordPlay, historyGames, HISTORY_LIMIT } from '../src/play.js';
import { claimDaily, canClaimDaily, sendGift, DAILY_REWARD, recentGifts } from '../src/economy.js';
import { themes, themeIds, applyTheme, isTheme } from '../src/theme.js';

const day = Date.UTC(2026, 10, 1, 12);

test('play history keeps the newest first, one entry per game, and bounded', () => {
  const state = structuredClone(defaults);
  assert.equal(recordPlay(state, '3', day), true);
  assert.equal(recordPlay(state, 'not-a-game', day), false);
  recordPlay(state, '1', day + 1000);
  recordPlay(state, '3', day + 2000);
  assert.deepEqual(state.playHistory.map(entry => entry.id), ['3', '1']);
  assert.equal(state.playHistory[0].at, day + 2000);
  for (const game of games) recordPlay(state, game.id, day);
  assert.equal(state.playHistory.length, HISTORY_LIMIT);
  assert.deepEqual(historyGames(games, state).slice(0, 1).map(game => game.id), [state.playHistory[0].id]);
  assert.ok(historyGames(games, state).every(game => games.includes(game)));
});

test('the daily reward is claimable once per day and adds one amount', () => {
  const state = structuredClone(defaults);
  assert.equal(canClaimDaily(state, day), true);
  const start = state.previewAlloy;
  assert.deepEqual(claimDaily(state, day), { ok: true, amount: DAILY_REWARD });
  assert.equal(state.previewAlloy, start + DAILY_REWARD);
  assert.equal(canClaimDaily(state, day + 3600000), false);
  assert.equal(claimDaily(state, day + 3600000).ok, false);
  assert.equal(state.previewAlloy, start + DAILY_REWARD);
  assert.equal(claimDaily(state, day + 86400000).ok, true);
});

test('gifts require a friend, a sane amount, and a funded balance', () => {
  const state = structuredClone(defaults);
  assert.equal(sendGift(state, 'Nobody', 50, day).ok, false);
  assert.equal(sendGift(state, state.friends[0], 5, day).ok, false);
  assert.equal(sendGift(state, state.friends[0], 501, day).ok, false);
  assert.equal(sendGift(state, state.friends[0], 50.5, day).ok, false);
  const start = state.previewAlloy;
  const result = sendGift(state, state.friends[0], 50, day);
  assert.equal(result.ok, true);
  assert.equal(state.previewAlloy, start - 50);
  assert.equal(state.gifts.length, 1);
  assert.equal(recentGifts(state)[0].to, state.friends[0]);
  state.previewAlloy = 5;
  assert.equal(sendGift(state, state.friends[1], 50, day).ok, false);
  for (let i = 0; i < 5; i += 1) sendGift(state, 'LunaBlocks', 0 === i ? 0 : 0, day);
});

test('one friend can receive at most five gifts a day', () => {
  const state = structuredClone(defaults);
  state.friends = ['LunaBlocks'];
  state.previewAlloy = 10000;
  for (let i = 0; i < 5; i += 1) assert.equal(sendGift(state, 'LunaBlocks', 10, day).ok, true);
  assert.equal(sendGift(state, 'LunaBlocks', 10, day).ok, false);
  assert.equal(sendGift(state, 'LunaBlocks', 10, day + 86400000).ok, true);
});

test('themes are a closed list and apply to a root element', () => {
  assert.ok(themeIds.includes('charcoal') && themeIds.includes('slate') && themeIds.includes('ember'));
  assert.equal(themes.length, themeIds.length);
  assert.equal(isTheme('__proto__'), false);
  const root = { dataset: {} };
  assert.equal(applyTheme({ theme: 'ember' }, root), 'ember');
  assert.equal(root.dataset.theme, 'ember');
  assert.equal(applyTheme({ theme: 'nonsense' }, root), 'charcoal');
  assert.equal(root.dataset.theme, 'charcoal');
  assert.equal(applyTheme({ theme: 'slate' }, null), 'charcoal');
});

test('new preview state migrates and is normalized from old saves', () => {
  const fresh = loadState({ getItem: () => JSON.stringify({ profile: defaults.profile, favorites: ['1'] }) });
  assert.deepEqual(fresh.playHistory, []);
  assert.deepEqual(fresh.gifts, []);
  assert.equal(fresh.theme, 'charcoal');
  assert.deepEqual(fresh.links, { discord: '', youtube: '', twitch: '', tiktok: '' });
  assert.equal(fresh.lastDailyClaim, '');

  const saved = loadState({ getItem: () => JSON.stringify({
    theme: 'ember',
    links: { discord: '  raven  ', youtube: 'x'.repeat(200), twitch: 42, tiktok: '<script>' },
    playHistory: [{ id: '1', at: day }, { id: '1', at: day + 1 }, { id: 'missing', at: day }, { id: '2', at: 'soon' }],
    gifts: [{ id: 'gift-1-25', to: 'LunaBlocks', amount: 25, at: day }, { id: 'bad id', to: 'LunaBlocks', amount: 25, at: day }, { id: 'gift-2-0', to: 'LunaBlocks', amount: 0, at: day }],
  }) });
  assert.equal(saved.theme, 'ember');
  assert.equal(saved.links.discord, 'raven');
  assert.equal(saved.links.youtube.length, 80);
  assert.equal(saved.links.twitch, '');
  assert.equal(saved.links.tiktok, '<script>');
  assert.deepEqual(saved.playHistory.map(entry => entry.id), ['1']);
  assert.equal(saved.gifts.length, 1);
  assert.equal(saved.gifts[0].id, 'gift-1-25');

  assert.equal(loadState({ getItem: () => JSON.stringify({ theme: 'light' }) }).theme, 'charcoal');
});
