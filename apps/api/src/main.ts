import { createDb } from '@serend/db';
import { PgBoss } from 'pg-boss';
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const handle = createDb(config.databaseUrl);
// Die API reiht Build-Jobs nur ein (Client); der Worker verarbeitet sie.
const boss = new PgBoss(config.databaseUrl);
boss.on('error', (err) => console.error('pg-boss:', err.message));
await boss.start();
await boss.createQueue('site-build', { retryLimit: 0 });
const app = await buildApp({
  config,
  db: handle.db,
  queue: {
    enqueue: async (buildId) => {
      await boss.send('site-build', { buildId }, { singletonKey: buildId, retryLimit: 0 });
    },
  },
});

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await boss.stop({ graceful: true, timeout: 10_000 });
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
