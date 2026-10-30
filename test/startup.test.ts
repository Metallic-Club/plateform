import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from '../src/store.js';
import type { Game } from '../src/domain.js';

async function unusedPort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}

test('actual entrypoint starts, runs its shutdown handler, and preserves the catalog', { timeout: 20_000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'metallic-entrypoint-'));
  const path = join(dir, 'catalog.sqlite');
  const port = await unusedPort();
  const key = 'entrypoint-test-key-of-at-least-32-characters';
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('METALLIC_')) delete env[name];
  Object.assign(env, {
    NODE_ENV: 'development', METALLIC_HOST: '127.0.0.1', METALLIC_PORT: String(port),
    METALLIC_DATABASE_PATH: path, METALLIC_DEV_API_KEY: key, METALLIC_DEV_CREATOR_ID: 'entrypoint-creator',
  });
  // Windows cannot deliver POSIX SIGTERM gracefully; IPC dispatches the same registered handler there.
  // On POSIX the test sends a real SIGTERM to the unwrapped entrypoint.
  const main = new URL('../src/main.js', import.meta.url).href;
  const windows = process.platform === 'win32';
  const args = windows ? ['--input-type=module', '-e',
    `process.once('message', () => { process.emit('SIGTERM'); process.disconnect(); }); await import(${JSON.stringify(main)});`]
    : [fileURLToPath(main)];
  const child = spawn(process.execPath, args, {
    env, windowsHide: true, stdio: windows ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
    rmSync(dir, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('CLI did not become ready.')), 10_000);
    const onData = (): void => {
      if (!stdout.includes('listening on')) return;
      clearTimeout(deadline);
      child.stdout?.off('data', onData);
      resolve();
    };
    child.stdout?.on('data', onData);
    child.once('exit', code => { clearTimeout(deadline); reject(new Error(`CLI exited before readiness: ${code}; ${stderr}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  const response = await fetch(`${base}/api/v1/creator/games`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Entrypoint Game', genre: 'adventure' }),
  });
  assert.equal(response.status, 201);
  const { game } = await response.json() as { game: Game };
  if (windows) child.send('shutdown'); else child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 0, stderr);
  assert.equal(signal, null);
  assert.ok(!`${stdout}${stderr}`.includes(key));
  const reopened = new CatalogStore(path);
  try { assert.deepEqual(reopened.creatorGame(game.id, 'entrypoint-creator'), game); }
  finally { reopened.close(); }
});
