import {
  ApiError, GENRES,
  type CreateGameInput, type Genre, type ListGamesInput,
  type UpdateGameInput, type VersionInput,
} from './domain.js';

function invalid(field: string, message: string): never {
  throw new ApiError(422, 'VALIDATION_ERROR', 'The request contains invalid fields.', { [field]: message });
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid('body', 'Expected a JSON object.');
  }
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) invalid(key, 'Unknown field.');
  }
  return body;
}

function text(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') invalid(field, 'Expected text.');
  const normalized = value.trim().normalize('NFC');
  const length = Array.from(normalized).length;
  if (length < minimum || length > maximum) {
    invalid(field, `Use between ${minimum} and ${maximum} characters.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    invalid(field, 'Control characters are not allowed.');
  }
  if (/\p{Surrogate}/u.test(normalized)) invalid(field, 'Unpaired Unicode surrogates are not allowed.');
  return normalized;
}

function genre(value: unknown): Genre {
  if (typeof value !== 'string' || !GENRES.includes(value as Genre)) {
    invalid('genre', `Choose one of: ${GENRES.join(', ')}.`);
  }
  return value as Genre;
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) invalid('tags', 'Use at most 8 tags.');
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry) || entry.length > 32) {
      invalid('tags', 'Each tag must be 1 to 32 lowercase letters, digits, or internal hyphens.');
    }
    if (result.includes(entry)) invalid('tags', 'Duplicate tags are not allowed.');
    result.push(entry);
  }
  return result;
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid('expectedVersion', 'Expected a positive integer from the latest game response.');
  }
  return value;
}

/** Validate and normalize a creator draft. */
export function validateCreate(value: unknown): CreateGameInput {
  const body = object(value, ['title', 'description', 'genre', 'tags']);
  return {
    title: text(body.title, 'title', 3, 80),
    description: body.description === undefined ? '' : text(body.description, 'description', 0, 2000),
    genre: genre(body.genre),
    tags: body.tags === undefined ? [] : tags(body.tags),
  };
}

export function validateUpdate(value: unknown): UpdateGameInput {
  const body = object(value, ['expectedVersion', 'title', 'description', 'genre', 'tags']);
  const result: UpdateGameInput = { expectedVersion: version(body.expectedVersion) };
  if (body.title !== undefined) result.title = text(body.title, 'title', 3, 80);
  if (body.description !== undefined) result.description = text(body.description, 'description', 0, 2000);
  if (body.genre !== undefined) result.genre = genre(body.genre);
  if (body.tags !== undefined) result.tags = tags(body.tags);
  if (Object.keys(result).length === 1) invalid('body', 'Include at least one field to update.');
  return result;
}

export function validateVersion(value: unknown): VersionInput {
  const body = object(value, ['expectedVersion']);
  return { expectedVersion: version(body.expectedVersion) };
}

/** Reject repeated or unknown query parameters so cache and cursor semantics stay unambiguous. */
export function validateList(params: URLSearchParams, creator = false): ListGamesInput {
  const allowed = creator ? ['limit', 'cursor', 'q', 'genre', 'visibility'] : ['limit', 'cursor', 'q', 'genre'];
  for (const name of params.keys()) {
    if (!allowed.includes(name)) invalid(name, 'Unknown query parameter.');
    if (params.getAll(name).length !== 1) invalid(name, 'Query parameters cannot be repeated.');
  }
  const result: ListGamesInput = { limit: 20 };
  const limit = params.get('limit');
  if (limit !== null) {
    if (!/^[1-9]\d?$/u.test(limit) && limit !== '100') invalid('limit', 'Use an integer between 1 and 100.');
    result.limit = Number(limit);
  }
  const q = params.get('q');
  if (q !== null) result.q = text(q, 'q', 1, 100);
  const category = params.get('genre');
  if (category !== null) result.genre = genre(category);
  const cursor = params.get('cursor');
  if (cursor !== null) result.cursor = text(cursor, 'cursor', 1, 2048);
  const visibility = params.get('visibility');
  if (visibility !== null) {
    if (visibility !== 'draft' && visibility !== 'published') invalid('visibility', 'Use draft or published.');
    result.visibility = visibility;
  }
  return result;
}
