/**
 * Legt die Startinhalte aus dem Design an (12 Projekte DE/EN, Seiten, Leistungen, Navigation, Einstellungen, Bilder) und
 * ist für Produktion gedacht: `pnpm --filter @serend/api seed-content --admin du@example.com`
 * Voraussetzung ist ein bestehender Benutzer (create-admin). Existieren schon Projekte, passiert nichts.
 * Legt keinen Benutzer an und veröffentlicht nur die Inhalte, die das Design vorsieht (Rechtstexte bleiben leere Entwürfe).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { count } from 'drizzle-orm';
import { z } from 'zod';
import { createDb, projects as projectsTable } from '@serend/db';
import { Email } from '@serend/schema';
import { usersRepo } from '../repositories/users.repo.js';
import { seedContent } from '../seed/content.js';
import { createMediaService } from '../services/media.service.js';
import { createPagesService } from '../services/pages.service.js';
import { createProjectsService } from '../services/projects.service.js';
import { createLocalStorage } from '../storage/local.js';

const { values } = parseArgs({ options: { admin: { type: 'string' } }, allowPositionals: true });
const env = z
  .object({
    admin: Email,
    DATABASE_URL: z.string().min(1),
    STORAGE_DIR: z.string().default('.data/media'),
  })
  .safeParse({
    ...values,
    ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)),
  });
if (!env.success) {
  console.error(
    'Aufruf: seed-content --admin <e-mail eines vorhandenen Benutzers>   (DATABASE_URL, STORAGE_DIR)',
  );
  console.error('Ungültig:', env.error.issues.map((i) => i.path.join('.')).join(', '));
  process.exit(1);
}

const handle = createDb(env.data.DATABASE_URL, { max: 2 });
try {
  const admin = await usersRepo(handle.db).findByEmail(env.data.admin);
  if (!admin) {
    console.error(`Benutzer ${env.data.admin} existiert nicht. Zuerst: create-admin.`);
    process.exitCode = 1;
  } else if (((await handle.db.select({ n: count() }).from(projectsTable))[0]?.n ?? 0) > 0) {
    console.log('Es gibt bereits Projekte, nichts geändert.');
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
      'Startinhalte angelegt (12 Projekte DE/EN, Seiten, Leistungen, Navigation, Einstellungen).',
    );
  }
} finally {
  await handle.close();
}
