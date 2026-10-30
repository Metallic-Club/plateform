import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApiServer, type DevAuth } from '../src/server.js';
import { CatalogStore } from '../src/store.js';
import type { Game, GamesPage } from '../src/domain.js';

const KEY = 'test-creator-key-with-at-least-32-characters';
const AUTH = { key: KEY, creatorId: 'creator-one' };
const DRAFT = { title: 'Metallic Parkour', description: 'Jump between platforms and reach the finish.', genre: 'obby', tags: ['parkour'] };

interface ErrorBody { error: { code: string; message: string; requestId: string; details?: Record<string, string> } }

async function fixture(t: TestContext, devAuth: DevAuth | null = AUTH, existingStore?: CatalogStore) {
  const store = existingStore ?? new CatalogStore(':memory:');
  const server = createApiServer({ store, ...(devAuth ? { devAuth } : {}) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (!existingStore) store.close();
  });
  const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${devAuth?.key ?? KEY}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { server, store, base, request };
}

async function game(response: Response, status = 200): Promise<Game> {
  const body: unknown = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return (body as { game: Game }).game;
}

async function error(response: Response, status: number, code: string): Promise<ErrorBody> {
  const body = await response.json() as ErrorBody;
  assert.equal(response.status, status);
  assert.equal(body.error.code, code);
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.match(body.error.requestId, /^[a-f0-9-]{36}$/u);
  return body;
}

test('draft -> edit -> publish -> unpublish persists explicit versioned transitions', async t => {
  const { request, base } = await fixture(t);
  const createdResponse = await request('/api/v1/creator/games', 'POST', DRAFT);
  const created = await game(createdResponse, 201);
  assert.equal(created.visibility, 'draft');
  assert.equal(created.version, 1);
  assert.equal(created.publishedAt, null);
  assert.equal(createdResponse.headers.get('location'), `/api/v1/creator/games/${created.id}`);
  await error(await fetch(`${base}/api/v1/games/${created.id}`), 404, 'GAME_NOT_FOUND');
  const publicDrafts = await (await fetch(`${base}/api/v1/games`)).json() as GamesPage;
  assert.deepEqual(publicDrafts, { games: [], nextCursor: null });
  assert.deepEqual(await game(await request(`/api/v1/creator/games/${created.id}`)), created);
  const edited = await game(await request(`/api/v1/creator/games/${created.id}`, 'PATCH', { title: 'Better Parkour', expectedVersion: 1 }));
  assert.equal(edited.version, 2);
  const published = await game(await request(`/api/v1/creator/games/${created.id}/publish`, 'POST', { expectedVersion: 2 }));
  assert.equal(published.visibility, 'published');
  assert.equal(published.version, 3);
  assert.ok(published.publishedAt);
  assert.deepEqual(await game(await fetch(`${base}/api/v1/games/${created.id}`)), published);
  await error(await request(`/api/v1/creator/games/${created.id}`, 'PATCH', { title: 'Hidden edit', expectedVersion: 3 }), 409, 'GAME_PUBLISHED');
  const idempotent = await game(await request(`/api/v1/creator/games/${created.id}/publish`, 'POST', { expectedVersion: 3 }));
  assert.equal(idempotent.version, 3);
  const unpublished = await game(await request(`/api/v1/creator/games/${created.id}/unpublish`, 'POST', { expectedVersion: 3 }));
  assert.equal(unpublished.version, 4);
  assert.equal(unpublished.publishedAt, null);
  await error(await fetch(`${base}/api/v1/games/${created.id}`), 404, 'GAME_NOT_FOUND');
});

