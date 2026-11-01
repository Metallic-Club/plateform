import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, filterGames, updateFriendship, escapeHtml, defaults } from '../src/store.js';
import { games } from '../src/catalog.js';
test('search combines case-insensitive query, category, and rating sort', () => {
  assert.equal(filterGames(games,'CYBER')[0].id,'1');
  assert.equal(filterGames(games,'cyber','Racing').length,0);
  const result = filterGames(games,'','Action','rating');
  assert.ok(result.every(g=>g.genre==='Action'));
  assert.ok(result.every((g,i)=>!i||result[i-1].rating>=g.rating));
  assert.equal(filterGames(games,'no such world').length,0);
});
test('state survives a local persistence round trip', () => {
  let value; const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const state=loadState(storage);state.favorites=['1'];state.profile.name='NewPlayer';state.outfit='Explorer';
  assert.equal(saveState(storage,state),true);
  assert.equal(loadState(storage).profile.name,'NewPlayer');
  assert.deepEqual(loadState(storage).favorites,['1']);
  assert.equal(loadState(storage).outfit,'Explorer');
});
test('corrupt or blocked browser storage falls back without crashing', () => {
  assert.deepEqual(loadState({getItem:()=>'{broken'}),defaults);
  assert.deepEqual(loadState({getItem:()=>{throw Error('blocked');}}),defaults);
  assert.equal(saveState({setItem:()=>{throw Error('blocked');}},defaults),false);
  assert.deepEqual(loadState({getItem:()=>JSON.stringify({friends:'bad',color:'red;position:fixed',profile:null})}),defaults);
});
test('rendered user content is escaped', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('sent requests remain pending and acceptance requires an incoming request', () => {
  const state = structuredClone(defaults);
  assert.equal(updateFriendship(state, 'send', 'LunaBlocks'), true);
  assert.deepEqual(state.outgoing, ['LunaBlocks']);
  assert.equal(state.friends.includes('LunaBlocks'), false);
  assert.equal(updateFriendship(state, 'send', 'LunaBlocks'), false);
  assert.equal(updateFriendship(state, 'accept', 'LunaBlocks'), false);
  updateFriendship(state, 'cancel', 'LunaBlocks');
  assert.deepEqual(state.outgoing, []);
  updateFriendship(state, 'accept', 'PixelNova');
  assert.equal(state.friends.includes('PixelNova'), true);
  assert.equal(state.requests.includes('PixelNova'), false);
});
test('stored data is normalized, bounded, and consistent before rendering', () => {
  const data = { friends: ['LunaBlocks', 'LunaBlocks', '"><img onerror=alert(1)>'],
    requests: ['LunaBlocks', 'PixelNova'], outgoing: ['PixelNova', 'CloudBuilder'],
    favorites: ['1', '1', 'nonexistent'], profile: { name: '<invalid>', bio: 'a'.repeat(300), visibility: 'invalid' },
    projects: [{ id: 'one', name: '  My world  ', template: 'Obby', description: 'b'.repeat(600) },
      { id: 'one', name: 'Duplicate', template: 'Obby' }, { id: 'bad"', name: 'Bad', template: 'Obby' }],
    accessory: 'Headphones', color: '#a84354' };
  const state = loadState({ getItem: () => JSON.stringify(data) });
  assert.deepEqual(state.friends, ['LunaBlocks']);
  assert.deepEqual(state.requests, ['PixelNova']);
  assert.deepEqual(state.outgoing, ['CloudBuilder']);
  assert.deepEqual(state.favorites, ['1']);
  assert.equal(state.profile.name, defaults.profile.name);
  assert.equal(state.profile.bio.length, 240);
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].name, 'My world');
  assert.equal(state.projects[0].description.length, 500);
  assert.equal(state.accessory, 'Headphones');
});
test('popular sort handles K suffixes without changing the original catalog', () => {
  const order = games.map(g => g.id);
  const sorted = filterGames(games, '', 'All', 'players');
  const count = value => parseFloat(value) * (value.endsWith('K') ? 1000 : 1);
  assert.ok(sorted.every((g, i) => !i || count(sorted[i - 1].playing) >= count(g.playing)));
  assert.deepEqual(games.map(g => g.id), order);
});
