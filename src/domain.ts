/** Catalog categories. These are genres, not claims about recommendation quality. */
export const GENRES = [
  'action', 'adventure', 'obby', 'simulation', 'strategy',
  'racing', 'roleplay', 'puzzle', 'sports', 'other',
] as const;

export type Genre = (typeof GENRES)[number];
export type Visibility = 'draft' | 'published';

/** Persisted metadata for one creator-managed game. No runtime package is hosted yet. */
export interface Game {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  genre: Genre;
  tags: string[];
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  version: number;
}

export interface CreateGameInput {
  title: string;
  description?: string;
  genre: Genre;
  tags?: string[];
}

/** expectedVersion prevents a stale editor from overwriting a newer change. */
export interface UpdateGameInput {
  expectedVersion: number;
  title?: string;
  description?: string;
  genre?: Genre;
  tags?: string[];
}

export interface VersionInput { expectedVersion: number }
export interface GamesPage { games: Game[]; nextCursor: string | null }

/** Sanitized filters, produced by validation before querying storage. */
export interface ListGamesInput {
  limit: number;
  q?: string;
  genre?: Genre;
  cursor?: string;
  visibility?: Visibility;
}

/** Errors safe to expose through the HTTP boundary. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
