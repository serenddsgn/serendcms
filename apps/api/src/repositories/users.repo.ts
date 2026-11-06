import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { users, type NewUserRow, type UserRow } from '@serend/db';
import type { Executor } from './executor.js';

export type UserPatch = Partial<
  Pick<NewUserRow, 'displayName' | 'role' | 'passwordHash' | 'disabledAt' | 'lastLoginAt'>
>;

export function usersRepo(x: Executor) {
  return {
    async findById(id: string): Promise<UserRow | undefined> {
      const [row] = await x.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },
    async findByEmail(email: string): Promise<UserRow | undefined> {
      const [row] = await x.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },
    list(): Promise<UserRow[]> {
      return x.select().from(users).orderBy(asc(users.createdAt), asc(users.id));
    },
    async insert(values: NewUserRow): Promise<UserRow> {
      const [row] = await x.insert(users).values(values).returning();
      if (!row) throw new Error('insert user returned no row');
      return row;
    },
    async update(id: string, patch: UserPatch): Promise<UserRow | undefined> {
      const [row] = await x
        .update(users)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(users.id, id))
        .returning();
      return row;
    },
    /** Sperrt die aktiven Admins bis zum Transaktionsende (Schutz vor „letzten Admin entfernen“). */
    async lockActiveAdminIds(): Promise<string[]> {
      const rows = await x
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
        .for('update');
      return rows.map((r) => r.id);
    },
  };
}
