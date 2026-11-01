import { games } from './catalog.js';

export const SERVER_PRICE = 100;
export const DEFAULT_ALLOY = 1450;
export const groupCategories = ['Gaming', 'Creating', 'Roleplay', 'Racing', 'Art', 'Music'];
const validName = value => typeof value === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(value);
const validId = value => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
const uniqueNames = values => [...new Set(Array.isArray(values) ? values.filter(validName) : [])].slice(0, 50);

export const sampleGroups = [
  { id: 'metallic-studio', name: 'Metallic Studio', category: 'Creating', owner: 'CloudBuilder', emblem: 'M', color: 'silver', joinPolicy: 'open',
    description: 'A place for builders, players, and big ideas. Discover the worlds of Metallic and help shape what comes next.',
    shout: 'Welcome, creators. Share your next idea and find someone to build with.',
    members: ['CloudBuilder', 'PixelNova', 'heroX_x', 'CRIMSONSLAYER', '00RIP_INDRA'], games: ['1', '2', '5', '7', '11'] },
  { id: 'riftforge', name: 'Riftforge Guild', category: 'Gaming', owner: '00RIP_INDRA', emblem: 'R', color: 'violet', joinPolicy: 'open',
    description: 'For the adventurers who always take one more quest. Team up, trade ideas, and explore the worlds we create together.',
    shout: 'Find your party. Your next adventure is better together.', members: ['00RIP_INDRA', 'heroX_x', 'CRIMSONSLAYER'], games: ['3', '4', '8', '12', '14'] },
  { id: 'neon-drivers', name: 'Neon Drivers', category: 'Racing', owner: 'NeonFox', emblem: 'N', color: 'amber', joinPolicy: 'open',
    description: 'Perfect laps, late-night circuits, and a community that loves the drive.', shout: 'New personal best? There’s always another lap.',
    members: ['NeonFox', 'OrbitKai', 'heroX_x'], games: ['9'] },
  { id: 'cozy-builders', name: 'Cozy Builders', category: 'Creating', owner: 'LunaBlocks', emblem: 'C', color: 'sage', joinPolicy: 'approval',
    description: 'A small collective for thoughtful worlds, cozy corners, and creating at your own pace.', shout: 'Good things take a little time. Make something you love.',
    members: ['LunaBlocks', 'PixelNova', 'CloudBuilder'], games: [] },
  { id: 'sound-lab', name: 'Sound Lab', category: 'Music', owner: 'PixelNova', emblem: 'S', color: 'silver', joinPolicy: 'open',
    description: 'For the people who make worlds sound alive. Meet composers, sound designers, and curious creators.', shout: 'A new sound can change a whole world.',
    members: ['PixelNova', 'NeonFox', 'LunaBlocks'], games: [] },
];

const sampleGroupRoles = {
  'metallic-studio': { heroX_x: 'Admin', PixelNova: 'Developer' },
  riftforge: { CRIMSONSLAYER: 'Moderator' },
  'cozy-builders': { CloudBuilder: 'Developer' },
  'sound-lab': { NeonFox: 'Composer' },
};
export const groupRole = (group, name) => group.owner === name ? 'Owner' : Object.hasOwn(group.roles || {}, name) ? group.roles[name] : 'Member';
export function groupsForProfile(state, name) {
  return getGroups(state).filter(group => name === state.profile.name
    ? group.mine || state.groupMemberships.includes(group.id)
    : groupMembers(group, state).includes(name)).map(group => ({ ...group, role: groupRole(group, name), owned: group.owner === name }));
}
export function friendActivity(state, name) {
  if (!state.friends.includes(name)) return null;
  const session = friendSessions.find(session => session.name === name);
  if (!session) return null;
  const game = games.find(game => game.id === session.gameId);
  const server = sampleServers(session.gameId).find(server => server.id === session.serverId);
  return game ? { session, game, access: friendJoinAccess(state, session, server) } : null;
}
export function getGroups(state) {
  return [...sampleGroups.map(group => ({ ...group, mine: false, roles: sampleGroupRoles[group.id] || {} })), ...(state.myGroups || []).map(group => ({ ...group,
    owner: state.profile.name, emblem: group.name[0].toUpperCase(), color: 'silver', mine: true, games: [],
    shout: 'Welcome to ' + group.name + '. Your group starts here.', members: [state.profile.name],
  }))];
}
export const findGroup = (state, id) => getGroups(state).find(group => group.id === id);
export function groupMembers(group, state) {
  return [...new Set([...group.members, ...((state.groupMemberships || []).includes(group.id) ? [state.profile.name] : [])])];
}
export function ownerForGame(id) {
  if (id === '13') return { type: 'user', id: 'LunaBlocks', name: 'LunaBlocks' };
  const group = sampleGroups.find(group => group.games.includes(id)) || sampleGroups[0];
  return { type: 'group', id: group.id, name: group.name };
}

