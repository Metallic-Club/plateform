import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, routeWithParams } from '../src/router.js';

test('filter, sort, and friend tab routes survive bookmarked URLs', () => {
  const route = readRoute('#/explore?category=Action&sort=players&q=arena');
  assert.equal(route.route, 'explore');
  assert.equal(route.category, 'Action');
  assert.equal(route.sort, 'players');
  assert.equal(route.params.get('q'), 'arena');
  assert.equal(readRoute('#/friends?tab=sent').friendTab, 'Sent');
});
test('unknown route settings and object prototype keys use defaults', () => {
  const route = readRoute('#/friends?tab=constructor&category=unknown&sort=__proto__');
  assert.equal(route.friendTab, 'All friends');
  assert.equal(route.category, 'All');
  assert.equal(route.sort, 'recommended');
});
test('query changes preserve existing filters and encode user input', () => {
  const result = routeWithParams('explore', new URLSearchParams('category=Action&sort=rating'), { q: 'a ? & #', sort: null });
  const route = readRoute('#' + result);
  assert.equal(route.category, 'Action');
  assert.equal(route.sort, 'recommended');
  assert.equal(route.params.get('q'), 'a ? & #');
  assert.equal(readRoute('#/explore?q=why?').params.get('q'), 'why?');
});
test('old game links still resolve to the renamed game route', () => {
  assert.equal(readRoute('#/experience/3').route, 'game/3');
  assert.equal(readRoute('#/game/3').route, 'game/3');
});
