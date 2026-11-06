import { z } from 'zod';
import { createDb } from '../client.js';
import { runMigrations } from '../migrate.js';

const parsed = z.object({ DATABASE_URL: z.string().min(1) }).safeParse(process.env);
if (!parsed.success) {
  console.error('DATABASE_URL fehlt oder ist ungültig. Siehe .env.example.');
  process.exit(1);
}

const handle = createDb(parsed.data.DATABASE_URL, { max: 1 });
try {
  await runMigrations(handle.db);
  console.log('Migrationen angewendet.');
} catch (err) {
  console.error('Migration fehlgeschlagen:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await handle.close();
}
