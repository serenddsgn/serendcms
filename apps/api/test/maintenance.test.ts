import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPreviewToken } from '../src/lib/preview-token.js';
import { signPassToken, verifyPassToken } from '../src/lib/pass-token.js';
import {
  as,
  createMedia,
  createTestApp,
  editorSession,
  expectError,
  type Session,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let ed: Session;
let admin: Session;
const dir = () => t.config.maintenance.dir;
const body = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  headlineDe: 'Wir überarbeiten unsere [[Webseite]]',
  headlineEn: 'We are reworking our [[website]]',
  logoMediaId: null,
  ...over,
});
const put = (s: Session, payload: unknown) => as(t, s, 'PUT', '/api/v1/maintenance', payload);
const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!;
const cookieHeader = (res: { cookies: { name: string; value: string }[] }) =>
  `${res.cookies[0]!.name}=${res.cookies[0]!.value}`;

beforeAll(async () => {
  t = await createTestApp();
  ed = await editorSession(t, 'editor');
  admin = await editorSession(t, 'admin');
});
afterAll(() => t.close());

describe('Wartungsmodus ein- und ausschalten', () => {
  it('ist standardmäßig aus; lesen dürfen editor und admin', async () => {
    expectError(await as(t, null, 'GET', '/api/v1/maintenance'), 401, 'unauthenticated');
    const res = await as(t, ed, 'GET', '/api/v1/maintenance');
    expect(res.json().maintenance).toMatchObject({
      enabled: false,
      headlineDe: 'Wir überarbeiten unsere [[Webseite]]',
      logoMediaId: null,
    });
    expect(existsSync(join(dir(), 'on'))).toBe(false);
  });

  it('erlaubt nur dem admin das Umschalten', async () => {
    expectError(await put(ed, body()), 403, 'forbidden');
    expect(existsSync(join(dir(), 'on'))).toBe(false);
  });

  it('schreibt beim Einschalten Wartungsseite, Schriften und Flag; beim Ausschalten fällt nur das Flag weg', async () => {
    const on = await put(admin, body());
    expect(on.statusCode).toBe(200);
    expect(on.json().maintenance.enabled).toBe(true);
    expect(existsSync(join(dir(), 'on'))).toBe(true);
    const html = readFileSync(join(dir(), 'maintenance.html'), 'utf8');
    expect(html).toContain('Wir überarbeiten unsere <span class="liquid">Webseite</span>');
    expect(html).toContain('We are reworking our');
    expect(html).toContain('noindex');
    expect(existsSync(join(dir(), 'fonts', 'plus-jakarta-sans-latin.woff2'))).toBe(true);
    expect(existsSync(join(dir(), 'fonts', 'codec-pro-extrabold.woff2'))).toBe(true);

    expect((await put(admin, body({ enabled: false }))).json().maintenance.enabled).toBe(false);
    expect(existsSync(join(dir(), 'on'))).toBe(false);
    expect(existsSync(join(dir(), 'maintenance.html'))).toBe(true);
  });

  it('erzeugt eine eigenständige Seite: keine Skripte, keine externen Quellen, Text wird escaped', async () => {
    await put(
      admin,
      body({
        headlineDe: '<script>alert(1)</script> [[Wartung]] & "mehr"',
        headlineEn: '<img src=x onerror=alert(1)>',
      }),
    );
    const html = readFileSync(join(dir(), 'maintenance.html'), 'utf8');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<span class="liquid">Wartung</span> &amp; &quot;mehr&quot;');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+=/i); // kein Ereignis-Attribut in einem echten Tag
  });

  it('validiert die Eingabe', async () => {
    for (const over of [
      { headlineDe: '' },
      { headlineEn: 'x'.repeat(121) },
      { enabled: 'ja' },
      { logoMediaId: 'keine-uuid' },
    ]) {
      expectError(await put(admin, body(over)), 400, 'validation_error');
    }
    expectError(
      await put(admin, body({ logoMediaId: '0198a0a0-0000-7000-8000-000000000000' })),
      400,
      'validation_error',
    );
  });

  it('übernimmt ein Logo (als WebP für die Seite) und schützt es vor dem Löschen', async () => {
    const logo = await createMedia(t, ed);
    expect((await put(admin, body({ logoMediaId: logo }))).statusCode).toBe(200);
    expect(existsSync(join(dir(), 'logo.webp'))).toBe(true);
    expect(readFileSync(join(dir(), 'maintenance.html'), 'utf8')).toContain(
      '/maintenance-assets/logo.webp',
    );
    expectError(await as(t, ed, 'DELETE', `/api/v1/media/${logo}`), 409, 'conflict');
    await put(admin, body({ logoMediaId: null }));
    expect(existsSync(join(dir(), 'logo.webp'))).toBe(false);
    expect((await as(t, ed, 'DELETE', `/api/v1/media/${logo}`)).statusCode).toBe(200);
  });

  it('stellt Dateien beim Start wieder her (Zustand steht in der Datenbank)', async () => {
    await put(admin, body());
    const again = await createTestApp({
      maintenance: { dir: t.config.maintenance.dir, fontsDir: t.config.maintenance.fontsDir },
    });
    await again.close();
    // zweite App mit leerer Datenbank: Flag darf dort nicht „on“ bleiben
    const fresh = await createTestApp();
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(join(fresh.config.maintenance.dir, 'on'))).toBe(false);
    await fresh.close();
  });
});

