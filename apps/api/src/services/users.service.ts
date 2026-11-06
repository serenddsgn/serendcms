import type { Database } from '@serend/db';
import type { Role, UserDto } from '@serend/schema';
import { errors } from '../lib/errors.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import type { PasswordHasher } from '../lib/password.js';
import { sessionsRepo } from '../repositories/sessions.repo.js';
import { usersRepo } from '../repositories/users.repo.js';
import { toUserDto } from './dto.js';

export interface UsersServiceDeps {
  db: Database;
  hasher: PasswordHasher;
}

export function createUsersService({ db, hasher }: UsersServiceDeps) {
  const users = usersRepo(db);

  /** Sorgt dafür, dass nach der Änderung mindestens ein aktiver Admin übrig bleibt. */
  async function assertAdminRemains(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    targetId: string,
  ) {
    const admins = await usersRepo(tx).lockActiveAdminIds();
    if (!admins.some((id) => id !== targetId)) {
      throw errors.conflict('Der letzte aktive Admin kann nicht geändert werden.');
    }
  }

  return {
    async list(): Promise<UserDto[]> {
      return (await users.list()).map(toUserDto);
    },

    async get(id: string): Promise<UserDto> {
      const row = await users.findById(id);
      if (!row) throw errors.notFound('Benutzer nicht gefunden.');
      return toUserDto(row);
    },

    async create(input: {
      email: string;
      displayName: string;
      role: Role;
      password: string;
    }): Promise<UserDto> {
      const passwordHash = await hasher.hash(input.password);
      try {
        const row = await users.insert({
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
        });
        return toUserDto(row);
      } catch (err) {
        if (isUniqueViolation(err))
          throw errors.conflict('Diese E-Mail-Adresse ist bereits vergeben.');
        throw err;
      }
    },

    async update(
      actorId: string,
      id: string,
      patch: { displayName?: string | undefined; role?: Role | undefined },
    ): Promise<UserDto> {
      if (patch.role !== undefined && id === actorId) {
        throw errors.forbidden('Die eigene Rolle kann nicht geändert werden.');
      }
      return db.transaction(async (tx) => {
        const repo = usersRepo(tx);
        const target = await repo.findById(id);
        if (!target) throw errors.notFound('Benutzer nicht gefunden.');
        if (
          patch.role !== undefined &&
          patch.role !== target.role &&
          target.role === 'admin' &&
          !target.disabledAt
        ) {
          await assertAdminRemains(tx, id);
        }
        const row = await repo.update(id, {
          ...(patch.displayName !== undefined && { displayName: patch.displayName }),
          ...(patch.role !== undefined && { role: patch.role }),
        });
        if (!row) throw errors.notFound('Benutzer nicht gefunden.');
        return toUserDto(row);
      });
    },

    async disable(actorId: string, id: string): Promise<UserDto> {
      if (id === actorId) throw errors.forbidden('Das eigene Konto kann nicht deaktiviert werden.');
      return db.transaction(async (tx) => {
        const repo = usersRepo(tx);
        const target = await repo.findById(id);
        if (!target) throw errors.notFound('Benutzer nicht gefunden.');
        if (target.role === 'admin' && !target.disabledAt) await assertAdminRemains(tx, id);
        const row = await repo.update(id, { disabledAt: target.disabledAt ?? new Date() });
        await sessionsRepo(tx).deleteForUser(id);
        if (!row) throw errors.notFound('Benutzer nicht gefunden.');
        return toUserDto(row);
      });
    },

    async enable(id: string): Promise<UserDto> {
      const row = await users.update(id, { disabledAt: null });
      if (!row) throw errors.notFound('Benutzer nicht gefunden.');
      return toUserDto(row);
    },

    /** Admin setzt ein neues Passwort; alle Sessions des Benutzers enden. */
    async resetPassword(id: string, newPassword: string): Promise<void> {
      const passwordHash = await hasher.hash(newPassword);
      await db.transaction(async (tx) => {
        const row = await usersRepo(tx).update(id, { passwordHash });
        if (!row) throw errors.notFound('Benutzer nicht gefunden.');
        await sessionsRepo(tx).deleteForUser(id);
      });
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
