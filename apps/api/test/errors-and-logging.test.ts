import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
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
  t = await createTestApp({ docsEnabled: true });
  t.app.get('/api/v1/boom', async () => {
    throw new Error('interne Datenbankdetails: relation "secret_table" does not exist');
  });
});
afterAll(() => t.close());

describe('Fehlerformat', () => {
  it('antwortet auf unbekannte Routen im Einheitsformat', async () => {
    expectError(await as(t, null, 'GET', '/api/v1/gibt-es-nicht'), 404, 'not_found');
  });

  it('antwortet auf kaputtes JSON mit 400 im Einheitsformat', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expectError(res, 400, 'bad_request');
  });

  it('gibt interne Fehler nie aus, loggt sie aber', async () => {
    const res = await as(t, null, 'GET', '/api/v1/boom');
    expectError(res, 500, 'internal_error');
    expect(res.body).not.toContain('secret_table');
    expect(t.logs.join('')).toContain('secret_table');
  });

  it('nennt bei Validierungsfehlern nur Feldnamen, nie Werte', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'vertraulicher-wert', password: 'x' },
    });
    expectError(res, 400, 'validation_error');
    expect(res.body).not.toContain('vertraulicher-wert');
  });
});

describe('Logging', () => {
  it('loggt niemals Passwörter, Tokens, Cookies oder CSRF-Token', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email);
    await as(t, s, 'POST', '/api/v1/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'ein-anderes-passwort-9',
    });
    await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: u.email, password: 'falsches-geheimes-passwort' },
    });
    const all = t.logs.join('');
    expect(all.length).toBeGreaterThan(0);
    for (const secret of [
      PASSWORD,
      'ein-anderes-passwort-9',
      'falsches-geheimes-passwort',
      s.token,
      s.csrf,
    ]) {
      expect(all).not.toContain(secret);
    }
    expect(all).not.toMatch(/set-cookie|"cookie"/i);
  });

  it('loggt URLs ohne Query-String', async () => {
    await as(t, null, 'GET', '/api/v1/auth/me?token=sehr-geheimes-vorschau-token');
    const all = t.logs.join('');
    expect(all).toContain('/api/v1/auth/me');
    expect(all).not.toContain('sehr-geheimes-vorschau-token');
  });
});

describe('Basis-Härtung', () => {
  it('liefert API-Antworten mit no-store und nosniff', async () => {
    const res = await as(t, null, 'GET', '/api/v1/auth/me');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('bietet einen Healthcheck unter /internal', async () => {
    const res = await as(t, null, 'GET', '/internal/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('erzeugt die OpenAPI-Doku nur unter /internal/docs', async () => {
    const res = await as(t, null, 'GET', '/internal/docs/json');
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/api/v1/auth/login', '/api/v1/users']),
    );
  });

  it('liefert ohne DOCS_ENABLED keine Doku', async () => {
    const off = await createTestApp({ docsEnabled: false });
    try {
      expectError(await as(off, null, 'GET', '/internal/docs/json'), 404, 'not_found');
    } finally {
      await off.close();
    }
  });
});