export const friendSessions = [
  { name: 'heroX_x', gameId: '1', serverId: '1-public-1', joinsEnabled: true },
  { name: 'CRIMSONSLAYER', gameId: '1', serverId: '1-public-2', joinsEnabled: false },
  { name: '00RIP_INDRA', gameId: '3', serverId: '3-public-1', joinsEnabled: true },
];
export const friendsPlaying = (state, gameId) => friendSessions.filter(session => session.gameId === gameId && state.friends.includes(session.name));
export function sampleServers(gameId) {
  if (!games.some(game => game.id === gameId)) return [];
  const active = friendSessions.filter(session => session.gameId === gameId);
  const first = [...new Set([...active.filter(s => s.serverId.endsWith('-1')).map(s => s.name), 'LunaBlocks', 'OrbitKai'])];
  const second = [...new Set([...active.filter(s => s.serverId.endsWith('-2')).map(s => s.name), 'CloudBuilder', 'NeonFox'])];
  return [
    { id: `${gameId}-public-1`, gameId, name: 'Open adventure', region: 'North America', players: first, capacity: 8, visibility: 'public', owner: null, active: true },
    { id: `${gameId}-public-2`, gameId, name: 'One more round', region: 'Europe', players: second, capacity: 8, visibility: 'public', owner: null, active: true },
    { id: `${gameId}-public-3`, gameId, name: 'The busy lobby', region: 'North America', players: ['PixelNova', 'LunaBlocks', 'NeonFox', 'OrbitKai'], capacity: 4, visibility: 'public', owner: null, active: true },
  ];
}
export function serverAccess(server, state) {
  if (!server) return { allowed: false, reason: 'Server unavailable' };
  if (server.players.length >= server.capacity) return { allowed: false, reason: 'Server full' };
  if (server.visibility === 'private' && server.owner !== state.profile.name
    && !server.invited?.includes(state.profile.name)
    && !(server.allowFriends && state.friends.includes(server.owner))) return { allowed: false, reason: 'Invite only' };
  return { allowed: true, reason: '' };
}
export function friendJoinAccess(state, session, server) {
  if (!session || !state.friends.includes(session.name)) return { allowed: false, reason: 'Friend unavailable' };
  if (!session.joinsEnabled) return { allowed: false, reason: 'Joins off' };
  if (!server || server.id !== session.serverId || server.gameId !== session.gameId) return { allowed: false, reason: 'Session unavailable' };
  return serverAccess(server, state);
}
export function createServerPreview(state, details, requestId) {
  if (!validId(requestId)) return { ok: false, error: 'Invalid creation request.' };
  const existing = state.reservedServers.find(server => server.id === requestId);
  if (existing) return { ok: true, server: existing, duplicate: true };
  const name = typeof details.name === 'string' ? details.name.trim() : '';
  if (!name || name.length > 40 || !games.some(game => game.id === details.gameId)
    || !['public', 'private'].includes(details.visibility)) return { ok: false, error: 'Enter a valid name, game, and access setting.' };
  if (state.reservedServers.length >= 20) return { ok: false, error: 'The preview supports up to 20 reserved servers.' };
  if (!Number.isSafeInteger(state.previewAlloy) || state.previewAlloy < SERVER_PRICE) return { ok: false, error: 'You need 100 Alloy in your preview balance.' };
  const server = { id: requestId, name, gameId: details.gameId, visibility: details.visibility,
    invited: details.visibility === 'private' ? uniqueNames(details.invited).filter(name => state.friends.includes(name)) : [],
    allowFriends: details.visibility === 'private' && details.allowFriends === true,
  };
  state.previewAlloy -= SERVER_PRICE;
  state.reservedServers.push(server);
  return { ok: true, server, duplicate: false };
}
export function reservedServerCards(state, gameId) {
  return state.reservedServers.filter(server => server.gameId === gameId).map(server => ({ ...server,
    owner: state.profile.name, region: 'Your reservation', players: [], capacity: 8, active: false, mine: true,
  }));
}
export function updateGroupMembership(state, group, action) {
  if (!group || group.mine) return false;
  if (action === 'join') {
    if (state.groupMemberships.includes(group.id) || state.groupRequests.includes(group.id)) return false;
    (group.joinPolicy === 'approval' ? state.groupRequests : state.groupMemberships).push(group.id);
  } else if (action === 'leave') state.groupMemberships = state.groupMemberships.filter(id => id !== group.id);
  else if (action === 'cancel') state.groupRequests = state.groupRequests.filter(id => id !== group.id);
  else return false;
  return true;
}
export function normalizeSocialState(data, state) {
  if (Number.isSafeInteger(data.previewAlloy) && data.previewAlloy >= 0 && data.previewAlloy <= 1000000000) state.previewAlloy = data.previewAlloy;
  if (['Everyone', 'Friends', 'Nobody'].includes(data.joinPolicy)) state.joinPolicy = data.joinPolicy;
  if (Array.isArray(data.myGroups)) {
    const ids = new Set(sampleGroups.map(group => group.id));
    state.myGroups = data.myGroups.filter(group => group && validId(group.id) && typeof group.name === 'string' && group.name.trim()
      && !ids.has(group.id) && ids.add(group.id)).slice(0, 30).map(group => ({ id: group.id, name: group.name.trim().slice(0, 40),
        description: typeof group.description === 'string' ? group.description.slice(0, 500) : '',
        category: groupCategories.includes(group.category) ? group.category : 'Creating', joinPolicy: group.joinPolicy === 'approval' ? 'approval' : 'open',
      }));
  }
  const known = new Set(sampleGroups.map(group => group.id));
  for (const key of ['groupMemberships', 'groupRequests']) if (Array.isArray(data[key])) state[key] = [...new Set(data[key].filter(id => known.has(id)))];
  state.groupRequests = state.groupRequests.filter(id => !state.groupMemberships.includes(id));
  if (Array.isArray(data.reservedServers)) {
    const ids = new Set();
    state.reservedServers = data.reservedServers.filter(server => server && validId(server.id)
      && typeof server.name === 'string' && server.name.trim() && games.some(game => game.id === server.gameId)
      && ['public', 'private'].includes(server.visibility) && !ids.has(server.id) && ids.add(server.id)).slice(0, 20).map(server => ({ id: server.id, name: server.name.trim().slice(0, 40),
        gameId: server.gameId, visibility: server.visibility,
        invited: server.visibility === 'private' ? uniqueNames(server.invited).filter(name => state.friends.includes(name)) : [],
        allowFriends: server.visibility === 'private' && server.allowFriends === true,
      }));
  }
  const owned = new Set(state.myGroups.map(group => group.id));
  state.projects = state.projects.map(project => ({ ...project, groupId: owned.has(project.groupId) ? project.groupId : '' }));
}
