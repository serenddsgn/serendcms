import type { Database } from '@serend/db';
import type { Role } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';
import type { PasswordHasher } from '../lib/password.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { sessionsRepo, type ValidSession } from '../repositories/sessions.repo.js';
import { usersRepo } from '../repositories/users.repo.js';

export type AuthContext = ValidSession;

export interface LoginResult {
  token: string;
  csrfToken: string;
  expiresAt: Date;
  user: { id: string; email: string; displayName: string; role: Role };
}

export interface AuthServiceDeps {
  db: Database;
  config: Pick<AppConfig, 'sessionSecret' | 'sessionTtlHours'>;
  hasher: PasswordHasher;
}

export function createAuthService({ db, config, hasher }: AuthServiceDeps) {
  const users = usersRepo(db);
  const sessions = sessionsRepo(db);

  return {
    async login(email: string, password: string): Promise<LoginResult> {
      const user = await users.findByEmail(email);
      // Passwort wird immer geprüft (Attrappe bei unbekannter E-Mail): gleiche Antwortzeit, gleiche Meldung.
      const passwordOk = await hasher.verify(user?.passwordHash, password);
      if (!user || !passwordOk || user.disabledAt) throw errors.invalidCredentials();

      const token = generateToken();
      const csrfToken = generateToken();
      const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000);
      await sessions.insert({
        id: hashToken(config.sessionSecret, token),
        userId: user.id,
        csrfToken,
        expiresAt,
      });
      await users.update(user.id, { lastLoginAt: new Date() });
      await sessions.deleteExpired();

      return {
        token,
        csrfToken,
        expiresAt,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role as Role,
        },
      };
    },

    async authenticate(token: string): Promise<AuthContext | undefined> {
      return sessions.findValid(hashToken(config.sessionSecret, token));
    },

    async logout(sessionId: string): Promise<void> {
      await sessions.delete(sessionId);
    },

    /** Ändert das eigene Passwort und beendet alle anderen Sessions des Benutzers. */
    async changePassword(
      userId: string,
      currentSessionId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const user = await users.findById(userId);
      if (!user || !(await hasher.verify(user.passwordHash, currentPassword))) {
        throw errors.invalidCredentials();
      }
      const passwordHash = await hasher.hash(newPassword);
      await db.transaction(async (tx) => {
        await usersRepo(tx).update(userId, { passwordHash });
        await sessionsRepo(tx).deleteForUser(userId, currentSessionId);
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
