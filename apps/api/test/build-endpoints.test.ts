import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siteRepo } from '../src/repositories/site.repo.js';
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

const SECRET = 'GEHEIMER-ENTWURF-9f3a';
let t: TestApp;
let ed: Session;
let adminSession: Session;

const authHeader = () => ({ authorization: `Bearer ${t.config.buildToken}` });
const get = (path: string, headers: Record<string, string> = authHeader()) =>
  t.app.inject({ method: 'GET', url: `/internal/build/${path}`, headers });

const pagesSvc = () => createPagesService({ db: t.handle.db });
const contentPage = (slug: string, title: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title,
  content: [{ id: randomUUID(), type: 'page_title', title, showCount: false }],
  seoTitle: null,
  seoDescription: null,
  ogMediaId: null,
  ...extra,
});

let published: { id: string; slug: string; coverId: string };
let draftOnly: { id: string; coverId: string };

beforeAll(async () => {
  t = await createTestApp();
  ed = await editorSession(t, 'editor');
  adminSession = await editorSession(t, 'admin');
  const actor = adminSession.userId;

  // veröffentlichtes Projekt mit späterem Entwurf
  const coverId = await createMedia(t, ed);
  const p = await createProject(t, ed, { title: 'Live-Projekt', coverMediaId: coverId });
  await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/publish`);
  const draftCover = await createMedia(t, ed);
  await as(
    t,
    ed,
    'PUT',
    `/api/v1/projects/${p.project.id}/draft`,
    draftBody(p as never, { title: SECRET, coverMediaId: draftCover }),
  );
  published = { id: p.project.id, slug: p.latest.slug, coverId };

  // nur Entwurf, archiviert, unveröffentlicht
  const dCover = await createMedia(t, ed);
  const d = await createProject(t, ed, { title: `${SECRET} nur Entwurf`, coverMediaId: dCover });
  draftOnly = { id: d.project.id, coverId: dCover };
  const arCover = await createMedia(t, ed);
  const ar = await createProject(t, ed, { title: `${SECRET} archiviert`, coverMediaId: arCover });
  await as(t, ed, 'POST', `/api/v1/projects/${ar.project.id}/publish`);
  await as(t, ed, 'POST', `/api/v1/projects/${ar.project.id}/archive`);
  const unCover = await createMedia(t, ed);
  const un = await createProject(t, ed, {
    title: `${SECRET} unveröffentlicht`,
    coverMediaId: unCover,
  });
  await as(t, ed, 'POST', `/api/v1/projects/${un.project.id}/publish`);
  await as(t, ed, 'POST', `/api/v1/projects/${un.project.id}/unpublish`);

  // Seiten: veröffentlicht (mit Entwurf) und nur Entwurf
  const pages = pagesSvc();
  const live = await pages.create(actor, {
    locale: 'de',
    systemKey: null,
    ...contentPage('ueber-uns', 'Über uns'),
  });
  await pages.publish(live.page.id);
  await pages.saveDraft(actor, live.page.id, {
    ...contentPage('ueber-uns', SECRET),
    expectedRevisionNo: 1,
  });
  const hidden = await pages.create(actor, {
    locale: 'de',
    systemKey: null,
    ...contentPage('verborgen', `${SECRET} Seite`),
  });

  // Leistungen, Navigation, Einstellungen
  const site = siteRepo(t.handle.db);
  await site.insertService({
    locale: 'de',
    key: 'web',
    name: 'Webdesign',
    description: 'Live',
    sortOrder: 0,
    status: 'published',
  });
  await site.insertService({
    locale: 'de',
    key: 'shop',
    name: SECRET,
    description: 'Entwurf',
    sortOrder: 1,
    status: 'draft',
  });
  await site.insertNavigationItem({
    locale: 'de',
    location: 'header',
    label: 'Über uns',
    pageId: live.page.id,
    sortOrder: 0,
    status: 'published',
  });
  await site.insertNavigationItem({
    locale: 'de',
    location: 'header',
    label: `${SECRET} Nav`,
    pageId: hidden.page.id,
    sortOrder: 1,
    status: 'published',
  });
  await site.insertNavigationItem({
    locale: 'de',
    location: 'footer',
    label: `${SECRET} Entwurf`,
    url: 'https://example.com',
    sortOrder: 2,
    status: 'draft',
  });
  await site.insertNavigationItem({
    locale: 'de',
    location: 'footer',
    label: 'Extern',
    url: 'https://example.com',
    sortOrder: 3,
    status: 'published',
  });
  await site.upsertSetting('site.identity', 'de', {
    name: 'serend.design',
    city: 'Wuppertal',
    email: 'hallo@serend.design',
  });
});
afterAll(() => t.close());

describe('Zugriffsschutz', () => {
  it('verlangt das Build-Token', async () => {
    expectError(await get('projects', {}), 401, 'unauthenticated');
    expectError(
      await get('projects', { authorization: 'Bearer falsches-token' }),
      401,
      'unauthenticated',
    );
    expectError(
      await get('projects', { authorization: t.config.buildToken }),
      401,
      'unauthenticated',
    );
  });

  it('akzeptiert keine Admin-Session statt des Tokens', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/internal/build/projects',
      headers: { cookie: adminSession.cookie },
    });
    expectError(res, 401, 'unauthenticated');
  });

  it('weist Anfragen über einen Proxy ab, auch mit gültigem Token', async () => {
    expectError(
      await get('projects', { ...authHeader(), 'x-forwarded-for': '203.0.113.7' }),
      403,
      'forbidden',
    );
  });

  it('ist nicht unter /api/v1 erreichbar (keine öffentliche Content-API)', async () => {
    for (const path of ['/api/v1/build/projects', '/api/v1/public/projects', '/api/v1/content']) {
      expectError(
        await t.app.inject({ method: 'GET', url: path, headers: authHeader() }),
        404,
        'not_found',
      );
    }
  });
});

describe('Entwürfe erscheinen nie in /internal/build', () => {
  const endpoints = [
    'projects',
    'pages',
    'services',
    'navigation',
    'settings',
    'media',
    'redirects',
    'manifest',
  ];

  it.each(endpoints)('%s enthält keinen Entwurfsinhalt', async (name) => {
    const res = await get(name);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(SECRET);
  });

  it('liefert Projekte nur über die veröffentlichte Revision', async () => {
    const projects = (await get('projects')).json();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: published.id,
      revision: { title: 'Live-Projekt', coverMediaId: published.coverId },
    });
  });

  it('liefert Seiten nur über die veröffentlichte Revision', async () => {
    const pages = (await get('pages')).json();
    expect(pages).toHaveLength(1);
    expect(pages[0].revision).toMatchObject({ slug: 'ueber-uns', title: 'Über uns' });
  });

  it('liefert nur veröffentlichte Leistungen und Navigation (nur mit veröffentlichter Zielseite)', async () => {
    expect((await get('services')).json().map((s: { name: string }) => s.name)).toEqual([
      'Webdesign',
    ]);
    expect(
      (await get('navigation'))
        .json()
        .map((n: { label: string }) => n.label)
        .sort(),
    ).toEqual(['Extern', 'Über uns']);
  });

  it('liefert nur Medien veröffentlichter Inhalte, auch als Datei', async () => {
    const media = (await get('media')).json() as { id: string }[];
    expect(media.map((m) => m.id)).toEqual([published.coverId]);
    expect((await get(`media/${published.coverId}/file`)).statusCode).toBe(200);
    expectError(await get(`media/${draftOnly.coverId}/file`), 404, 'not_found');
  });

  it('endet ein Entwurfs-Medium nach Veröffentlichung nicht vorzeitig im Build', async () => {
    // Entwurf der Revision 2 wird nicht gebaut, bis er veröffentlicht ist
    const before = ((await get('media')).json() as { id: string }[]).length;
    const detail = (await as(t, ed, 'GET', `/api/v1/projects/${published.id}`)).json();
    expect(detail.latest.title).toBe(SECRET);
    await as(t, ed, 'POST', `/api/v1/projects/${published.id}/publish`);
    const after = (await get('projects')).json();
    expect(after[0].revision.title).toBe(SECRET);
    expect(((await get('media')).json() as { id: string }[]).length).toBe(before); // altes Cover nicht mehr, neues da
  });
});

describe('Inhalt und Form', () => {
  it('validiert Einstellungen und liefert nur explizite Felder', async () => {
    const settings = (await get('settings')).json();
    expect(settings).toEqual([
      {
        key: 'site.identity',
        locale: 'de',
        value: { name: 'serend.design', city: 'Wuppertal', email: 'hallo@serend.design' },
      },
    ]);
  });

  it('liefert Redirects und ein Manifest mit Zählern', async () => {
    const man = (await get('manifest')).json();
    expect(man.counts).toMatchObject({ projects: 1, pages: 1, services: 1 });
    expect(man.projectRevisionIds).toHaveLength(1);
  });
});
