import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createDb, sessions, users, type DbHandle } from '../src/index.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

let testDb: TestDatabase;
let h: DbHandle;

beforeAll(async () => {
  testDb = await createTestDatabase(inject('pgAdminUrl'));
  h = createDb(testDb.url, { max: 2 });
});
afterAll(async () => {
  await h.close();
  await testDb.drop();
});

const base = { displayName: 'Test', passwordHash: 'hash', role: 'editor' };

describe('Datenmodell Phase 1', () => {
  it('vergibt UUIDv7 und timestamptz-Zeitstempel', async () => {
    const [u] = await h.db
      .insert(users)
      .values({ ...base, email: 'uuid@example.com' })
      .returning();
    expect(u?.id[14]).toBe('7'); // Versionsnibble
    expect(u?.createdAt).toBeInstanceOf(Date);
    const col = await h.pool.query(
      `select data_type from information_schema.columns where table_name='users' and column_name='created_at'`,
    );
    expect(col.rows[0].data_type).toBe('timestamp with time zone');
  });

  it('erzwingt eindeutige, kleingeschriebene E-Mail', async () => {
    await h.db.insert(users).values({ ...base, email: 'dup@example.com' });
    await expect(
      h.db.insert(users).values({ ...base, email: 'dup@example.com' }),
    ).rejects.toThrow();
    await expect(
      h.db.insert(users).values({ ...base, email: 'Upper@example.com' }),
    ).rejects.toThrow();
  });

  it('erlaubt nur die Rollen admin und editor', async () => {
    await expect(
      h.db.insert(users).values({ ...base, email: 'role@example.com', role: 'root' }),
    ).rejects.toThrow();
  });

  it('löscht Sessions mit dem Benutzer (ON DELETE CASCADE)', async () => {
    const [u] = await h.db
      .insert(users)
      .values({ ...base, email: 'cascade@example.com' })
      .returning();
    await h.db.insert(sessions).values({
      id: 'sid-1',
      userId: u!.id,
      csrfToken: 'c',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await h.db.delete(users).where(eq(users.id, u!.id));
    const left = await h.db.select().from(sessions).where(eq(sessions.id, 'sid-1'));
    expect(left).toHaveLength(0);
  });
});
