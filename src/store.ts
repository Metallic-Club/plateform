import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  ApiError,
  type CreateGameInput, type Game, type GamesPage, type Genre,
  type ListGamesInput, type UpdateGameInput, type Visibility,
} from './domain.js';

interface GameRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  genre: string;
  tags: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  version: number;
}

function toGame(row: GameRow): Game {
  return {
    id: row.id, creatorId: row.creator_id, title: row.title,
    description: row.description, genre: row.genre as Genre,
    tags: JSON.parse(row.tags) as string[], visibility: row.visibility as Visibility,
    createdAt: row.created_at, updatedAt: row.updated_at,
    publishedAt: row.published_at, version: row.version,
  };
}

interface Cursor { v: 1; time: string; id: string; filter: string }

function parseCursor(value: string, filter: string): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('encoding');
    const cursor: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) throw new Error('shape');
    const record = cursor as Record<string, unknown>;
    if (Object.keys(record).length !== 4 || record.v !== 1 || record.filter !== filter
      || typeof record.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.time)
      || typeof record.id !== 'string' || !/^[0-9a-f-]{36}$/u.test(record.id)) throw new Error('fields');
    return record as unknown as Cursor;
  } catch {
    throw new ApiError(422, 'INVALID_CURSOR', 'The cursor is invalid or belongs to different filters.');
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

/**
 * A single-process SQLite catalog, using WAL and conditional updates.
 * The synchronous driver is deliberately a local foundation, not a horizontal scaling claim.
 */
export class CatalogStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      const schema = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
      if (schema.user_version > 1) throw new Error('Database schema is newer than this application.');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      if (schema.user_version === 0) {
        this.db.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE games (
            id TEXT PRIMARY KEY,
            creator_id TEXT NOT NULL,
            title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 80),
            description TEXT NOT NULL CHECK(length(description) <= 2000),
            genre TEXT NOT NULL,
            tags TEXT NOT NULL CHECK(json_valid(tags)),
            visibility TEXT NOT NULL CHECK(visibility IN ('draft', 'published')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            published_at TEXT,
            version INTEGER NOT NULL CHECK(version >= 1),
            CHECK((visibility = 'published' AND published_at IS NOT NULL) OR
                  (visibility = 'draft' AND published_at IS NULL))
          ) STRICT;
          CREATE INDEX games_discovery ON games(published_at DESC, id DESC) WHERE visibility = 'published';
          CREATE INDEX games_discovery_genre ON games(genre, published_at DESC, id DESC) WHERE visibility = 'published';
          CREATE INDEX games_creator ON games(creator_id, created_at DESC, id DESC);
          PRAGMA user_version=1;
          COMMIT;
        `);
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void { if (this.db.isOpen) this.db.close(); }

  healthy(): boolean {
    try { return (this.db.prepare('SELECT 1 AS ok').get() as { ok: number }).ok === 1; }
    catch { return false; }
  }

  /** A public lookup intentionally treats an unpublished game as absent. */
  publicGame(id: string): Game {
    const row = this.db.prepare("SELECT * FROM games WHERE id=? AND visibility='published'").get(id);
    if (!row) throw new ApiError(404, 'GAME_NOT_FOUND', 'Game not found.');
    return toGame(row as unknown as GameRow);
  }

  creatorGame(id: string, creatorId: string): Game {
    const row = this.db.prepare('SELECT * FROM games WHERE id=? AND creator_id=?').get(id, creatorId);
    if (!row) throw new ApiError(404, 'GAME_NOT_FOUND', 'Game not found.');
    return toGame(row as unknown as GameRow);
  }

  /** Keyset pagination, with a cursor bound to the original query and creator. */
  list(input: ListGamesInput, creatorId?: string): GamesPage {
    const where = creatorId === undefined ? ["visibility='published'"] : ['creator_id=?'];
    const bindings: SQLInputValue[] = creatorId === undefined ? [] : [creatorId];
    const field = creatorId === undefined ? 'published_at' : 'created_at';
    if (input.visibility !== undefined && creatorId !== undefined) {
      where.push('visibility=?'); bindings.push(input.visibility);
    }
    if (input.genre !== undefined) { where.push('genre=?'); bindings.push(input.genre); }
    if (input.q !== undefined) {
      where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
      const query = `%${escapeLike(input.q)}%`;
      bindings.push(query, query);
    }
    const filter = JSON.stringify([creatorId ?? null, input.q ?? null, input.genre ?? null, input.visibility ?? null]);
    if (input.cursor !== undefined) {
      const cursor = parseCursor(input.cursor, filter);
      where.push(`(${field} < ? OR (${field} = ? AND id < ?))`);
      bindings.push(cursor.time, cursor.time, cursor.id);
    }
    bindings.push(input.limit + 1);
    const rows = this.db.prepare(`SELECT * FROM games WHERE ${where.join(' AND ')} ORDER BY ${field} DESC, id DESC LIMIT ?`)
      .all(...bindings) as unknown as GameRow[];
    const more = rows.length > input.limit;
    const selected = rows.slice(0, input.limit);
    const last = selected.at(-1);
    const nextCursor = more && last ? Buffer.from(JSON.stringify({
      v: 1, time: creatorId === undefined ? (last.published_at ?? last.created_at) : last.created_at,
      id: last.id, filter,
    } satisfies Cursor)).toString('base64url') : null;
    return { games: selected.map(toGame), nextCursor };
  }

  create(creatorId: string, input: CreateGameInput): Game {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO games
      (id, creator_id, title, description, genre, tags, visibility, created_at, updated_at, published_at, version)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, 1)`)
      .run(id, creatorId, input.title, input.description ?? '', input.genre, JSON.stringify(input.tags ?? []), now, now);
    return this.creatorGame(id, creatorId);
  }

  update(id: string, creatorId: string, input: UpdateGameInput): Game {
    const current = this.creatorGame(id, creatorId);
    this.checkVersion(current, input.expectedVersion);
    if (current.visibility !== 'draft') throw new ApiError(409, 'GAME_PUBLISHED', 'Unpublish the game before editing its metadata.');
    const result = this.db.prepare(`UPDATE games SET title=?, description=?, genre=?, tags=?, updated_at=?, version=version+1
      WHERE id=? AND creator_id=? AND version=? AND visibility='draft'`)
      .run(input.title ?? current.title, input.description ?? current.description,
        input.genre ?? current.genre, JSON.stringify(input.tags ?? current.tags),
        new Date().toISOString(), id, creatorId, input.expectedVersion);
    if (result.changes !== 1) throw new ApiError(409, 'VERSION_CONFLICT', 'The game changed. Reload it before retrying.');
    return this.creatorGame(id, creatorId);
  }

  setVisibility(id: string, creatorId: string, expectedVersion: number, visibility: Visibility): Game {
    const current = this.creatorGame(id, creatorId);
    this.checkVersion(current, expectedVersion);
    if (current.visibility === visibility) return current;
    if (visibility === 'published' && Array.from(current.description).length < 20) {
      throw new ApiError(422, 'PUBLISH_VALIDATION_FAILED', 'Add a description with at least 20 characters before publishing.', {
        description: 'Use at least 20 characters.',
      });
    }
    const now = new Date().toISOString();
    const result = this.db.prepare(`UPDATE games SET visibility=?, published_at=?, updated_at=?, version=version+1
      WHERE id=? AND creator_id=? AND version=?`)
      .run(visibility, visibility === 'published' ? now : null, now, id, creatorId, expectedVersion);
    if (result.changes !== 1) throw new ApiError(409, 'VERSION_CONFLICT', 'The game changed. Reload it before retrying.');
    return this.creatorGame(id, creatorId);
  }

  private checkVersion(game: Game, expected: number): void {
    if (game.version !== expected) throw new ApiError(409, 'VERSION_CONFLICT', 'The game changed. Reload it before retrying.');
  }
}
