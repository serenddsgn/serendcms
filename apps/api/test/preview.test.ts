import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPreviewToken, verifyPreviewToken } from '../src/lib/preview-token.js';
import { createPagesService } from '../src/services/pages.service.js';
import {
  as,
  createMedia,
  createProject,
  createTestApp,
  draftBody,
  editorSession,
  expectError,
  type Session,
  type TestApp,
} from './helpers.js';

const KEY = 'preview-schluessel-'.padEnd(50, 'k');
const NOW = 1_800_000_000_000;

describe('Vorschau-Token', () => {
  it('signiert, prüft und begrenzt die Lebensdauer auf 15 Minuten', () => {
    const { token, expiresAt } = signPreviewToken(KEY, { k: 'project', id: 'p1' }, NOW, 3600);
    expect(expiresAt.getTime() - NOW).toBe(15 * 60 * 1000); // Obergrenze trotz 1 Stunde angefordert
    expect(verifyPreviewToken(KEY, token, NOW + 60_000)).toMatchObject({ k: 'project', id: 'p1' });
  });

  it('lehnt abgelaufene, manipulierte, fremd signierte und kaputte Token ab', () => {
    const { token } = signPreviewToken(KEY, { k: 'page', id: 'x' }, NOW);
    expect(verifyPreviewToken(KEY, token, NOW + 15 * 60 * 1000)).toBeNull(); // genau abgelaufen
    expect(verifyPreviewToken('anderer-schluessel'.padEnd(50, 'z'), token, NOW)).toBeNull();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ k: 'page', id: 'x', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(verifyPreviewToken(KEY, `${forged}.${sig}`, NOW)).toBeNull(); // Payload ausgetauscht
    expect(verifyPreviewToken(KEY, `${body}.${sig}x`, NOW)).toBeNull();
    for (const bad of ['', 'abc', 'a.b.c', '.', `${body}.`])
      expect(verifyPreviewToken(KEY, bad, NOW)).toBeNull();
  });

  it('lehnt Token mit überlanger Gültigkeit ab, auch wenn sie korrekt signiert sind', async () => {
    const { createHmac } = await import('node:crypto');
    const body = Buffer.from(
      JSON.stringify({ k: 'project', id: 'p', iat: 1_800_000_000, exp: 1_800_000_000 + 7200 }),
    ).toString('base64url');
    const sig = createHmac('sha256', KEY).update(body).digest('base64url');
    expect(verifyPreviewToken(KEY, `${body}.${sig}`, NOW)).toBeNull();
  });
});

