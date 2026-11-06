import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, users } from '@serend/db';
import {
  ADMIN_ORIGIN,
  PASSWORD,
  as,
  createTestApp,
  createUser,
  expectError,
  login,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('Login und Session', () => {
  it('meldet an und setzt ein HttpOnly/SameSite=Lax-Cookie', async () => {
    const u = await createUser(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: u.email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies[0]!;
    expect(cookie.name).toBe('serend_sid');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.path).toBe('/');
    expect(res.json()).toMatchObject({ user: { email: u.email, role: 'editor' } });
    expect(typeof res.json().csrfToken).toBe('string');
  });

  it('setzt in Produktion Secure und das __Host--Präfix', async () => {
    const secure = await createTestApp({ cookieSecure: true });
    try {
      const u = await createUser(secure);
      const res = await secure.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: u.email, password: PASSWORD },
      });
      const cookie = res.cookies[0]!;
      expect(cookie.name).toBe('__Host-serend_sid');
      expect(cookie.secure).toBe(true);
      expect(cookie.httpOnly).toBe(true);
    } finally {
      await secure.close();
    }
  });

  it('antwortet bei falschem Passwort und unbekannter E-Mail identisch', async () => {
    const u = await createUser(t);
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: u.email, password: 'falsches-passwort' },
    });
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'niemand@example.com', password: 'falsches-passwort' },
    });
    expectError(wrong, 401, 'invalid_credentials');
    expectError(unknown, 401, 'invalid_credentials');
    expect(wrong.body).toBe(unknown.body);
  });

  it('lehnt deaktivierte Benutzer ab', async () => {
    const u = await createUser(t);
    await t.handle.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: u.email, password: PASSWORD },
    });
    expectError(res, 401, 'invalid_credentials');
  });

  it('speichert nur den HMAC des Tokens, nie das Token', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    const rows = await t.handle.db.select().from(sessions).where(eq(sessions.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(s.token);
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(s.token);
  });

  it('speichert Passwörter als argon2id', async () => {
    const u = await createUser(t);
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('liefert /auth/me nur mit gültiger Session', async () => {
    const u = await createUser(t, { displayName: 'Erika' });
    expectError(await as(t, null, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');
    const s = await login(t, u.email);
    const res = await as(t, s, 'GET', '/api/v1/auth/me');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { id: u.id, email: u.email, displayName: 'Erika', role: 'editor' },
      csrfToken: s.csrf,
    });
  });

  it('lehnt abgelaufene Sessions ab', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    await t.handle.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, u.id));
    expectError(await as(t, s, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');
  });

  it('beendet die Session beim Logout und löscht das Cookie', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    const out = await as(t, s, 'POST', '/api/v1/auth/logout');
    expect(out.statusCode).toBe(200);
    expect(out.headers['set-cookie']).toMatch(/serend_sid=;/);
    expectError(await as(t, s, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');
  });

  it('lehnt ungültige Eingaben mit einheitlichem Fehlerformat ab', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'x' },
    });
    expectError(res, 400, 'validation_error');
    expect(res.json().error.message).toContain('email');
  });
});

describe('CSRF und Origin', () => {
  it('verlangt für schreibende Requests mit Session das CSRF-Token', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    const none = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: s.cookie },
    });
    expectError(none, 403, 'csrf_invalid');
    const wrong = await as(t, { ...s, csrf: 'falsch' }, 'POST', '/api/v1/auth/logout');
    expectError(wrong, 403, 'csrf_invalid');
    expect((await as(t, s, 'POST', '/api/v1/auth/logout')).statusCode).toBe(200);
  });

  it('verlangt das Token auch für das Passwort-Ändern', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: { cookie: s.cookie },
      payload: { currentPassword: PASSWORD, newPassword: 'neues-passwort-123' },
    });
    expectError(res, 403, 'csrf_invalid');
  });

  it('weist fremde Origins bei schreibenden Requests ab', async () => {
    const u = await createUser(t);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: u.email, password: PASSWORD },
    });
    expectError(res, 403, 'origin_invalid');
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ADMIN_ORIGIN },
      payload: { email: u.email, password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('Passwort ändern', () => {
  it('prüft das aktuelle Passwort, beendet andere Sessions und behält die aktuelle', async () => {
    const u = await createUser(t);
    const current = await login(t, u.email);
    const other = await login(t, u.email);

    const bad = await as(t, current, 'POST', '/api/v1/auth/password', {
      currentPassword: 'falsch-falsch-falsch',
      newPassword: 'neues-passwort-123',
    });
    expectError(bad, 401, 'invalid_credentials');

    const weak = await as(t, current, 'POST', '/api/v1/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'kurz',
    });
    expectError(weak, 400, 'validation_error');

    const ok = await as(t, current, 'POST', '/api/v1/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'neues-passwort-123',
    });
    expect(ok.statusCode).toBe(200);

    expect((await as(t, current, 'GET', '/api/v1/auth/me')).statusCode).toBe(200);
    expectError(await as(t, other, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');

    const oldLogin = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: u.email, password: PASSWORD },
    });
    expectError(oldLogin, 401, 'invalid_credentials');
    await login(t, u.email, 'neues-passwort-123');
  });
});

describe('Rate Limiting', () => {
  it('begrenzt Login-Versuche und nutzt das einheitliche Fehlerformat', async () => {
    const limited = await createTestApp({ rateLimit: { loginMax: 3, loginWindowMs: 60_000 } });
    try {
      const attempt = () =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'x@example.com', password: 'irgendwas' },
        });
      for (let i = 0; i < 3; i++) expectError(await attempt(), 401, 'invalid_credentials');
      const blocked = await attempt();
      expectError(blocked, 429, 'rate_limited');
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});
