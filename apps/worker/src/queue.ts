import { PgBoss } from 'pg-boss';

export const BUILD_QUEUE = 'site-build';

/** Schnittstelle, die API und Worker teilen; Tests ersetzen sie durch eine Attrappe. */
export interface BuildQueue {
  enqueue(buildId: string): Promise<void>;
}

export async function startBoss(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err) => console.error('pg-boss:', err.message));
  await boss.start();
  await boss.createQueue(BUILD_QUEUE, { retryLimit: 0 });
  return boss;
}

export function pgBossQueue(boss: PgBoss): BuildQueue {
  return {
    async enqueue(buildId) {
      // singletonKey: ein Build wird höchstens einmal eingereiht, auch wenn der Sweep ihn erneut meldet
      await boss.send(BUILD_QUEUE, { buildId }, { singletonKey: buildId, retryLimit: 0 });
    },
  };
}
