import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, loadState, saveState } from '../src/store.js';
import { SERVER_PRICE, createServerPreview, sampleServers, serverAccess, friendJoinAccess, friendSessions, friendsPlaying,
  findGroup, groupMembers, ownerForGame, updateGroupMembership } from '../src/social.js';

test('server creation uses preview Alloy once and supports public or private access', () => {
  const state = structuredClone(defaults), start = state.previewAlloy;
  const result = createServerPreview(state, { name: ' Friends lobby ', gameId: '1', visibility: 'private', invited: ['heroX_x', 'unknown', 'heroX_x'], allowFriends: false }, 'server-a');
  assert.equal(result.ok, true);
  assert.equal(state.previewAlloy, start - SERVER_PRICE);
  assert.deepEqual(result.server.invited, ['heroX_x']);
  const duplicate = createServerPreview(state, { name: 'Friends lobby', gameId: '1', visibility: 'private' }, 'server-a');
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.previewAlloy, start - SERVER_PRICE);
  assert.equal(state.reservedServers.length, 1);
  const publicServer = createServerPreview(state, { name: 'Open lobby', gameId: '1', visibility: 'public', invited: ['heroX_x'], allowFriends: true }, 'server-b');
  assert.equal(publicServer.ok, true);
  assert.deepEqual(publicServer.server.invited, []);
  assert.equal(publicServer.server.allowFriends, false);
});
test('insufficient balance or invalid server input cannot change the preview wallet', () => {
  const state = structuredClone(defaults); state.previewAlloy = 50;
  const before = structuredClone(state);
  assert.equal(createServerPreview(state, { name: 'Lobby', gameId: '1', visibility: 'public' }, 'server-a').ok, false);
  assert.deepEqual(state, before);
  state.previewAlloy = 1000;
  assert.equal(createServerPreview(state, { name: '  ', gameId: '1', visibility: 'private' }, 'server-a').ok, false);
  assert.equal(createServerPreview(state, { name: 'Lobby', gameId: 'missing', visibility: 'private' }, 'server-a').ok, false);
  assert.equal(state.previewAlloy, 1000);
  assert.equal(state.reservedServers.length, 0);
});
test('full, private, and joins-off sessions enforce their own join state', () => {
  const state = structuredClone(defaults), servers = sampleServers('1');
  assert.equal(serverAccess(servers[0], state).allowed, true);
  assert.equal(serverAccess(servers[2], state).reason, 'Server full');
  const privateServer = { ...servers[0], visibility: 'private', owner: 'OtherPlayer', invited: [], allowFriends: false };
  assert.equal(serverAccess(privateServer, state).reason, 'Invite only');
  privateServer.invited = [state.profile.name];
  assert.equal(serverAccess(privateServer, state).allowed, true);
  const joinsOff = friendSessions.find(session => session.name === 'CRIMSONSLAYER');
  assert.equal(friendJoinAccess(state, joinsOff, servers[1]).reason, 'Joins off');
  assert.deepEqual(friendsPlaying(state, '1').map(session => session.name), ['heroX_x', 'CRIMSONSLAYER']);
});
test('group membership supports open joins, approval requests, and cancellation', () => {
  const state = structuredClone(defaults), open = findGroup(state, 'metallic-studio'), approval = findGroup(state, 'cozy-builders');
  assert.equal(updateGroupMembership(state, open, 'join'), true);
  assert.equal(updateGroupMembership(state, open, 'join'), false);
  assert.ok(groupMembers(open, state).includes(state.profile.name));
  updateGroupMembership(state, approval, 'join');
  assert.ok(state.groupRequests.includes(approval.id));
  assert.equal(state.groupMemberships.includes(approval.id), false);
  updateGroupMembership(state, approval, 'cancel');
  assert.deepEqual(state.groupRequests, []);
  updateGroupMembership(state, open, 'leave');
  assert.deepEqual(state.groupMemberships, []);
});
test('creator ownership links lead to known groups or a player profile', () => {
  const state = structuredClone(defaults), owner = ownerForGame('1');
  assert.equal(owner.type, 'group');
  assert.equal(findGroup(state, owner.id).name, owner.name);
  assert.deepEqual(ownerForGame('13'), { type: 'user', id: 'LunaBlocks', name: 'LunaBlocks' });
});
test('groups, group games, reservations, and the demo wallet survive normalization', () => {
  const state = structuredClone(defaults);
  state.myGroups = [{ id: 'my-builders', name: 'My Builders', description: 'A group', category: 'Creating', joinPolicy: 'open' }];
  state.projects = [{ id: 'game-draft', name: 'Group game', template: 'Obby', description: '', groupId: 'my-builders' }];
  createServerPreview(state, { name: 'Our lobby', gameId: '1', visibility: 'private', invited: ['heroX_x'] }, 'my-server');
  let value; const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  saveState(storage, state);
  const loaded = loadState(storage);
  assert.equal(loaded.previewAlloy, defaults.previewAlloy - SERVER_PRICE);
  assert.equal(loaded.reservedServers[0].name, 'Our lobby');
  assert.equal(loaded.projects[0].groupId, 'my-builders');
  assert.equal(findGroup(loaded, 'my-builders').mine, true);
  assert.equal(findGroup(loaded, 'my-builders').owner, loaded.profile.name);
});
test('corrupt saved social records cannot create invalid access or an invalid balance', () => {
  const loaded = loadState({ getItem: () => JSON.stringify({ previewAlloy: -100,
    myGroups: [{ id: 'metallic-studio', name: 'Overwrite' }, { id: 'bad"', name: 'Bad' }],
    groupMemberships: ['unknown'], groupRequests: ['metallic-studio', 'metallic-studio'],
    reservedServers: [{ id: 'valid', name: '', gameId: '1', visibility: 'private' }, { id: 'valid', name: 'Safe', gameId: '1', visibility: 'public', invited: ['heroX_x'], allowFriends: true }] }) });
  assert.equal(loaded.previewAlloy, defaults.previewAlloy);
  assert.deepEqual(loaded.myGroups, []);
  assert.deepEqual(loaded.groupMemberships, []);
  assert.deepEqual(loaded.groupRequests, ['metallic-studio']);
  assert.equal(loaded.reservedServers.length, 1);
  assert.deepEqual(loaded.reservedServers[0].invited, []);
  assert.equal(loaded.reservedServers[0].allowFriends, false);
});
