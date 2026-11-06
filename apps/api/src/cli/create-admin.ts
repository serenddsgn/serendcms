/**
 * Legt einen Benutzer an (auch in Produktion): `pnpm --filter @serend/api create-admin --email a@b.de --name "Name" [--role admin|editor]`
 * Das Passwort kommt aus ADMIN_PASSWORD oder wird zufällig erzeugt und einmalig ausgegeben.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '@serend/db';
import { DisplayName, Email, NewPassword, Role } from '@serend/schema';
import { createPasswordHasher } from '../lib/password.js';
import { usersRepo } from '../repositories/users.repo.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'admin' },
  },
});
const parsed = z
  .object({
    email: Email,
    name: DisplayName,
    role: Role,
    DATABASE_URL: z.string().min(1),
    ADMIN_PASSWORD: NewPassword.optional(),
  })
  .safeParse({
    ...values,
    ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)),
  });
if (!parsed.success) {
  console.error(
    'Aufruf: create-admin --email <adresse> --name <name> [--role admin|editor]  (DATABASE_URL, optional ADMIN_PASSWORD)',
  );
  console.error('Ungültig:', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
  process.exit(1);
}
const handle = createDb(parsed.data.DATABASE_URL, { max: 1 });
try {
  const users = usersRepo(handle.db);
  if (await users.findByEmail(parsed.data.email)) {
    console.error('Diese E-Mail-Adresse ist bereits vergeben.');
    process.exitCode = 1;
  } else {
    const password = parsed.data.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
    const hasher = createPasswordHasher({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await users.insert({
      email: parsed.data.email,
      displayName: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hasher.hash(password),
    });
    console.log(`Benutzer ${parsed.data.email} (${parsed.data.role}) angelegt.`);
    if (!parsed.data.ADMIN_PASSWORD)
      console.log(
        `Einmaliges Passwort (jetzt notieren, nach dem ersten Login ändern): ${password}`,
      );
  }
} finally {
  await handle.close();
}
