import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import { sessions, users } from '@serend/db';
import type { Role } from '@serend/schema';
import type { Executor } from './executor.js';

export interface ValidSession {
  sessionId: string;
  csrfToken: string;
  user: { id: string; email: string; displayName: string; role: Role };
}

export function sessionsRepo(x: Executor) {
  return {
    async insert(v: {
      id: string;
      userId: string;
      csrfToken: string;
      expiresAt: Date;
    }): Promise<void> {
      await x.insert(sessions).values(v);
    },
    /** Nur unabgelaufene Sessions aktiver Benutzer; die Rolle wird bei jedem Request frisch gelesen. */
    async findValid(id: string): Promise<ValidSession | undefined> {
      const [row] = await x
        .select({
          sessionId: sessions.id,
          csrfToken: sessions.csrfToken,
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)),
        )
        .limit(1);
      if (!row) return undefined;
      return {
        sessionId: row.sessionId,
        csrfToken: row.csrfToken,
        user: {
          id: row.userId,
          email: row.email,
          displayName: row.displayName,
          role: row.role as Role,
        },
      };
    },
    async delete(id: string): Promise<void> {
      await x.delete(sessions).where(eq(sessions.id, id));
    },
    async deleteForUser(userId: string, exceptId?: string): Promise<void> {
      await x
        .delete(sessions)
        .where(
          exceptId
            ? and(eq(sessions.userId, userId), ne(sessions.id, exceptId))
            : eq(sessions.userId, userId),
        );
    },
    async deleteExpired(): Promise<void> {
      await x.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    },
  };
}
