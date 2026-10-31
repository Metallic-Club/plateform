import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { CatalogStore } from '../src/store.js';
import { loadConfig } from '../src/config.js';

test('catalog survives closing and reopening a disk database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'metallic-catalog-'));
  const path = join(dir, 'nested folder', 'catalog.sqlite');
  try {
    const first = new CatalogStore(path);
    const created = first.create('creator', { title: 'Persistent Game', description: 'A persistent game description.', genre: 'adventure' });
    const published = first.setVisibility(created.id, 'creator', 1, 'published');
    first.close();
    const second = new CatalogStore(path);
    try {
      assert.deepEqual(second.publicGame(created.id), published);
      assert.equal(second.list({ limit: 10 }).games.length, 1);
      second.setVisibility(created.id, 'creator', published.version, 'draft');
    } finally { second.close(); }
    const third = new CatalogStore(path);
    try {
      assert.throws(() => third.publicGame(created.id), /Game not found/u);
      assert.equal(third.creatorGame(created.id, 'creator').version, 3);
    } finally { third.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a database with a newer schema is refused without modifying it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'metallic-schema-'));
  const path = join(dir, 'catalog.sqlite');
  try {
    const database = new DatabaseSync(path);
    database.exec('PRAGMA user_version=99');
    const originalMode = database.prepare('PRAGMA journal_mode').get()?.journal_mode;
    database.close();
    const originalBytes = readFileSync(path);
    assert.throws(() => new CatalogStore(path), /newer than/u);
    assert.deepEqual(readFileSync(path), originalBytes);
    assert.equal(existsSync(`${path}-wal`), false);
    assert.equal(existsSync(`${path}-shm`), false);
    const reopened = new DatabaseSync(path);
    try {
      assert.equal(reopened.prepare('PRAGMA user_version').get()?.user_version, 99);
      assert.equal(reopened.prepare('PRAGMA journal_mode').get()?.journal_mode, originalMode);
    }
    finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('configuration starts read-only by default and rejects unsafe development auth', () => {
  assert.deepEqual(loadConfig({}), { host: '127.0.0.1', port: 3000, databasePath: './data/catalog.sqlite' });
  const auth = { METALLIC_DEV_API_KEY: 'valid-development-key-of-at-least-32-chars', METALLIC_DEV_CREATOR_ID: 'creator' };
  assert.throws(() => loadConfig({ ...auth, NODE_ENV: 'production' }), /require NODE_ENV/u);
  assert.throws(() => loadConfig({ ...auth, NODE_ENV: 'development', METALLIC_HOST: '0.0.0.0' }), /loopback/u);
  assert.throws(() => loadConfig({ ...auth, NODE_ENV: 'development', METALLIC_DEV_API_KEY: 'weak' }), /32 to 512/u);
  assert.throws(() => loadConfig({ NODE_ENV: 'development', METALLIC_DEV_API_KEY: auth.METALLIC_DEV_API_KEY }), /Set both/u);
  assert.throws(() => loadConfig({ METALLIC_PORT: '0' }), /METALLIC_PORT/u);
  assert.throws(() => loadConfig({ METALLIC_PORT: '3000garbage' }), /METALLIC_PORT/u);
  assert.equal(loadConfig({ ...auth, NODE_ENV: 'development' }).devAuth?.creatorId, 'creator');
});
