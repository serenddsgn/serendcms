import { z } from 'zod';
import { Uuid } from './common.js';

export const ROLES = ['admin', 'editor'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128; // Obergrenze gegen Hash-DoS

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Passwort-Richtlinie für neue Passwörter (nicht beim Login). */
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`)
  .max(PASSWORD_MAX_LENGTH);

export const DisplayName = z.string().trim().min(1).max(100);

// ── Antwort-DTOs: nur explizit ausgewählte Felder ─────────────────────
export const UserDto = z.object({
  id: Uuid,
  email: z.string(),
  displayName: z.string(),
  role: Role,
  disabled: z.boolean(),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type UserDto = z.infer<typeof UserDto>;

export const SessionUserDto = UserDto.pick({
  id: true,
  email: true,
  displayName: true,
  role: true,
});
export type SessionUserDto = z.infer<typeof SessionUserDto>;

export const MeResponse = z.object({
  user: SessionUserDto,
  csrfToken: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ── Requests ──────────────────────────────────────────────────────────
export const LoginBody = z.object({
  email: Email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: NewPassword,
});

export const CreateUserBody = z.object({
  email: Email,
  displayName: DisplayName,
  role: Role,
  password: NewPassword,
});

export const UpdateUserBody = z
  .object({
    displayName: DisplayName.optional(),
    role: Role.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.role !== undefined, {
    message: 'Mindestens ein Feld angeben',
  });

export const ResetPasswordBody = z.object({ newPassword: NewPassword });

export const UserIdParams = z.object({ id: Uuid });

export const UserListResponse = z.object({ users: z.array(UserDto) });
export const UserResponse = z.object({ user: UserDto });
export const OkResponse = z.object({ ok: z.literal(true) });
