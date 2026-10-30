import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import { CatalogStore } from '../src/store.js';
import { createApiServer } from '../src/server.js';
import { createPlatformClient, PlatformApiError } from './index.js';

const key = 'sdk-integration-test-key-with-at-least-32-characters';

async function fixture(t: TestContext, store = new CatalogStore(':memory:'), creatorId = 'creator-sdk', ownStore = true) {
  const server = createApiServer({ store, devAuth: { key, creatorId } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (ownStore) store.close();
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    publicClient: createPlatformClient({ baseUrl }),
    creator: createPlatformClient({ baseUrl, creatorKey: key }),
  };
}

function apiError(status: number, code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof PlatformApiError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.ok(error.requestId);
    return true;
  };
}

test('SDK completes draft, edit, publish and unpublish over real HTTP without exposing drafts', async t => {
  const { publicClient, creator } = await fixture(t);
  assert.deepEqual(await publicClient.health(), { status: 'ok', storage: 'sqlite' });
  const draft = await creator.createGame({ title: 'Skyline Parkour', genre: 'obby', tags: ['parkour'] });
  assert.equal(draft.visibility, 'draft');
  assert.equal(draft.version, 1);
  await assert.rejects(publicClient.getGame(draft.id), apiError(404, 'GAME_NOT_FOUND'));
  assert.equal((await publicClient.listGames()).games.length, 0);
  assert.equal((await creator.getCreatorGame(draft.id)).id, draft.id);
  await assert.rejects(creator.publishGame(draft.id, 1), apiError(422, 'PUBLISH_VALIDATION_FAILED'));

  const edited = await creator.updateGame(draft.id, {
    expectedVersion: draft.version,
    description: 'Jump across rooftops and reach each checkpoint.',
  });
  assert.equal(edited.version, 2);
  await assert.rejects(creator.updateGame(draft.id, { expectedVersion: 1, title: 'Stale edit' }), apiError(409, 'VERSION_CONFLICT'));
  const published = await creator.publishGame(draft.id, edited.version);
  assert.equal(published.visibility, 'published');
  assert.equal(published.version, 3);
  assert.deepEqual(await publicClient.getGame(draft.id), published);
  assert.deepEqual((await publicClient.listGames({ q: 'roof', genre: 'obby' })).games.map(game => game.id), [draft.id]);
  await assert.rejects(creator.updateGame(draft.id, { expectedVersion: published.version, title: 'Hidden change' }), apiError(409, 'GAME_PUBLISHED'));
  const hidden = await creator.unpublishGame(draft.id, published.version);
  assert.equal(hidden.version, 4);
  await assert.rejects(publicClient.getGame(draft.id), apiError(404, 'GAME_NOT_FOUND'));
  assert.equal((await publicClient.listGames()).games.length, 0);
  assert.equal((await creator.listCreatorGames({ visibility: 'draft' })).games.length, 1);
});

test('creator ownership holds across HTTP servers sharing the same catalog', async t => {
  const store = new CatalogStore(':memory:');
  const first = await fixture(t, store, 'creator-one', false);
  const second = await fixture(t, store, 'creator-two', false);
  t.after(() => store.close());
  const draft = await first.creator.createGame({ title: 'Private World', genre: 'adventure' });
  assert.equal((await second.creator.listCreatorGames()).games.length, 0);
  await assert.rejects(second.creator.getCreatorGame(draft.id), apiError(404, 'GAME_NOT_FOUND'));
  await assert.rejects(second.creator.updateGame(draft.id, { expectedVersion: 1, title: 'Other owner' }), apiError(404, 'GAME_NOT_FOUND'));
  await assert.rejects(second.creator.publishGame(draft.id, 1), apiError(404, 'GAME_NOT_FOUND'));
  assert.equal((await first.creator.getCreatorGame(draft.id)).title, 'Private World');
});

test('SDK follows opaque catalog cursors and rejects a cursor reused with changed filters', async t => {
  const { creator, publicClient } = await fixture(t);
  const expected: string[] = [];
  for (let index = 0; index < 5; index++) {
    const draft = await creator.createGame({
      title: `Orbit Race ${index}`, genre: 'racing', description: 'Race around an orbital circuit with your friends.',
    });
    expected.push((await creator.publishGame(draft.id, draft.version)).id);
  }
  await creator.createGame({ title: 'Unfinished Race', genre: 'racing' });
  const first = await publicClient.listGames({ genre: 'racing', limit: 2 });
  assert.ok(first.nextCursor);
  await assert.rejects(publicClient.listGames({ genre: 'obby', cursor: first.nextCursor, limit: 2 }), apiError(422, 'INVALID_CURSOR'));
  const ids = first.games.map(game => game.id);
  let cursor: string | null = first.nextCursor;
  while (cursor) {
    const page = await publicClient.listGames({ genre: 'racing', cursor, limit: 2 });
    ids.push(...page.games.map(game => game.id));
    cursor = page.nextCursor;
    assert.ok(ids.length <= 5, 'pagination must advance rather than repeat a page');
  }
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(ids.toSorted(), expected.toSorted());
});
