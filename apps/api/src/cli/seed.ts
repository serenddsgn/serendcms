/**
 * `pnpm db:seed`: legt lokal einen Admin an (Beispielinhalte folgen mit den Inhaltstabellen).
 * Das Passwort stammt aus SEED_ADMIN_PASSWORD oder wird zufällig erzeugt und
 * einmalig im Terminal ausgegeben. Nie in Produktion.
 */
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { projects as projectsTable } from '@serend/db';
import { count } from 'drizzle-orm';
import { createDb } from '@serend/db';
import { Email, NewPassword } from '@serend/schema';
import { createPasswordHasher } from '../lib/password.js';
import { usersRepo } from '../repositories/users.repo.js';
import { seedContent } from '../seed/content.js';
import { createMediaService } from '../services/media.service.js';
import { createPagesService } from '../services/pages.service.js';
import { createProjectsService } from '../services/projects.service.js';
import { createLocalStorage } from '../storage/local.js';

const env = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_EMAIL: Email.default('admin@serend.local'),
    SEED_ADMIN_PASSWORD: NewPassword.optional(),
    SEED_CONTENT: z.stringbool().default(true),
    STORAGE_DIR: z.string().default('.data/media'),
  })
  .safeParse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));

if (!env.success) {
  console.error(
    'Seed-Konfiguration ungültig:',
    env.error.issues.map((i) => i.path.join('.')).join(', '),
  );
  process.exit(1);
}
if (env.data.NODE_ENV === 'production') {
  console.error('db:seed ist für Produktion gesperrt.');
  process.exit(1);
}

const handle = createDb(env.data.DATABASE_URL, { max: 1 });
try {
  const users = usersRepo(handle.db);
  const email = env.data.SEED_ADMIN_EMAIL;
  let admin = await users.findByEmail(email);
  if (admin) {
    console.log(`Admin ${email} existiert bereits, nichts geändert.`);
  } else {
    const generated = env.data.SEED_ADMIN_PASSWORD === undefined;
    const password = env.data.SEED_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
    const hasher = createPasswordHasher({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
    admin = await users.insert({
      email,
      displayName: 'Admin',
      role: 'admin',
      passwordHash: await hasher.hash(password),
    });
    console.log(`Admin angelegt: ${email}`);
    if (generated)
      console.log(`Einmaliges Passwort (jetzt notieren, wird nicht erneut angezeigt): ${password}`);
  }
  if (env.data.SEED_CONTENT && admin) {
    const [existing] = await handle.db.select({ n: count() }).from(projectsTable);
    if ((existing?.n ?? 0) > 0) {
      console.log('Inhalte existieren bereits, nichts geändert.');
    } else {
      const storage = createLocalStorage(resolve(env.data.STORAGE_DIR));
      await seedContent({
        db: handle.db,
        media: createMediaService({ db: handle.db, storage }),
        projects: createProjectsService({ db: handle.db }),
        pages: createPagesService({ db: handle.db }),
        actorId: admin.id,
        imagesDir: fileURLToPath(new URL('../../../../design/images', import.meta.url)),
      });
      console.log(
        'Beispielinhalte aus dem Design angelegt (12 Projekte DE/EN, Seiten, Leistungen, Navigation).',
      );
    }
  }
} finally {
  await handle.close();
}
