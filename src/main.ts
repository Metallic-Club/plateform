import { loadConfig } from './config.js';
import { createApiServer } from './server.js';
import { CatalogStore } from './store.js';

try {
  const config = loadConfig(process.env);
  const store = new CatalogStore(config.databasePath);
  const server = createApiServer({ store, ...(config.devAuth ? { devAuth: config.devAuth } : {}) });
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => server.closeAllConnections(), 5_000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); store.close(); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('error', () => {
    console.error('Metallic API could not listen. Check the host and port configuration.');
    store.close();
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(`Metallic catalog API listening on ${config.host}:${config.port}.`);
    console.log(config.devAuth ? 'Local development creator access enabled.' : 'Creator access disabled.');
  });
} catch (error) {
  // Configuration messages name variables, never their values. Storage errors may contain private paths.
  const message = error instanceof Error && /^(METALLIC_|Development creator|Set both|Host and database)/u.test(error.message)
    ? error.message : 'Metallic API could not start. Check configuration and database access.';
  console.error(message);
  process.exitCode = 1;
}