describe('Vorschau über die API', () => {
  let t: TestApp;
  let ed: Session;
  const SECRET = 'ENTWURFS-TITEL-4711';
  let liveId: string;
  let draftOnlyId: string;
  let otherDraftId: string;

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const tokenFrom = (url: string) => new URL(url).searchParams.get('preview')!;
  const bundle = (token: string, headers: Record<string, string> = {}) =>
    t.app.inject({
      method: 'GET',
      url: '/internal/preview/bundle',
      headers: { ...bearer(token), ...headers },
    });

  beforeAll(async () => {
    t = await createTestApp();
    ed = await editorSession(t);
    const cover = await createMedia(t, ed);
    const live = await createProject(t, ed, { title: 'Live', coverMediaId: cover });
    await as(t, ed, 'POST', `/api/v1/projects/${live.project.id}/publish`);
    await as(
      t,
      ed,
      'PUT',
      `/api/v1/projects/${live.project.id}/draft`,
      draftBody(live as never, { title: SECRET }),
    );
    liveId = live.project.id;
    draftOnlyId = (
      await createProject(t, ed, { title: `${SECRET} nur Entwurf`, coverMediaId: cover })
    ).project.id;
    otherDraftId = (
      await createProject(t, ed, { title: 'Anderer Entwurf XYZ', coverMediaId: cover })
    ).project.id;
  });
  afterAll(() => t.close());

  it('erzeugt signierte Links für Projekte und Seiten (nur für angemeldete Nutzer)', async () => {
    expectError(
      await as(t, null, 'POST', `/api/v1/projects/${liveId}/preview-link`),
      401,
      'unauthenticated',
    );
    const res = await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`);
    expect(res.statusCode).toBe(200);
    const { url, expiresAt } = res.json();
    expect(url).toMatch(/^https:\/\/preview\.example\.com\/projekte\/[a-z0-9-]+\/\?preview=/);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(verifyPreviewToken(t.config.previewSigningKey, tokenFrom(url))).toMatchObject({
      k: 'project',
      id: liveId,
    });
    expectError(
      await as(t, ed, 'POST', `/api/v1/projects/${randomUUID()}/preview-link`),
      404,
      'not_found',
    );
  });

  it('liefert im Vorschau-Paket die neueste Revision des betrachteten Projekts', async () => {
    const { url } = (await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`)).json();
    const res = await bundle(tokenFrom(url));
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.target).toEqual({ kind: 'project', id: liveId });
    expect(b.projects.find((p: { id: string }) => p.id === liveId).revision.title).toBe(SECRET);
    // andere Entwürfe bleiben verborgen
    expect(res.body).not.toContain('Anderer Entwurf XYZ');
    expect(res.body).not.toContain('nur Entwurf');
  });

  it('zeigt ein noch nicht veröffentlichtes Projekt nur mit seinem eigenen Token', async () => {
    const own = tokenFrom(
      (await as(t, ed, 'POST', `/api/v1/projects/${draftOnlyId}/preview-link`)).json().url,
    );
    expect((await bundle(own)).body).toContain(`${SECRET} nur Entwurf`);
    const other = tokenFrom(
      (await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`)).json().url,
    );
    expect((await bundle(other)).body).not.toContain('nur Entwurf');
    expect(otherDraftId).toBeTruthy();
  });

  it('liefert Medien des Entwurfs nur über das Vorschau-Token', async () => {
    const newCover = await createMedia(t, ed);
    const p = (await as(t, ed, 'GET', `/api/v1/projects/${liveId}`)).json();
    await as(
      t,
      ed,
      'PUT',
      `/api/v1/projects/${liveId}/draft`,
      draftBody(p, { coverMediaId: newCover }),
    );
    const token = tokenFrom(
      (await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`)).json().url,
    );
    const file = await t.app.inject({
      method: 'GET',
      url: `/internal/preview/media/${newCover}/file`,
      headers: bearer(token),
    });
    expect(file.statusCode).toBe(200);
    // im Build-Endpunkt ist dasselbe Medium nicht erreichbar (nicht veröffentlicht)
    const viaBuild = await t.app.inject({
      method: 'GET',
      url: `/internal/build/media/${newCover}/file`,
      headers: bearer(t.config.buildToken),
    });
    expectError(viaBuild, 404, 'not_found');
    // fremdes, nicht referenziertes Medium: auch mit Token nicht
    const unrelated = await createMedia(t, ed);
    expectError(
      await t.app.inject({
        method: 'GET',
        url: `/internal/preview/media/${unrelated}/file`,
        headers: bearer(token),
      }),
      404,
      'not_found',
    );
  });

  it('weist ungültige, abgelaufene und fremde Token ab und akzeptiert keine Proxy-Anfragen', async () => {
    const good = tokenFrom(
      (await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`)).json().url,
    );
    expectError(await bundle('murks'), 401, 'unauthenticated');
    expectError(
      await t.app.inject({ method: 'GET', url: '/internal/preview/bundle' }),
      401,
      'unauthenticated',
    );
    const expired = signPreviewToken(
      t.config.previewSigningKey,
      { k: 'project', id: liveId },
      Date.now() - 16 * 60 * 1000,
    ).token;
    expectError(await bundle(expired), 401, 'unauthenticated');
    const foreign = signPreviewToken('fremder-schluessel'.padEnd(50, 'f'), {
      k: 'project',
      id: liveId,
    }).token;
    expectError(await bundle(foreign), 401, 'unauthenticated');
    expectError(await bundle(good, { 'x-forwarded-for': '203.0.113.9' }), 403, 'forbidden');
    // Build-Token ist kein Vorschau-Token und umgekehrt
    expectError(await bundle(t.config.buildToken), 401, 'unauthenticated');
    expectError(
      await t.app.inject({ method: 'GET', url: '/internal/build/projects', headers: bearer(good) }),
      401,
      'unauthenticated',
    );
  });

  it('loggt keine Vorschau-Token (Query-Strings werden nicht protokolliert)', async () => {
    const link = (await as(t, ed, 'POST', `/api/v1/projects/${liveId}/preview-link`)).json()
      .url as string;
    const token = tokenFrom(link);
    await t.app.inject({ method: 'GET', url: `/projekte/x/?preview=${token}` });
    await bundle(token);
    expect(t.logs.join('')).not.toContain(token);
  });

  it('erzeugt Seiten-Vorschau für Inhaltsseiten', async () => {
    const pages = createPagesService({ db: t.handle.db });
    const page = await pages.create(ed.userId, {
      locale: 'de',
      systemKey: null,
      slug: 'vorschau-seite',
      title: SECRET,
      content: [{ id: randomUUID(), type: 'page_title', title: SECRET, showCount: false }],
      seoTitle: null,
      seoDescription: null,
      ogMediaId: null,
    });
    const res = await as(t, ed, 'POST', `/api/v1/pages/${page.page.id}/preview-link`);
    expect(res.json().url).toContain('/vorschau-seite/?preview=');
    const b = (await bundle(tokenFrom(res.json().url))).json();
    expect(b.pages.find((p: { id: string }) => p.id === page.page.id).revision.title).toBe(SECRET);
  });
});