test('creator routes fail closed without credentials and enforce owner isolation', async t => {
  const { base, request, store } = await fixture(t);
  const created = await game(await request('/api/v1/creator/games', 'POST', DRAFT), 201);
  await error(await fetch(`${base}/api/v1/creator/games`), 401, 'UNAUTHORIZED');
  await error(await request('/api/v1/creator/games', 'GET', undefined, { Authorization: 'Bearer incorrect' }), 401, 'UNAUTHORIZED');
  await error(await request('/api/v1/creator/games', 'POST', DRAFT, { Origin: 'https://untrusted.example' }), 403, 'BROWSER_CREATOR_ACCESS_DENIED');
  const second = await fixture(t, { key: KEY, creatorId: 'creator-two' }, store);
  await error(await second.request(`/api/v1/creator/games/${created.id}`), 404, 'GAME_NOT_FOUND');
  await error(await second.request(`/api/v1/creator/games/${created.id}`, 'PATCH', { expectedVersion: 1, title: 'Stolen title' }), 404, 'GAME_NOT_FOUND');
  await error(await second.request(`/api/v1/creator/games/${created.id}/publish`, 'POST', { expectedVersion: 1 }), 404, 'GAME_NOT_FOUND');
  assert.deepEqual(await (await second.request('/api/v1/creator/games')).json(), { games: [], nextCursor: null });
  const disabled = await fixture(t, null);
  await error(await disabled.request('/api/v1/creator/games', 'POST', DRAFT), 503, 'CREATOR_AUTH_UNAVAILABLE');
});

test('stale and simultaneous writes cannot overwrite newer edits', async t => {
  const { request } = await fixture(t);
  const created = await game(await request('/api/v1/creator/games', 'POST', DRAFT), 201);
  const path = `/api/v1/creator/games/${created.id}`;
  const responses = await Promise.all([
    request(path, 'PATCH', { title: 'First writer', expectedVersion: 1 }),
    request(path, 'PATCH', { title: 'Second writer', expectedVersion: 1 }),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await game(await request(path))).version, 2);
  await error(await request(`${path}/publish`, 'POST', { expectedVersion: 1 }), 409, 'VERSION_CONFLICT');
});

