import { describe, expect, it } from 'vitest';
import { CreateUserBody, LoginBody, NewPassword, UpdateUserBody } from '../src/index.js';

describe('auth schemas', () => {
  it('normalisiert E-Mail-Adressen beim Login', () => {
    const r = LoginBody.parse({ email: '  Admin@Serend.LOCAL ', password: 'x' });
    expect(r.email).toBe('admin@serend.local');
  });

  it('lehnt ungültige E-Mail ab', () => {
    expect(LoginBody.safeParse({ email: 'kein-mail', password: 'x' }).success).toBe(false);
  });

  it('erzwingt Passwortlänge für neue Passwörter', () => {
    expect(NewPassword.safeParse('kurz').success).toBe(false);
    expect(NewPassword.safeParse('a'.repeat(12)).success).toBe(true);
    expect(NewPassword.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('lehnt unbekannte Rollen ab', () => {
    const r = CreateUserBody.safeParse({
      email: 'a@b.de',
      displayName: 'A',
      role: 'superuser',
      password: 'a'.repeat(12),
    });
    expect(r.success).toBe(false);
  });

  it('verlangt beim Update mindestens ein Feld', () => {
    expect(UpdateUserBody.safeParse({}).success).toBe(false);
    expect(UpdateUserBody.safeParse({ role: 'editor' }).success).toBe(true);
  });
});
