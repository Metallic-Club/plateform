import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, loadState } from '../src/store.js';
import { proposeTrade, acceptTrade, cancelTrade, pendingTrades, TRADE_LIMIT } from '../src/trade.js';
import { QUESTS, claimQuest, questProgress, weekKey } from '../src/quests.js';
import { giftItem } from '../src/economy.js';
import { recordPlay } from '../src/play.js';
import { firstPartyGames, isFirstParty, genres } from '../src/platform.js';

const day = Date.UTC(2026, 10, 2, 9);
const state = () => structuredClone(defaults);

test('trade offers need a friend, a real offer, and enough balance', () => {
  const s = state();
  assert.equal(proposeTrade(s, 'NotAFriend', { alloy: 10 }, day).ok, false);
  assert.equal(proposeTrade(s, s.friends[0], { alloy: 0 }, day).ok, false);
  assert.equal(proposeTrade(s, s.friends[0], { alloy: 9999999 }, day).ok, false);
  assert.equal(proposeTrade(s, s.friends[0], { alloy: -5 }, day).ok, false);
  assert.equal(proposeTrade(s, s.friends[0], { alloy: 50, item: 'not-owned' }, day).ok, true, 'unknown item is ignored, Alloy still offered');
  assert.equal(pendingTrades(s).length, 2, 'the sample incoming offer plus the new one');
  assert.equal(proposeTrade(s, s.friends[0], { alloy: 50 }, day).ok, false, 'duplicate offer rejected');
  s.blocked = [s.friends[1]];
  assert.equal(proposeTrade(s, s.friends[1], { alloy: 20 }, day).ok, false);
});

test('pending trades are capped, and only the matching side can cancel or accept', () => {
  const s = state();
  s.friends = ['LunaBlocks'];
  for (let i = 0; i < TRADE_LIMIT; i += 1) assert.equal(proposeTrade(s, 'LunaBlocks', { alloy: i + 1 }, day).ok, true);
  assert.equal(proposeTrade(s, 'LunaBlocks', { alloy: 999 }, day).ok, false);
  const outgoing = s.tradeOffers.find(offer => offer.direction === 'out');
  assert.equal(acceptTrade(s, outgoing.id), false, 'you cannot accept your own offer');
  assert.equal(cancelTrade(s, outgoing.id), true);
  assert.equal(cancelTrade(s, outgoing.id), false, 'already cancelled');
  const incoming = s.tradeOffers.find(offer => offer.direction === 'in');
  const before = s.previewAlloy;
  assert.equal(cancelTrade({ tradeOffers: [structuredClone(incoming)] }, incoming.id), true, 'declining an incoming offer is allowed');
  assert.equal(acceptTrade(s, incoming.id, day), true);
  assert.equal(s.previewAlloy, before + incoming.alloy);
  assert.ok(s.savedAssets.includes(incoming.item));
  assert.equal(acceptTrade(s, incoming.id, day), false);
});

test('accessory gifts spend an owned item and respect the five-a-day limit', () => {
  const s = state();
  s.savedAssets = ['signal-cap', 'orbit-shoes'];
  assert.equal(giftItem(s, 'Stranger', 'signal-cap', day).ok, false);
  assert.equal(giftItem(s, s.friends[0], 'grid-shirt', day).ok, false);
  assert.equal(giftItem(s, s.friends[0], 'signal-cap', day).ok, true);
  assert.deepEqual(s.savedAssets, ['orbit-shoes']);
  assert.equal(s.gifts.at(-1).item, 'signal-cap');
  assert.equal(s.gifts.at(-1).amount, 0);
  s.gifts = [0, 1, 2, 3, 4].map(index => ({ id: `gift-${index}-item`, to: s.friends[0], amount: 0, item: 'orbit-shoes', at: day + index }));
  assert.equal(giftItem(s, s.friends[0], 'orbit-shoes', day + 10).ok, false);
  assert.equal(giftItem(s, s.friends[0], 'orbit-shoes', day + 86400000).ok, true);
});

test('weekly quests measure real activity and pay once a week', () => {
  const s = state();
  assert.equal(claimQuest(s, 'play-three', day).ok, false, 'nothing played yet');
  assert.equal(claimQuest(s, 'nope', day).ok, false);
  s.favorites = ['1'];
  assert.equal(claimQuest(s, 'save-one', day).ok, true);
  assert.equal(claimQuest(s, 'save-one', day).ok, false);
  assert.equal(s.previewAlloy, defaults.previewAlloy + 20);
  recordPlay(s, '1', day);
  recordPlay(s, '2', day);
  recordPlay(s, '3', day);
  const progress = questProgress(s, day);
  assert.equal(progress['play-three'], 3);
  assert.equal(progress['two-genres'], 2);
  assert.equal(claimQuest(s, 'play-three', day).ok, true);
  assert.equal(claimQuest(s, 'play-three', day + 7 * 86400000).ok, false, 'needs activity in the new week');
  assert.equal(weekKey(day), weekKey(day + 3600000));
  assert.equal(QUESTS.length, 3);
});

test('first-party titles are catalog ids with a studio flag', () => {
  assert.ok(firstPartyGames.every(id => /^\d+$/.test(id)));
  assert.equal(isFirstParty('1'), true);
  assert.equal(isFirstParty(1), true);
  assert.equal(isFirstParty('999'), false);
  assert.ok(genres.length > 0);
});

test('trades, quests, blocks, and reports survive a storage round trip', () => {
  const saved = loadState({ getItem: () => JSON.stringify({
    blocked: ['LunaBlocks', 'LunaBlocks', 'bad name', defaults.profile.name],
    reports: 2,
    claimedQuests: { '2026-W45': ['play-three', 'play-three', 'unknown'], garbage: ['play-three'] },
    tradeOffers: [{ id: 'trade-3-25', direction: 'out', counterpart: 'heroX_x', alloy: 25, item: 'signal-cap', status: 'pending', at: day },
      { id: 'bad id', direction: 'out', counterpart: 'heroX_x', alloy: 25, at: day },
      { id: 'trade-4-10', direction: 'sideways', counterpart: 'heroX_x', alloy: 10, at: day }],
  }) });
  assert.deepEqual(saved.blocked, ['LunaBlocks']);
  assert.equal(saved.reports, 2);
  assert.deepEqual(saved.claimedQuests, { '2026-W45': ['play-three'] });
  assert.equal(saved.tradeOffers.length, 1);
  assert.equal(saved.tradeOffers[0].item, 'signal-cap');
  assert.equal(loadState({ getItem: () => JSON.stringify({ blocked: 'nope', reports: -3 }) }).blocked.length, 0);
});
