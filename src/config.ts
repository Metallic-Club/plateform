import type { DevAuth } from './server.js';
import { validateDevAuth } from './server.js';

export interface Configuration {
  host: string;
  port: number;
  databasePath: string;
  devAuth?: DevAuth;
}

/** Parse process configuration without logging secrets or silently enabling development credentials. */
export function loadConfig(env: NodeJS.ProcessEnv): Configuration {
  const host = env.METALLIC_HOST ?? '127.0.0.1';
  const rawPort = env.METALLIC_PORT ?? '3000';
  if (!/^\d+$/u.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('METALLIC_PORT must be an integer between 1 and 65535.');
  }
  const databasePath = env.METALLIC_DATABASE_PATH ?? './data/catalog.sqlite';
  if (!host.trim() || !databasePath.trim()) throw new Error('Host and database path cannot be empty.');
  const result: Configuration = { host, port: Number(rawPort), databasePath };
  const key = env.METALLIC_DEV_API_KEY;
  const creatorId = env.METALLIC_DEV_CREATOR_ID;
  if (key !== undefined || creatorId !== undefined) {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      throw new Error('Development creator credentials require NODE_ENV=development or test.');
    }
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
      throw new Error('Development creator credentials require a loopback METALLIC_HOST.');
    }
    if (!key || !creatorId) throw new Error('Set both METALLIC_DEV_API_KEY and METALLIC_DEV_CREATOR_ID.');
    result.devAuth = { key, creatorId };
    validateDevAuth(result.devAuth);
  }
  return result;
}
