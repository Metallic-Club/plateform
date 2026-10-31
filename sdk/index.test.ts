import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createPlatformClient, PlatformApiError, PlatformTransportError } from './index.js';

const emptyPage = () => Response.json({ games: [], nextCursor: null });

test('public discovery omits credentials even when a creator key is configured', async () => {
  const client = createPlatformClient({
    baseUrl: 'http://localhost:3000/proxy/',
    creatorKey: 'test-local-creator-key',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/proxy/api/v1/games');
      assert.equal(url.searchParams.get('q'), 'space & racing/%');
      assert.equal(url.searchParams.get('cursor'), 'opaque+/=');
      assert.equal(url.searchParams.get('limit'), '3');
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      return emptyPage();
    },
  });
  assert.deepEqual(await client.listGames({ q: 'space & racing/%', cursor: 'opaque+/=', limit: 3 }), {
    games: [], nextCursor: null,
  });
});

test('creator calls fail locally without a key and send credentials only in the authorization header', async () => {
  let requests = 0;
  const transport: typeof fetch = async (input, init) => {
    requests++;
    assert.equal(String(input).includes('test-local-creator-key'), false);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-local-creator-key');
    return emptyPage();
  };
  await assert.rejects(
    createPlatformClient({ baseUrl: 'http://localhost:3000', fetch: transport }).listCreatorGames(),
    error => error instanceof PlatformApiError && error.code === 'CREATOR_KEY_REQUIRED',
  );
  assert.equal(requests, 0);
  await createPlatformClient({ baseUrl: 'http://localhost:3000', creatorKey: 'test-local-creator-key', fetch: transport }).listCreatorGames();
  assert.equal(requests, 1);
});

test('API errors retain conflict status, code and request ID without retrying mutations', async () => {
  let requests = 0;
  const client = createPlatformClient({
    baseUrl: 'http://localhost:3000',
    creatorKey: 'local-test-key',
    fetch: async () => {
      requests++;
      return Response.json({ error: {
        code: 'VERSION_CONFLICT', message: 'Reload the latest version.', requestId: 'request-123',
      } }, { status: 409 });
    },
  });
  await assert.rejects(client.publishGame('game-123', 1), error => {
    assert.ok(error instanceof PlatformApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'VERSION_CONFLICT');
    assert.equal(error.requestId, 'request-123');
    return true;
  });
  assert.equal(requests, 1);
});

test('invalid success responses and non-JSON upstream errors are explicit transport failures', async () => {
  for (const response of [
    Response.json({ games: [null], nextCursor: null }),
    Response.json({ games: [] }),
    new Response('<html>upstream failed</html>', { status: 502 }),
  ]) {
    const client = createPlatformClient({ baseUrl: 'http://localhost:3000', fetch: async () => response });
    await assert.rejects(client.listGames(), PlatformTransportError);
  }
});

test('invalid endpoint URLs, path IDs and page sizes cannot reach the transport', async () => {
  for (const baseUrl of ['file:///tmp/api', 'https://user:password@example.com', 'https://example.com?key=secret', 'https://example.com#fragment']) {
    assert.throws(() => createPlatformClient({ baseUrl }), TypeError);
  }
  let requests = 0;
  const client = createPlatformClient({ baseUrl: 'http://localhost:3000', fetch: async () => {
    requests++;
    return emptyPage();
  } });
  for (const id of ['..', '../creator/games', 'a/b', '', 'a\\b', 'a?query']) {
    await assert.rejects(client.getGame(id), TypeError);
  }
  for (const limit of [0, 101, 1.5, Number.NaN]) {
    await assert.rejects(client.listGames({ limit }), RangeError);
  }
  assert.equal(requests, 0);
});

test('caller cancellation propagates to fetch', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createPlatformClient({
    baseUrl: 'http://localhost:3000',
    fetch: async (_input, init) => {
      assert.ok(init?.signal?.aborted);
      throw init.signal.reason;
    },
  });
  await assert.rejects(client.listGames({}, { signal: controller.signal }), PlatformTransportError);
});

test('a stalled HTTP response is canceled by the request timeout', async t => {
  const server = createServer(() => { /* Leave the response pending to exercise the real transport timeout. */ });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = createPlatformClient({ baseUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 50 });
  await assert.rejects(client.health(), error => {
    assert.ok(error instanceof PlatformTransportError);
    assert.ok(error.cause instanceof Error);
    assert.equal(error.cause.name, 'TimeoutError');
    return true;
  });
});

test('a real HTTP redirect is refused before credentials can reach the redirected endpoint', async t => {
  let redirectedRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/creator/games') {
      response.writeHead(307, { Location: '/credential-collector' }).end();
    } else {
      redirectedRequests++;
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = createPlatformClient({ baseUrl: `http://127.0.0.1:${address.port}`, creatorKey: 'local-test-key' });
  await assert.rejects(client.listCreatorGames(), PlatformTransportError);
  assert.equal(redirectedRequests, 0);
});
