import type {
  CreateGameInput,
  Game,
  GamesPage,
  Genre,
  UpdateGameInput,
} from '../src/domain.js';
import { GENRES } from '../src/domain.js';

export type { CreateGameInput, Game, GamesPage, Genre, UpdateGameInput } from '../src/domain.js';

/** A rejected API request. Keep the request ID when reporting a failure. */
export class PlatformApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | undefined,
    public readonly details: unknown = undefined,
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}

/** A connection, cancellation, timeout, or invalid server response. */
export class PlatformTransportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PlatformTransportError';
  }
}

export interface ClientOptions {
  /** API origin, optionally including a reverse-proxy path prefix. */
  baseUrl: string;
  /** Local development only. Keep this key in a trusted tool, never browser code. */
  creatorKey?: string;
  /** Per-request timeout. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Allows a host application to provide its fetch implementation. */
  fetch?: typeof globalThis.fetch;
}

export interface ListGamesOptions {
  q?: string;
  genre?: Genre;
  limit?: number;
  cursor?: string;
}

export interface ListCreatorGamesOptions extends ListGamesOptions {
  visibility?: Game['visibility'];
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/** HTTP client shared by trusted creator tools and public catalog consumers. */
export interface PlatformClient {
  health(options?: RequestOptions): Promise<{ status: 'ok'; storage: 'sqlite' }>;
  listGames(query?: ListGamesOptions, options?: RequestOptions): Promise<GamesPage>;
  getGame(id: string, options?: RequestOptions): Promise<Game>;
  getCreatorGame(id: string, options?: RequestOptions): Promise<Game>;
  listCreatorGames(query?: ListCreatorGamesOptions, options?: RequestOptions): Promise<GamesPage>;
  createGame(input: CreateGameInput, options?: RequestOptions): Promise<Game>;
  updateGame(id: string, input: UpdateGameInput, options?: RequestOptions): Promise<Game>;
  publishGame(id: string, expectedVersion: number, options?: RequestOptions): Promise<Game>;
  unpublishGame(id: string, expectedVersion: number, options?: RequestOptions): Promise<Game>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function game(value: unknown): value is Game {
  return object(value)
    && typeof value.id === 'string'
    && typeof value.creatorId === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && GENRES.some(genre => genre === value.genre)
    && Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string')
    && (value.visibility === 'draft' || value.visibility === 'published')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && (value.publishedAt === null || typeof value.publishedAt === 'string')
    && Number.isSafeInteger(value.version) && Number(value.version) > 0;
}

function unwrapGame(value: unknown): Game {
  if (!object(value) || !game(value.game)) {
    throw new PlatformTransportError('The API returned an invalid game response.');
  }
  return value.game;
}

function unwrapPage(value: unknown): GamesPage {
  if (!object(value) || !Array.isArray(value.games) || !value.games.every(game)
    || !(value.nextCursor === null || typeof value.nextCursor === 'string')) {
    throw new PlatformTransportError('The API returned an invalid games page.');
  }
  return { games: value.games, nextCursor: value.nextCursor };
}

function gamePath(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new TypeError('A game ID must contain 1 to 128 letters, numbers, underscores or hyphens.');
  }
  return encodeURIComponent(id);
}

function queryString(values: ListGamesOptions | ListCreatorGamesOptions): string {
  if (values.limit !== undefined && (!Number.isInteger(values.limit) || values.limit < 1 || values.limit > 100)) {
    throw new RangeError('The page limit must be an integer between 1 and 100.');
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

/** Creates a client. Mutations are never retried automatically. */
export function createPlatformClient(options: ClientOptions): PlatformClient {
  const base = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new TypeError('baseUrl must be an HTTP(S) URL without credentials, a query, or a fragment.');
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be a positive integer no greater than 2147483647.');
  }
  const transport = options.fetch ?? globalThis.fetch;
  const baseUrl = base.href.replace(/\/$/, '');
  const creatorKey = options.creatorKey;

  async function request(
    method: string,
    path: string,
    creator: boolean,
    body?: unknown,
    requestOptions?: RequestOptions,
  ): Promise<unknown> {
    if (creator && !creatorKey) {
      throw new PlatformApiError(401, 'CREATOR_KEY_REQUIRED', 'Configure a creator key in a trusted local tool.', undefined);
    }
    const headers = new Headers({ Accept: 'application/json' });
    if (creator) headers.set('Authorization', `Bearer ${creatorKey}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = requestOptions?.signal ? AbortSignal.any([timeout, requestOptions.signal]) : timeout;
    let response: Response;
    let value: unknown;
    try {
      response = await transport(`${baseUrl}/${path}`, {
        method,
        headers,
        signal,
        credentials: 'omit',
        redirect: 'error',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      value = await response.json();
    } catch (cause) {
      throw new PlatformTransportError('The API request failed or did not return JSON.', { cause });
    }
    if (!response.ok) {
      if (object(value) && object(value.error)
        && typeof value.error.code === 'string' && typeof value.error.message === 'string') {
        throw new PlatformApiError(
          response.status,
          value.error.code,
          value.error.message,
          typeof value.error.requestId === 'string' ? value.error.requestId : response.headers.get('x-request-id') ?? undefined,
          value.error.details,
        );
      }
      throw new PlatformApiError(response.status, 'HTTP_ERROR', 'The API rejected the request.', response.headers.get('x-request-id') ?? undefined);
    }
    return value;
  }

  return {
    async health(requestOptions) {
      const value = await request('GET', 'health', false, undefined, requestOptions);
      if (!object(value) || value.status !== 'ok' || value.storage !== 'sqlite') {
        throw new PlatformTransportError('The API returned an invalid health response.');
      }
      return { status: 'ok', storage: 'sqlite' };
    },
    async listGames(query = {}, requestOptions) {
      return unwrapPage(await request('GET', `api/v1/games${queryString(query)}`, false, undefined, requestOptions));
    },
    async getGame(id, requestOptions) {
      return unwrapGame(await request('GET', `api/v1/games/${gamePath(id)}`, false, undefined, requestOptions));
    },
    async getCreatorGame(id, requestOptions) {
      return unwrapGame(await request('GET', `api/v1/creator/games/${gamePath(id)}`, true, undefined, requestOptions));
    },
    async listCreatorGames(query = {}, requestOptions) {
      return unwrapPage(await request('GET', `api/v1/creator/games${queryString(query)}`, true, undefined, requestOptions));
    },
    async createGame(input, requestOptions) {
      return unwrapGame(await request('POST', 'api/v1/creator/games', true, input, requestOptions));
    },
    async updateGame(id, input, requestOptions) {
      return unwrapGame(await request('PATCH', `api/v1/creator/games/${gamePath(id)}`, true, input, requestOptions));
    },
    async publishGame(id, expectedVersion, requestOptions) {
      return unwrapGame(await request('POST', `api/v1/creator/games/${gamePath(id)}/publish`, true, { expectedVersion }, requestOptions));
    },
    async unpublishGame(id, expectedVersion, requestOptions) {
      return unwrapGame(await request('POST', `api/v1/creator/games/${gamePath(id)}/unpublish`, true, { expectedVersion }, requestOptions));
    },
  };
}
