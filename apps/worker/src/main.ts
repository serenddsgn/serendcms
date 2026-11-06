import { mkdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createDb, failStaleBuilds, queuedBuilds } from '@serend/db';
import { z } from 'zod';
import { ConfigError, loadWorkerConfig } from './config.js';
import { BUILD_QUEUE, pgBossQueue, startBoss } from './queue.js';
import { runBuild } from './runner.js';
import { createAstroBuilder } from './site-builder.js';

let config;
try {
  config = loadWorkerConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const run = promisify(exec);
const handle = createDb(config.databaseUrl, { max: 4 });
await mkdir(config.releasesDir, { recursive: true });
const failed = await failStaleBuilds(handle.db);
if (failed > 0) console.warn(`${failed} unterbrochene(r) Build(s) als fehlgeschlagen markiert.`);

const boss = await startBoss(config.databaseUrl);
const queue = pgBossQueue(boss);
const buildSite = createAstroBuilder(config);
const Payload = z.object({ buildId: z.uuid() });

await boss.work(BUILD_QUEUE, { batchSize: 1 }, async ([job]) => {
  if (!job) return;
  const { buildId } = Payload.parse(job.data);
  const result = await runBuild(
    {
      db: handle.db,
      config,
      buildSite,
      afterSwitch: async ({ redirectsChanged }) => {
        if (redirectsChanged && config.caddyReloadCommand) await run(config.caddyReloadCommand);
      },
    },
    buildId,
  );
  console.log(
    `Build ${buildId}: ${result.status}${result.status === 'failed' ? ` (${result.error.split('\n')[0]})` : ''}`,
  );
});

/** Wartende Builds ohne Job (z. B. Absturz zwischen Anlegen und Einreihen) nachtragen. */
async function sweep() {
  for (const b of await queuedBuilds(handle.db)) await queue.enqueue(b.id);
}
await sweep();
const timer = setInterval(
  () => void sweep().catch((e) => console.error('sweep:', e.message)),
  60_000,
);

async function shutdown() {
  clearInterval(timer);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
console.log('Worker läuft.');