describe('Zugang für eingeloggte Redakteure', () => {
  it('erzeugt einen Einmal-Link nur für angemeldete Nutzer', async () => {
    expectError(await as(t, null, 'POST', '/api/v1/maintenance/pass'), 401, 'unauthenticated');
    const res = await as(t, ed, 'POST', '/api/v1/maintenance/pass');
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toMatch(/^https:\/\/www\.example\.com\/__maintenance\/enter\?token=/);
    expect(new Date(res.json().expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(
      5 * 60 * 1000,
    );
  });

  it('tauscht den Link gegen ein HttpOnly-Cookie, das Caddy über /internal prüfen lässt', async () => {
    const token = tokenFrom((await as(t, ed, 'POST', '/api/v1/maintenance/pass')).json().url);
    const enter = await t.app.inject({
      method: 'GET',
      url: `/api/v1/public/maintenance/enter?token=${token}`,
    });
    expect(enter.statusCode).toBe(302);
    expect(enter.headers.location).toBe('/');
    const c = enter.cookies[0]!;
    expect(c).toMatchObject({ name: 'serend_pass', httpOnly: true, sameSite: 'Lax', path: '/' });

    const ok = await t.app.inject({
      method: 'GET',
      url: '/internal/maintenance/check',
      headers: { cookie: cookieHeader(enter) },
    });
    expect(ok.statusCode).toBe(204);
    expect(
      (await t.app.inject({ method: 'GET', url: '/internal/maintenance/check' })).statusCode,
    ).toBe(401);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: '/internal/maintenance/check',
          headers: { cookie: 'serend_pass=murks' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('akzeptiert keine falschen, abgelaufenen oder artfremden Token', async () => {
    const enter = (token: string) =>
      t.app.inject({ method: 'GET', url: `/api/v1/public/maintenance/enter?token=${token}` });
    expectError(await enter('murks-murks-murks'), 403, 'forbidden');
    const expired = signPassToken(
      t.config.previewSigningKey,
      'enter',
      Date.now() - 6 * 60 * 1000,
    ).token;
    expectError(await enter(expired), 403, 'forbidden');
    const foreign = signPassToken('fremder-schluessel'.padEnd(50, 'f'), 'enter').token;
    expectError(await enter(foreign), 403, 'forbidden');
    // Vorschau-Token und Cookie-Token sind keine Einmal-Links
    expectError(
      await enter(signPreviewToken(t.config.previewSigningKey, { k: 'project', id: 'x' }).token),
      403,
      'forbidden',
    );
    expectError(
      await enter(signPassToken(t.config.previewSigningKey, 'pass').token),
      403,
      'forbidden',
    );
  });

  it('lässt den Einmal-Link nicht als Cookie gelten und das Cookie nicht als Einmal-Link', async () => {
    const key = t.config.previewSigningKey;
    const enterTok = signPassToken(key, 'enter').token;
    const passTok = signPassToken(key, 'pass').token;
    expect(verifyPassToken(key, 'pass', enterTok)).toBe(false);
    expect(verifyPassToken(key, 'enter', passTok)).toBe(false);
    const res = await t.app.inject({
      method: 'GET',
      url: '/internal/maintenance/check',
      headers: { cookie: `serend_pass=${enterTok}` },
    });
    expect(res.statusCode).toBe(401);
    // abgelaufenes Cookie
    const old = signPassToken(key, 'pass', Date.now() - 9 * 3600 * 1000).token;
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: '/internal/maintenance/check',
          headers: { cookie: `serend_pass=${old}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('nutzt in Produktion das __Host--Präfix mit Secure', async () => {
    const secure = await createTestApp({ cookieSecure: true });
    try {
      const token = signPassToken(secure.config.previewSigningKey, 'enter').token;
      const res = await secure.app.inject({
        method: 'GET',
        url: `/api/v1/public/maintenance/enter?token=${token}`,
      });
      expect(res.cookies[0]).toMatchObject({
        name: '__Host-serend_pass',
        secure: true,
        httpOnly: true,
      });
    } finally {
      await secure.close();
    }
  });

  it('loggt keine Token', async () => {
    const token = tokenFrom((await as(t, ed, 'POST', '/api/v1/maintenance/pass')).json().url);
    await t.app.inject({ method: 'GET', url: `/api/v1/public/maintenance/enter?token=${token}` });
    expect(t.logs.join('')).not.toContain(token);
  });
});
