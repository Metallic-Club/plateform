import { resolvePresence, presenceFor } from '../src/presence.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/store.js';
import { searchSite } from '../src/search.js';
import { groupsForProfile, groupRole, findGroup, friendActivity, updateGroupMembership } from '../src/social.js';

test('site search finds games, people, and groups without duplicate people', () => {
  const state = structuredClone(defaults);
  assert.ok(searchSite(state, '  CYBER  ').games.some(game => game.id === '1'));
  assert.equal(searchSite(state, 'hero').people.filter(person => person.name === 'heroX_x').length, 1);
  assert.ok(searchSite(state, 'METALLIC').groups.some(group => group.id === 'metallic-studio'));
  assert.ok(searchSite(state, state.profile.name).people.some(person => person.own));
  assert.deepEqual(searchSite(state, '   '), { games: [], people: [], groups: [] });
  assert.deepEqual(searchSite(state, '<script>nothing</script>'), { games: [], people: [], groups: [] });
});

test('local groups and new friends are included in global search', () => {
  const state = structuredClone(defaults);
  state.myGroups.push({ id: 'test-group', name: 'Moonlight Builders', category: 'Creating', description: 'Nighttime worlds' });
  state.friends.push('NewFriend');
  assert.equal(searchSite(state, 'moonlight').groups[0].id, 'test-group');
  assert.equal(searchSite(state, 'newfriend').people[0].name, 'NewFriend');
});

test('profile groups show roles, owner status, and actual joined memberships', () => {
  const state = structuredClone(defaults);
  state.myGroups.push({ id: 'owned-group', name: 'My studio', category: 'Creating' });
  const group = findGroup(state, 'metallic-studio');
  assert.equal(groupRole(group, 'CloudBuilder'), 'Owner');
  assert.equal(groupRole(group, 'heroX_x'), 'Admin');
  assert.equal(groupRole(group, '00RIP_INDRA'), 'Member');
  assert.equal(groupRole(group, 'constructor'), 'Member');
  assert.ok(groupsForProfile(state, 'CloudBuilder').some(item => item.id === group.id && item.owned && item.role === 'Owner'));
  assert.ok(groupsForProfile(state, 'heroX_x').some(item => item.id === group.id && !item.owned && item.role === 'Admin'));
  assert.ok(groupsForProfile(state, state.profile.name).some(item => item.id === 'owned-group' && item.owned));
  updateGroupMembership(state, group, 'join');
  assert.ok(groupsForProfile(state, state.profile.name).some(item => item.id === group.id && item.role === 'Member'));
  updateGroupMembership(state, group, 'leave');
  assert.ok(!groupsForProfile(state, state.profile.name).some(item => item.id === group.id));
  updateGroupMembership(state, findGroup(state, 'cozy-builders'), 'join');
  assert.ok(!groupsForProfile(state, state.profile.name).some(item => item.id === 'cozy-builders'));
});

test('home friend activity uses the same joins-off and membership rules as game sessions', () => {
  const state = structuredClone(defaults);
  assert.equal(friendActivity(state, 'heroX_x').access.allowed, true);
  assert.equal(friendActivity(state, 'CRIMSONSLAYER').access.reason, 'Joins off');
  assert.equal(friendActivity(state, 'heroX_x').game.id, '1');
  assert.equal(friendActivity(state, 'LunaBlocks'), null);
  state.friends = state.friends.filter(name => name !== 'heroX_x');
  assert.equal(friendActivity(state, 'heroX_x'), null);
});

test('friend presence distinguishes offline, online, game, and Studio and respects hidden activity', () => {
  assert.equal(resolvePresence({ activity: 'Offline' }).key, 'offline');
  assert.equal(resolvePresence({ activity: 'Online' }).key, 'online');
  assert.equal(resolvePresence({ activity: 'Playing Rift Hunters', game: '3' }).key, 'playing');
  assert.equal(resolvePresence({ activity: 'Using Studio' }).key, 'studio');
  for (const status of ['hidden', 'invisible', 'offline']) assert.equal(resolvePresence({ status, game: '1' }).key, 'offline');
  assert.equal(resolvePresence({ hidden: true, activity: 'Playing a game', game: '1' }).key, 'offline');
  assert.equal(resolvePresence({ invisible: true, activity: 'Using Studio' }).key, 'offline');
  const state = structuredClone(defaults);
  state.activity = false;
  assert.equal(presenceFor(state, state.profile.name).key, 'offline');
  state.activity = true;
  assert.equal(presenceFor(state, state.profile.name).key, 'online');
  assert.equal(presenceFor(state, 'CloudBuilder').key, 'studio');
  assert.equal(friendActivity(state, 'PixelNova'), null);
});
