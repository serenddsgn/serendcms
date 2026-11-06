/** Fordert einen Produktions-Build an (Trigger „deploy“); der Worker verarbeitet ihn. Aufruf aus dem Deploy-Skript. */
import { PgBoss } from 'pg-boss';
import { createDb, requestBuild } from '@serend/db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL fehlt.');
  process.exit(1);
}
const handle = createDb(url, { max: 1 });
const boss = new PgBoss(url);
boss.on('error', (e) => console.error('pg-boss:', e.message));
try {
  await boss.start();
  await boss.createQueue('site-build', { retryLimit: 0 });
  const { build, created } = await requestBuild(handle.db, { trigger: 'deploy' });
  if (created)
    await boss.send('site-build', { buildId: build.id }, { singletonKey: build.id, retryLimit: 0 });
  console.log(
    created ? `Build ${build.id} angefordert.` : `Es wartet bereits ein Build (${build.id}).`,
  );
} finally {
  await boss.stop({ graceful: false });
  await handle.close();
}