test('discovery filters published records, escapes LIKE wildcards, and paginates without duplicates', async t => {
  const { request, base } = await fixture(t);
  const ids: string[] = [];
  for (let index = 0; index < 5; index++) {
    const created = await game(await request('/api/v1/creator/games', 'POST', {
      ...DRAFT, title: index === 0 ? '100% Finish' : `Parkour course ${index}`, genre: index === 4 ? 'racing' : 'obby',
    }), 201);
    await game(await request(`/api/v1/creator/games/${created.id}/publish`, 'POST', { expectedVersion: 1 }));
    ids.push(created.id);
  }
  await game(await request('/api/v1/creator/games', 'POST', { ...DRAFT, title: 'Unpublished game' }), 201);
  let cursor: string | null = null;
  const visited: string[] = [];
  do {
    const page = await (await fetch(`${base}/api/v1/games?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json() as GamesPage;
    assert.ok(page.games.length <= 2);
    visited.push(...page.games.map(entry => entry.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(new Set(visited).size, 5);
  assert.deepEqual(visited.sort(), ids.sort());
  const racing = await (await fetch(`${base}/api/v1/games?genre=racing`)).json() as GamesPage;
  assert.equal(racing.games.length, 1);
  const percent = await (await fetch(`${base}/api/v1/games?q=%25`)).json() as GamesPage;
  assert.deepEqual(percent.games.map(entry => entry.title), ['100% Finish']);
  const firstPage = await (await fetch(`${base}/api/v1/games?limit=1&genre=obby`)).json() as GamesPage;
  assert.ok(firstPage.nextCursor);
  await error(await fetch(`${base}/api/v1/games?genre=racing&cursor=${firstPage.nextCursor}`), 422, 'INVALID_CURSOR');
  await error(await fetch(`${base}/api/v1/games?cursor=not-a-valid-cursor`), 422, 'INVALID_CURSOR');
});

test('malformed requests are rejected and errors do not leak credentials', async t => {
  const { request, base } = await fixture(t);
  const mutations = [
    {}, { ...DRAFT, title: 'x' }, { ...DRAFT, genre: 'invented' },
    { ...DRAFT, tags: ['ok', 'ok'] }, { ...DRAFT, creatorId: 'other' },
    { ...DRAFT, visibility: 'published' }, { ...DRAFT, title: '\u0000bad' },
    { ...DRAFT, tags: ['UPPER'] }, null, [],
  ];
  for (const mutation of mutations) {
    const body = await error(await request('/api/v1/creator/games', 'POST', mutation), 422, 'VALIDATION_ERROR');
    assert.ok(!JSON.stringify(body).includes(KEY));
  }
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'q=', 'genre=invalid', 'limit=1&limit=2', 'visibility=draft', 'unknown=x']) {
    await error(await fetch(`${base}/api/v1/games?${query}`), 422, 'VALIDATION_ERROR');
  }
  await error(await fetch(`${base}/api/v1/creator/games`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: '{bad json',
  }), 400, 'INVALID_JSON');
  await error(await fetch(`${base}/api/v1/creator/games`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'text/plain' }, body: '{}',
  }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await error(await fetch(`${base}/api/v1/creator/games`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(20_000) }),
  }), 413, 'BODY_TOO_LARGE');
  await error(await fetch(`${base}/missing`), 404, 'NOT_FOUND');
  await error(await fetch(`${base}/api/v1/games/not-an-id`), 404, 'GAME_NOT_FOUND');
  const method = await fetch(`${base}/api/v1/games`, { method: 'DELETE' });
  await error(method, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(method.headers.get('allow'), 'GET');
});

test('publishing validates completeness and creator lists support visibility filters', async t => {
  const { request } = await fixture(t);
  const draft = await game(await request('/api/v1/creator/games', 'POST', { title: 'Empty description', genre: 'other' }), 201);
  await error(await request(`/api/v1/creator/games/${draft.id}/publish`, 'POST', { expectedVersion: 1 }), 422, 'PUBLISH_VALIDATION_FAILED');
  const page = await (await request('/api/v1/creator/games?visibility=draft')).json() as GamesPage;
  assert.equal(page.games.length, 1);
  assert.equal(page.games[0]?.version, 1);
  const published = await (await request('/api/v1/creator/games?visibility=published')).json() as GamesPage;
  assert.deepEqual(published.games, []);
});

test('Unicode text limits count codepoints consistently with SQLite', async t => {
  const { request } = await fixture(t);
  await error(await request('/api/v1/creator/games', 'POST', { ...DRAFT, title: '😀😀' }), 422, 'VALIDATION_ERROR');
  await error(await request('/api/v1/creator/games', 'POST', { ...DRAFT, title: '\ud800bad' }), 422, 'VALIDATION_ERROR');
  const title = '😀'.repeat(80);
  const created = await game(await request('/api/v1/creator/games', 'POST', { ...DRAFT, title, description: '😀'.repeat(10) }), 201);
  assert.equal(created.title, title);
  await error(await request(`/api/v1/creator/games/${created.id}/publish`, 'POST', { expectedVersion: 1 }), 422, 'PUBLISH_VALIDATION_FAILED');
  await error(await request('/api/v1/creator/games', 'POST', { ...DRAFT, title: '😀'.repeat(81) }), 422, 'VALIDATION_ERROR');
});

test('health checks storage and responses use explicit JSON security headers', async t => {
  const { base, store } = await fixture(t);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', storage: 'sqlite' });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  store.close();
  await error(await fetch(`${base}/health`), 503, 'STORAGE_UNAVAILABLE');
});

test('server refuses weak development credentials', () => {
  const store = new CatalogStore(':memory:');
  try {
    assert.throws(() => createApiServer({ store, devAuth: { key: 'weak', creatorId: 'one' } }), /METALLIC_DEV_API_KEY/u);
  } finally { store.close(); }
});
