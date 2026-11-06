import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUsersService } from '../src/services/users.service.js';
import {
  PASSWORD,
  as,
  cheapHasher,
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

const ADMIN_ONLY: Array<[string, 'GET' | 'POST' | 'PATCH', string, unknown?]> = [
  ['Benutzer auflisten', 'GET', '/api/v1/users'],
  [
    'Benutzer anlegen',
    'POST',
    '/api/v1/users',
    { email: 'n@example.com', displayName: 'N', role: 'editor', password: 'passwort-12345' },
  ],
  ['Benutzer lesen', 'GET', '/api/v1/users/:id'],
  ['Benutzer ändern', 'PATCH', '/api/v1/users/:id', { displayName: 'X' }],
  ['Benutzer deaktivieren', 'POST', '/api/v1/users/:id/disable'],
  ['Benutzer reaktivieren', 'POST', '/api/v1/users/:id/enable'],
  [
    'Passwort zurücksetzen',
    'POST',
    '/api/v1/users/:id/reset-password',
    { newPassword: 'passwort-12345' },
  ],
];

describe('Berechtigungen', () => {
  it.each(ADMIN_ONLY)(
    '%s: ohne Session 401, als editor 403',
    async (_name, method, url, payload) => {
      const target = await createUser(t);
      const path = url.replace(':id', target.id);
      expectError(await as(t, null, method, path, payload), 401, 'unauthenticated');
      const editor = await login(t, (await createUser(t, { role: 'editor' })).email);
      expectError(await as(t, editor, method, path, payload), 403, 'forbidden');
    },
  );

  it('erlaubt dem admin die Benutzerverwaltung', async () => {
    const admin = await login(t, (await createUser(t, { role: 'admin' })).email);
    expect((await as(t, admin, 'GET', '/api/v1/users')).statusCode).toBe(200);
  });

  it('prüft die Rolle serverseitig und frisch bei jedem Request', async () => {
    const adminS = await login(t, (await createUser(t, { role: 'admin' })).email);
    const editorUser = await createUser(t, { role: 'editor' });
    const editorS = await login(t, editorUser.email);
    expectError(await as(t, editorS, 'GET', '/api/v1/users'), 403, 'forbidden');

    const promote = await as(t, adminS, 'PATCH', `/api/v1/users/${editorUser.id}`, {
      role: 'admin',
    });
    expect(promote.statusCode).toBe(200);
    expect((await as(t, editorS, 'GET', '/api/v1/users')).statusCode).toBe(200);

    await as(t, adminS, 'PATCH', `/api/v1/users/${editorUser.id}`, { role: 'editor' });
    expectError(await as(t, editorS, 'GET', '/api/v1/users'), 403, 'forbidden');
  });
});

describe('Benutzerverwaltung', () => {
  it('legt Benutzer an, gibt nur ausgewählte Felder zurück und erkennt doppelte E-Mails', async () => {
    const admin = await login(t, (await createUser(t, { role: 'admin' })).email);
    const create = await as(t, admin, 'POST', '/api/v1/users', {
      email: 'Neu@Example.com',
      displayName: 'Neu',
      role: 'editor',
      password: 'passwort-12345',
    });
    expect(create.statusCode).toBe(201);
    const user = create.json().user;
    expect(Object.keys(user).sort()).toEqual(
      ['createdAt', 'disabled', 'displayName', 'email', 'id', 'lastLoginAt', 'role'].sort(),
    );
    expect(user.email).toBe('neu@example.com');
    expect(create.body).not.toMatch(/password|argon2/i);

    const dup = await as(t, admin, 'POST', '/api/v1/users', {
      email: 'neu@example.com',
      displayName: 'Doppelt',
      role: 'editor',
      password: 'passwort-12345',
    });
    expectError(dup, 409, 'conflict');
    await login(t, 'neu@example.com', 'passwort-12345');
  });

  it('validiert Eingaben (Rolle, Passwortlänge, UUID)', async () => {
    const admin = await login(t, (await createUser(t, { role: 'admin' })).email);
    expectError(
      await as(t, admin, 'POST', '/api/v1/users', {
        email: 'a@b.de',
        displayName: 'A',
        role: 'root',
        password: 'passwort-12345',
      }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, admin, 'POST', '/api/v1/users', {
        email: 'a@b.de',
        displayName: 'A',
        role: 'editor',
        password: 'kurz',
      }),
      400,
      'validation_error',
    );
    expectError(await as(t, admin, 'GET', '/api/v1/users/keine-uuid'), 400, 'validation_error');
    expectError(
      await as(t, admin, 'GET', '/api/v1/users/0198a0a0-0000-7000-8000-000000000000'),
      404,
      'not_found',
    );
  });

  it('verbietet, die eigene Rolle zu ändern oder das eigene Konto zu deaktivieren', async () => {
    const me = await createUser(t, { role: 'admin' });
    const s = await login(t, me.email);
    expectError(
      await as(t, s, 'PATCH', `/api/v1/users/${me.id}`, { role: 'editor' }),
      403,
      'forbidden',
    );
    expectError(await as(t, s, 'POST', `/api/v1/users/${me.id}/disable`), 403, 'forbidden');
  });

  it('schützt den letzten aktiven Admin', async () => {
    const lastAdmin = await createUser(t, { role: 'admin', email: 'last-admin@example.com' });
    // Alle anderen Admins deaktivieren, damit lastAdmin der einzige aktive bleibt.
    const svc = createUsersService({ db: t.handle.db, hasher: cheapHasher });
    for (const u of await svc.list()) {
      if (u.role === 'admin' && u.id !== lastAdmin.id && !u.disabled)
        await svc.disable(lastAdmin.id, u.id);
    }
    const someoneElse = '0198a0a0-0000-7000-8000-000000000001';
    await expect(svc.update(someoneElse, lastAdmin.id, { role: 'editor' })).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(svc.disable(someoneElse, lastAdmin.id)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('beendet Sessions beim Deaktivieren und beim Zurücksetzen des Passworts', async () => {
    const admin = await login(t, (await createUser(t, { role: 'admin' })).email);

    const victim = await createUser(t, { role: 'editor' });
    const vs = await login(t, victim.email);
    expect((await as(t, vs, 'GET', '/api/v1/auth/me')).statusCode).toBe(200);
    expect((await as(t, admin, 'POST', `/api/v1/users/${victim.id}/disable`)).statusCode).toBe(200);
    expectError(await as(t, vs, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');
    expectError(
      await t.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: victim.email, password: PASSWORD },
      }),
      401,
      'invalid_credentials',
    );
    expect((await as(t, admin, 'POST', `/api/v1/users/${victim.id}/enable`)).statusCode).toBe(200);
    const vs2 = await login(t, victim.email);

    const reset = await as(t, admin, 'POST', `/api/v1/users/${victim.id}/reset-password`, {
      newPassword: 'frisches-passwort-1',
    });
    expect(reset.statusCode).toBe(200);
    expectError(await as(t, vs2, 'GET', '/api/v1/auth/me'), 401, 'unauthenticated');
    await login(t, victim.email, 'frisches-passwort-1');
  });
});
