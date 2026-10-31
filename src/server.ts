import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ApiError } from './domain.js';
import type { CatalogStore } from './store.js';
import { validateCreate, validateList, validateUpdate, validateVersion } from './validation.js';

export interface DevAuth { key: string; creatorId: string }
export interface ApiOptions {
  store: CatalogStore;
  /** Explicit local tooling credential. This is not user or production authentication. */
  devAuth?: DevAuth;
}

const MAX_BODY_BYTES = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Configuration is checked here as well as at process startup so embedding cannot enable weak auth. */
export function validateDevAuth(auth: DevAuth): void {
  if (!/^[\x21-\x7e]{32,512}$/u.test(auth.key)) {
    throw new Error('METALLIC_DEV_API_KEY must contain 32 to 512 printable non-space ASCII characters.');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(auth.creatorId)) {
    throw new Error('METALLIC_DEV_CREATOR_ID must contain 1 to 128 letters, digits, underscores, or hyphens.');
  }
}

function authorize(req: IncomingMessage, auth: DevAuth | undefined): string {
  if (!auth) throw new ApiError(503, 'CREATOR_AUTH_UNAVAILABLE', 'Creator access is not configured.');
  const remote = req.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') {
    throw new ApiError(403, 'LOCAL_ACCESS_ONLY', 'Development creator access is restricted to this computer.');
  }
  if (req.headers.origin !== undefined) {
    throw new ApiError(403, 'BROWSER_CREATOR_ACCESS_DENIED', 'Use a trusted local tool for development creator access.');
  }
  const headers = req.headersDistinct.authorization;
  const provided = headers?.length === 1 ? headers[0] : undefined;
  const prefix = 'Bearer ';
  const candidate = provided?.startsWith(prefix) ? provided.slice(prefix.length) : '';
  const actual = createHash('sha256').update(candidate).digest();
  const expected = createHash('sha256').update(auth.key).digest();
  if (!timingSafeEqual(actual, expected)) throw new ApiError(401, 'UNAUTHORIZED', 'A valid creator credential is required.');
  return auth.creatorId;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-encoding'] !== undefined && req.headers['content-encoding'] !== 'identity') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Compressed request bodies are not supported.');
  }
  const contentType = req.headers['content-type'];
  if (!contentType || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send Content-Type: application/json.');
  }
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', `Request bodies cannot exceed ${MAX_BODY_BYTES} bytes.`);
  }
  const data = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const cleanup = (): void => {
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted);
    };
    const onError = (): void => { cleanup(); reject(new ApiError(400, 'INVALID_BODY', 'The request body could not be read.')); };
    const onAborted = (): void => { cleanup(); reject(new ApiError(400, 'INVALID_BODY', 'The request body was interrupted.')); };
    const onData = (chunk: Buffer): void => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        cleanup();
        req.resume();
        reject(new ApiError(413, 'BODY_TOO_LARGE', `Request bodies cannot exceed ${MAX_BODY_BYTES} bytes.`));
      } else chunks.push(chunk);
    };
    const onEnd = (): void => { cleanup(); resolve(Buffer.concat(chunks)); };
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onAborted);
  });
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body must contain valid UTF-8 JSON.');
  }
}

function send(res: ServerResponse, status: number, body: unknown, requestId: string): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Request-Id': requestId,
  });
  res.end(data);
}

/** Create an unbound server. The caller owns listen/close and the store lifetime. */
export function createApiServer(options: ApiOptions): Server {
  if (options.devAuth) validateDevAuth(options.devAuth);
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    // A socket can fail after a rejected upload has detached its body reader.
    req.on('error', () => {});
    const requestId = randomUUID();
    const execute = async (): Promise<void> => {
      if (!req.url || req.url.length > 4096 || !req.url.startsWith('/') || req.url.startsWith('//')) {
        throw new ApiError(400, 'INVALID_URL', 'The request URL is invalid.');
      }
      const url = new URL(req.url, 'http://local.invalid');
      const method = req.method ?? '';
      const path = url.pathname;
      if (path === '/health') {
        if (method !== 'GET') { res.setHeader('Allow', 'GET'); throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this route.'); }
        if (!options.store.healthy()) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Storage is unavailable.');
        send(res, 200, { status: 'ok', storage: 'sqlite' }, requestId);
        return;
      }
      if (path === '/api/v1/games') {
        if (method !== 'GET') { res.setHeader('Allow', 'GET'); throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this route.'); }
        send(res, 200, options.store.list(validateList(url.searchParams)), requestId);
        return;
      }
      const publicMatch = /^\/api\/v1\/games\/([^/]+)$/u.exec(path);
      if (publicMatch) {
        if (method !== 'GET') { res.setHeader('Allow', 'GET'); throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET for this route.'); }
        const id = publicMatch[1] ?? '';
        if (!UUID.test(id)) throw new ApiError(404, 'GAME_NOT_FOUND', 'Game not found.');
        send(res, 200, { game: options.store.publicGame(id) }, requestId);
        return;
      }
      if (path === '/api/v1/creator/games') {
        const creatorId = authorize(req, options.devAuth);
        if (method === 'GET') send(res, 200, options.store.list(validateList(url.searchParams, true), creatorId), requestId);
        else if (method === 'POST') {
          if (url.search) throw new ApiError(422, 'VALIDATION_ERROR', 'Query parameters are not supported for this action.');
          const game = options.store.create(creatorId, validateCreate(await readJson(req)));
          res.setHeader('Location', `/api/v1/creator/games/${game.id}`);
          send(res, 201, { game }, requestId);
        } else { res.setHeader('Allow', 'GET, POST'); throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST for this route.'); }
        return;
      }
      const creatorMatch = /^\/api\/v1\/creator\/games\/([^/]+)(?:\/(publish|unpublish))?$/u.exec(path);
      if (creatorMatch) {
        const creatorId = authorize(req, options.devAuth);
        const id = creatorMatch[1] ?? '';
        const action = creatorMatch[2];
        if (!UUID.test(id)) throw new ApiError(404, 'GAME_NOT_FOUND', 'Game not found.');
        if (url.search) throw new ApiError(422, 'VALIDATION_ERROR', 'Query parameters are not supported for this action.');
        if (!action && method === 'GET') send(res, 200, { game: options.store.creatorGame(id, creatorId) }, requestId);
        else if (!action && method === 'PATCH') {
          send(res, 200, { game: options.store.update(id, creatorId, validateUpdate(await readJson(req))) }, requestId);
        } else if (action && method === 'POST') {
          const { expectedVersion } = validateVersion(await readJson(req));
          send(res, 200, { game: options.store.setVisibility(id, creatorId, expectedVersion,
            action === 'publish' ? 'published' : 'draft') }, requestId);
        } else {
          res.setHeader('Allow', action ? 'POST' : 'GET, PATCH');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for this route.');
        }
        return;
      }
      throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
    };
    void execute().catch((error: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
      if (!req.complete) { req.resume(); res.setHeader('Connection', 'close'); }
      if (safe.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      send(res, safe.status, { error: {
        code: safe.code, message: safe.message, requestId,
        ...(safe.details ? { details: safe.details } : {}),
      } }, requestId);
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
