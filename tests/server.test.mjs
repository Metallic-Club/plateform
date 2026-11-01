import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createPreviewServer } from '../scripts/serve.mjs';

test('preview serves application assets and hides repository/configuration files', async t => {
  const server = createPreviewServer({ directory: fileURLToPath(new URL('..', import.meta.url)) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const pathname of ['/', '/src/app.js', '/src/router.js', '/art/game-1.svg', '/favicon.svg']) {
    assert.equal((await fetch(origin + pathname)).status, 200, pathname);
  }
  for (const pathname of ['/.git/config', '/.openai/hosting.json', '/package.json', '/README.md', '/src/../.git/HEAD', '/%2e%2e/.git/config']) {
    assert.equal((await fetch(origin + pathname)).status, 404, pathname);
  }
  const head = await fetch(origin + '/', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
});
