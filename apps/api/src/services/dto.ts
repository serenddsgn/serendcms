import type { UserRow } from '@serend/db';
import type { Role, UserDto } from '@serend/schema';

/** Explizite Feldauswahl: nie ganze DB-Zeilen (insbesondere kein passwordHash) ausgeben. */
export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as Role,
    disabled: row.disabledAt !== null,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}
