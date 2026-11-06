/**
 * `pnpm db:seed`: legt lokal einen Admin an (Beispielinhalte folgen mit den Inhaltstabellen).
 * Das Passwort stammt aus SEED_ADMIN_PASSWORD oder wird zufällig erzeugt und
 * einmalig im Terminal ausgegeben. Nie in Produktion.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createDb } from '@serend/db';
import { Email, NewPassword } from '@serend/schema';
import { createPasswordHasher } from '../lib/password.js';
import { usersRepo } from '../repositories/users.repo.js';

const env = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_EMAIL: Email.default('admin@serend.local'),
    SEED_ADMIN_PASSWORD: NewPassword.optional(),
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
  if (await users.findByEmail(email)) {
    console.log(`Admin ${email} existiert bereits, nichts geändert.`);
  } else {
    const generated = env.data.SEED_ADMIN_PASSWORD === undefined;
    const password = env.data.SEED_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
    const hasher = createPasswordHasher({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await users.insert({
      email,
      displayName: 'Admin',
      role: 'admin',
      passwordHash: await hasher.hash(password),
    });
    console.log(`Admin angelegt: ${email}`);
    if (generated)
      console.log(`Einmaliges Passwort (jetzt notieren, wird nicht erneut angezeigt): ${password}`);
  }
} finally {
  await handle.close();
}
