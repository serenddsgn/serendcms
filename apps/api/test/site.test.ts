import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPagesService } from '../src/services/pages.service.js';
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
const enqueued: string[] = [];
/** Wartende Builds abschließen, damit der nächste Auslöser wieder einen neuen Build einreiht (sonst verschmilzt er). */
const drain = () =>
  t.handle.pool.query("update builds set status = 'succeeded' where status = 'queued'");

beforeAll(async () => {
  t = await createTestApp({}, { queue: { enqueue: async (id) => void enqueued.push(id) } });
  ed = await editorSession(t, 'editor');
  admin = await editorSession(t, 'admin');
});
afterAll(() => t.close());

const newPage = (slug: string, locale: 'de' | 'en' = 'de') =>
  createPagesService({ db: t.handle.db }).create(admin.userId, {
    locale,
    systemKey: null,
    slug,
    title: slug,
    content: [{ id: randomUUID(), type: 'page_title', title: slug, showCount: false }],
    seoTitle: null,
    seoDescription: null,
    ogMediaId: null,
  });

describe('Seiten', () => {
  const body = (slug: string, extra: Record<string, unknown> = {}) => ({
    locale: 'de',
    slug,
    title: 'Impressum',
    content: [
      { id: randomUUID(), type: 'page_title', title: 'Impressum', showCount: false },
      {
        id: randomUUID(),
        type: 'richtext',
        nodes: [{ kind: 'paragraph', runs: [{ text: 'Angaben gemäß § 5 DDG' }] }],
      },
    ],
    ...extra,
  });

  it('verlangt Anmeldung; editor darf anlegen, bearbeiten und veröffentlichen', async () => {
    expectError(await as(t, null, 'GET', '/api/v1/pages'), 401, 'unauthenticated');
    const created = await as(t, ed, 'POST', '/api/v1/pages', body('impressum-test'));
    expect(created.statusCode).toBe(201);
    const id = created.json().page.id;
    expect(created.json().page).toMatchObject({ systemKey: null, status: 'draft' });
    const saved = await as(t, ed, 'PUT', `/api/v1/pages/${id}/draft`, {
      ...body('impressum-test'),
      title: 'Impressum neu',
    });
    expect(saved.json().latest.title).toBe('Impressum neu');
    expect((await as(t, ed, 'POST', `/api/v1/pages/${id}/publish`)).json().page).toMatchObject({
      status: 'published',
    });
  });

  it('legt über die API nie Systemseiten an', async () => {
    const res = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('systemversuch', { systemKey: 'home' }),
    );
    expect(res.json().page.systemKey).toBeNull();
  });

  it('lehnt doppelte Slugs pro Sprache ab, erlaubt sie in anderer Sprache', async () => {
    await as(t, ed, 'POST', '/api/v1/pages', body('doppelt'));
    expectError(await as(t, ed, 'POST', '/api/v1/pages', body('doppelt')), 409, 'conflict');
    expect(
      (await as(t, ed, 'POST', '/api/v1/pages', body('doppelt', { locale: 'en' }))).statusCode,
    ).toBe(201);
  });

  it('legt Sprachversionen als Kopie an', async () => {
    const photo = await createMedia(t, ed);
    const source = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('uebersetzen', {
        content: [
          { id: randomUUID(), type: 'page_title', title: 'Quelle', showCount: false },
          { id: randomUUID(), type: 'image', mediaId: photo, size: 'full', caption: 'Studio' },
        ],
      }),
    );
    const src = source.json();
    const res = await as(t, ed, 'POST', `/api/v1/pages/${src.page.id}/translations`, {
      locale: 'en',
    });
    expect(res.statusCode).toBe(201);
    const en = res.json();
    expect(en.page).toMatchObject({
      locale: 'en',
      translationGroupId: src.page.translationGroupId,
      status: 'draft',
    });
    expect(en.latest.slug).toBe('uebersetzen');
    expect(en.latest.content).toEqual(src.latest.content);
    // eigener Slug für die Zielsprache möglich; doppelte Version und eigene Sprache sind Konflikte
    for (const locale of ['en', 'de'])
      expectError(
        await as(t, ed, 'POST', `/api/v1/pages/${src.page.id}/translations`, { locale }),
        409,
        'conflict',
      );
    expectError(
      await as(t, ed, 'POST', '/api/v1/pages/00000000-0000-4000-8000-000000000000/translations', {
        locale: 'en',
      }),
      404,
      'not_found',
    );
  });

  it('verknüpft unabhängig angelegte DE- und EN-Seiten und löst die Verknüpfung wieder', async () => {
    const de = await newPage('verknuepfen-de', 'de');
    const en = await newPage('verknuepfen-en', 'en');
    expect(de.page.translationGroupId).not.toBe(en.page.translationGroupId);
    const link = (id: string, targetId: string) =>
      as(t, ed, 'PUT', `/api/v1/pages/${id}/translation-link`, { targetId });

    const de2 = await newPage('verknuepfen-de2', 'de');
    expectError(await link(de.page.id, de2.page.id), 409, 'conflict');
    expectError(await link(de.page.id, de.page.id), 409, 'conflict');
    expectError(await link(de.page.id, randomUUID()), 404, 'not_found');

    expect((await link(de.page.id, en.page.id)).statusCode).toBe(200);
    const enList = (await as(t, ed, 'GET', '/api/v1/pages?locale=en')).json().pages as {
      id: string;
      translationGroupId: string;
    }[];
    expect(enList.find((p) => p.id === en.page.id)?.translationGroupId).toBe(
      de.page.translationGroupId,
    );

    // belegt: weder als Quelle noch als Ziel erneut verknüpfbar
    const en2 = await newPage('verknuepfen-en2', 'en');
    expectError(await link(de.page.id, en2.page.id), 409, 'conflict');
    expectError(await link(de2.page.id, en.page.id), 409, 'conflict');

    // Systemseite nur mit gleichem Seitentyp
    const pages = (await as(t, ed, 'GET', '/api/v1/pages')).json().pages as {
      id: string;
      systemKey: string | null;
      locale: string;
      translationGroupId: string;
    }[];
    const home = pages.find((p) => p.systemKey === 'home' && p.locale === 'de');
    if (home) expectError(await link(de2.page.id, home.id), 409, 'conflict');

    expectError(
      await as(t, ed, 'DELETE', `/api/v1/pages/${de2.page.id}/translation-link`),
      409,
      'conflict',
    );
    const unlinked = await as(t, ed, 'DELETE', `/api/v1/pages/${en.page.id}/translation-link`);
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json().page.translationGroupId).not.toBe(de.page.translationGroupId);
    expect((await link(en.page.id, de.page.id)).statusCode).toBe(200);
  });

  it('kopiert Systemseiten mit festem Slug und biegt Links auf die Zielsprache um', async () => {
    const svc = createPagesService({ db: t.handle.db });
    const mk = (
      locale: 'de' | 'en',
      systemKey: 'home' | 'projects',
      slug: string,
      content: unknown[],
    ) =>
      svc.create(admin.userId, {
        locale,
        systemKey,
        slug,
        title: slug,
        content,
        seoTitle: null,
        seoDescription: null,
        ogMediaId: null,
      });
    const photo = await createMedia(t, admin);
    // DE-Projektübersicht, die erst später übersetzt wird
    const deProjects = await mk('de', 'projects', 'projekte', [
      { id: randomUUID(), type: 'page_title', title: 'Projekte', showCount: true },
      { id: randomUUID(), type: 'project_index', defaultView: 'grid' },
    ]);
    const link = (pageId: string) => ({
      label: 'Alle Projekte',
      target: { kind: 'page', pageId },
    });
    const deHome = await mk('de', 'home', 'home', [
      {
        id: randomUUID(),
        type: 'hero',
        eyebrow: 'e',
        headline: [[{ text: 'Hallo' }]],
        intro: 'i',
        link: link(deProjects.page.id),
      },
      {
        id: randomUUID(),
        type: 'featured_projects',
        label: 'l',
        allProjectsLink: link(deProjects.page.id),
        limit: 3,
      },
      { id: randomUUID(), type: 'services_overview', eyebrow: 'e', title: [{ text: 't' }] },
      {
        id: randomUUID(),
        type: 'media_text_card',
        mediaId: photo,
        eyebrow: 'e',
        heading: [{ text: 'h' }],
        text: 't',
      },
      { id: randomUUID(), type: 'contact_cta', eyebrow: 'e', line1: 'a', line2: 'b' },
    ]);

    // Solange die Projektübersicht keine EN-Version hat, bricht die Kopie mit klarer Meldung ab
    const blocked = await as(t, ed, 'POST', `/api/v1/pages/${deHome.page.id}/translations`, {
      locale: 'en',
    });
    expectError(blocked, 409, 'conflict');
    expect(blocked.json().message ?? blocked.body).toContain('projekte');

    const enProjects = (
      await as(t, ed, 'POST', `/api/v1/pages/${deProjects.page.id}/translations`, {
        locale: 'en',
        slug: 'ignoriert',
      })
    ).json();
    expect(enProjects.latest.slug).toBe('work'); // Slug der Systemseite ist fest

    const res = await as(t, ed, 'POST', `/api/v1/pages/${deHome.page.id}/translations`, {
      locale: 'en',
    });
    expect(res.statusCode).toBe(201);
    const en = res.json();
    expect(en.page).toMatchObject({ locale: 'en', systemKey: 'home' });
    expect(en.latest.slug).toBe('home');
    expect(en.latest.content[0].link.target.pageId).toBe(enProjects.page.id);
    expect(en.latest.content[1].allProjectsLink.target.pageId).toBe(enProjects.page.id);
    // die Vorlage bleibt unverändert
    const stillDe = (await as(t, ed, 'GET', `/api/v1/pages/${deHome.page.id}`)).json();
    expect(stillDe.latest.content[0].link.target.pageId).toBe(deProjects.page.id);
  });

  it('validiert den Inhalt je Seitentyp und die Link-Ziele', async () => {
    expectError(
      await as(
        t,
        ed,
        'POST',
        '/api/v1/pages',
        body('x1', { content: [{ id: randomUUID(), type: 'hero' }] }),
      ),
      400,
      'validation_error',
    );
    const badHref = body('x2', {
      content: [
        {
          id: randomUUID(),
          type: 'richtext',
          nodes: [{ kind: 'paragraph', runs: [{ text: 'a', href: 'javascript:alert(1)' }] }],
        },
      ],
    });
    expectError(await as(t, ed, 'POST', '/api/v1/pages', badHref), 400, 'validation_error');
  });

  it('akzeptiert lange Absätze (Fließtext) und nennt bei zu langen Texten Block und Grenze', async () => {
    const richtext = (text: string) => [
      {
        id: randomUUID(),
        type: 'richtext',
        nodes: [{ kind: 'paragraph', runs: [{ text }] }],
      },
    ];
    // Ein Absatz ohne Auszeichnung ist ein einziger Lauf: 1200 Zeichen sind normaler Fließtext
    const ok = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('lang-ok', { content: richtext('Ein langer Satz. '.repeat(75)) }),
    );
    expect(ok.statusCode).toBe(201);

    const tooLong = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('lang-zu-lang', { content: richtext('x'.repeat(5001)) }),
    );
    expectError(tooLong, 400, 'validation_error');
    expect(tooLong.json().error.message).toBe(
      'Ungültiger Seiteninhalt: Block 1: Text zu lang (max. 5000 Zeichen)',
    );
  });

  it('speichert Bildblöcke, prüft das Medium und nennt ein fehlendes Bild verständlich', async () => {
    const photo = await createMedia(t, ed);
    const image = (mediaId: string, size = 'large') => [
      { id: randomUUID(), type: 'image', mediaId, size, caption: 'Unser Studio' },
    ];
    const ok = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('mit-bild', { content: image(photo, 'full') }),
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().latest.content[0]).toMatchObject({ type: 'image', size: 'full' });

    // Noch kein Bild gewählt (Block frisch hinzugefügt): lesbare Meldung statt „Invalid UUID“
    const empty = await as(
      t,
      ed,
      'POST',
      '/api/v1/pages',
      body('ohne-bild', { content: image('') }),
    );
    expectError(empty, 400, 'validation_error');
    expect(empty.json().error.message).toBe(
      'Ungültiger Seiteninhalt: Block 1: Bitte ein Bild wählen',
    );

    // Unbekanntes Medium
    expectError(
      await as(
        t,
        ed,
        'POST',
        '/api/v1/pages',
        body('falsches-bild', { content: image(randomUUID()) }),
      ),
      400,
      'validation_error',
    );
  });

  it('legt beim Veröffentlichen einer Slug-Änderung einen 301 an', async () => {
    const created = (await as(t, ed, 'POST', '/api/v1/pages', body('alt-slug'))).json();
    await as(t, ed, 'POST', `/api/v1/pages/${created.page.id}/publish`);
    await as(t, ed, 'PUT', `/api/v1/pages/${created.page.id}/draft`, body('neu-slug'));
    await as(t, ed, 'POST', `/api/v1/pages/${created.page.id}/publish`);
    const { rows } = await t.handle.pool.query(
      'select to_path from redirects where from_path = $1',
      ['/alt-slug'],
    );
    expect(rows[0].to_path).toBe('/neu-slug');
  });

  it('schützt Systemseiten (fester Slug, nicht löschbar) und veröffentlichte Seiten vor dem Löschen', async () => {
    // die EN-Projektübersicht legt schon der Kopier-Test an (pro Sprache gibt es nur eine)
    const existing = (await as(t, ed, 'GET', '/api/v1/pages?locale=en'))
      .json()
      .pages.find((p: { systemKey: string | null }) => p.systemKey === 'projects');
    const home = (await as(t, ed, 'GET', `/api/v1/pages/${existing.id}`)).json();
    const wrongSlug = { slug: 'anderer-slug', title: 'Work', content: home.latest.content };
    expectError(
      await as(t, ed, 'PUT', `/api/v1/pages/${home.page.id}/draft`, wrongSlug),
      400,
      'validation_error',
    );
    expectError(await as(t, admin, 'DELETE', `/api/v1/pages/${home.page.id}`), 409, 'conflict');
    const live = (await as(t, ed, 'POST', '/api/v1/pages', body('wird-live'))).json();
    await as(t, ed, 'POST', `/api/v1/pages/${live.page.id}/publish`);
    expectError(await as(t, admin, 'DELETE', `/api/v1/pages/${live.page.id}`), 409, 'conflict');
    const draft = (await as(t, ed, 'POST', '/api/v1/pages', body('loeschbar'))).json();
    expectError(await as(t, ed, 'DELETE', `/api/v1/pages/${draft.page.id}`), 403, 'forbidden');
    expect((await as(t, admin, 'DELETE', `/api/v1/pages/${draft.page.id}`)).statusCode).toBe(200);
  });

  it('löst beim Veröffentlichen einen Build aus', async () => {
    await drain();
    enqueued.length = 0;
    const p = (await as(t, ed, 'POST', '/api/v1/pages', body('build-ausloeser'))).json();
    expect(enqueued).toHaveLength(0);
    await as(t, ed, 'POST', `/api/v1/pages/${p.page.id}/publish`);
    expect(enqueued.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Leistungen', () => {
  it('pflegt Leistungen; eindeutig pro Sprache und Schlüssel; Änderungen lösen Builds aus', async () => {
    await drain();
    enqueued.length = 0;
    const c = await as(t, ed, 'POST', '/api/v1/services', {
      locale: 'de',
      key: 'web',
      name: 'Webdesign',
      description: 'Text',
      status: 'published',
    });
    expect(c.statusCode).toBe(201);
    expect(enqueued.length).toBeGreaterThanOrEqual(1);
    expectError(
      await as(t, ed, 'POST', '/api/v1/services', {
        locale: 'de',
        key: 'web',
        name: 'Doppelt',
        description: 'x',
      }),
      409,
      'conflict',
    );
    expect(
      (
        await as(t, ed, 'POST', '/api/v1/services', {
          locale: 'en',
          key: 'web',
          name: 'Web design',
          description: 'x',
        })
      ).statusCode,
    ).toBe(201);
    const id = c.json().item.id;
    expect(
      (await as(t, ed, 'PATCH', `/api/v1/services/${id}`, { name: 'Webdesign neu' })).json().item
        .name,
    ).toBe('Webdesign neu');
    expect((await as(t, ed, 'GET', '/api/v1/services?locale=de')).json().items).toHaveLength(1);
    expectError(
      await as(t, ed, 'POST', '/api/v1/services', {
        locale: 'de',
        key: 'video',
        name: 'x',
        description: 'y',
      }),
      400,
      'validation_error',
    );
    expect((await as(t, ed, 'DELETE', `/api/v1/services/${id}`)).statusCode).toBe(200);
    expectError(await as(t, ed, 'DELETE', `/api/v1/services/${id}`), 404, 'not_found');
  });

  it('ordnet Leistungen einer Sprache neu und lehnt gemischte Sprachen ab', async () => {
    const mk = async (key: string, locale = 'de') =>
      (
        await as(t, ed, 'POST', '/api/v1/services', { locale, key, name: key, description: 'x' })
      ).json().item.id as string;
    const a = await mk('shop');
    const b = await mk('brand');
    const e = await mk('print', 'en');
    expect((await as(t, ed, 'PUT', '/api/v1/services/order', { ids: [b, a] })).statusCode).toBe(
      200,
    );
    const list = (await as(t, ed, 'GET', '/api/v1/services?locale=de'))
      .json()
      .items.map((s: { id: string }) => s.id);
    expect(list.indexOf(b)).toBeLessThan(list.indexOf(a));
    expectError(
      await as(t, ed, 'PUT', '/api/v1/services/order', { ids: [a, e] }),
      400,
      'validation_error',
    );
  });
});

describe('Navigation', () => {
  it('validiert Ziele (Seite derselben Sprache oder URL) und verhindert das Löschen verlinkter Seiten', async () => {
    const de = await newPage('nav-de');
    const en = await newPage('nav-en', 'en');
    const ok = await as(t, ed, 'POST', '/api/v1/navigation', {
      locale: 'de',
      location: 'footer',
      label: 'Seite',
      target: { kind: 'page', pageId: de.page.id },
      status: 'published',
    });
    expect(ok.statusCode).toBe(201);
    expectError(
      await as(t, ed, 'POST', '/api/v1/navigation', {
        locale: 'de',
        location: 'footer',
        label: 'Falsch',
        target: { kind: 'page', pageId: en.page.id },
      }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, ed, 'POST', '/api/v1/navigation', {
        locale: 'de',
        location: 'footer',
        label: 'Weg',
        target: { kind: 'page', pageId: randomUUID() },
      }),
      400,
      'validation_error',
    );
    expect(
      (
        await as(t, ed, 'POST', '/api/v1/navigation', {
          locale: 'de',
          location: 'legal',
          label: 'Extern',
          target: { kind: 'url', url: 'https://example.com' },
        })
      ).statusCode,
    ).toBe(201);
    expectError(
      await as(t, ed, 'POST', '/api/v1/navigation', {
        locale: 'de',
        location: 'legal',
        label: 'X',
        target: { kind: 'url', url: 'javascript:alert(1)' },
      }),
      400,
      'validation_error',
    );
    // Seite ist verlinkt: Löschen scheitert, auch auf DB-Ebene (RESTRICT)
    expectError(await as(t, admin, 'DELETE', `/api/v1/pages/${de.page.id}`), 409, 'conflict');
    const item = ok.json().item;
    const moved = await as(t, ed, 'PATCH', `/api/v1/navigation/${item.id}`, {
      location: 'header',
      target: { kind: 'url', url: 'https://example.com/x' },
    });
    expect(moved.json().item).toMatchObject({
      location: 'header',
      target: { kind: 'url', url: 'https://example.com/x' },
    });
  });
});

describe('Einstellungen', () => {
  const identity = { name: 'serend.design', city: 'Wuppertal', email: 'hallo@serend.design' };

  it('liest editor+, ändert nur admin und validiert pro Key', async () => {
    expectError(
      await as(t, ed, 'PUT', '/api/v1/settings/site.identity?locale=de', { value: identity }),
      403,
      'forbidden',
    );
    expectError(await as(t, null, 'GET', '/api/v1/settings'), 401, 'unauthenticated');
    await drain();
    enqueued.length = 0;
    const res = await as(t, admin, 'PUT', '/api/v1/settings/site.identity?locale=de', {
      value: identity,
    });
    expect(res.statusCode).toBe(200);
    expect(enqueued.length).toBeGreaterThanOrEqual(1);
    expectError(
      await as(t, admin, 'PUT', '/api/v1/settings/site.identity?locale=de', {
        value: { ...identity, email: 'kaputt' },
      }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, admin, 'PUT', '/api/v1/settings/site.footer?locale=de', { value: {} }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, admin, 'PUT', '/api/v1/settings/gibt-es-nicht?locale=de', { value: {} }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, admin, 'PUT', '/api/v1/settings/site.identity?locale=fr', { value: identity }),
      400,
      'validation_error',
    );
    const list = (await as(t, ed, 'GET', '/api/v1/settings')).json().settings;
    expect(list).toEqual([
      expect.objectContaining({ key: 'site.identity', locale: 'de', value: identity }),
    ]);
  });

  it('prüft Link-Ziele in site.cta', async () => {
    const cta = (pageId: string) => ({
      value: { label: 'Projekt anfragen', target: { kind: 'page', pageId, fragment: 'kontakt' } },
    });
    const page = await newPage('cta-ziel');
    expect(
      (await as(t, admin, 'PUT', '/api/v1/settings/site.cta?locale=de', cta(page.page.id)))
        .statusCode,
    ).toBe(200);
    expectError(
      await as(t, admin, 'PUT', '/api/v1/settings/site.cta?locale=de', cta(randomUUID())),
      400,
      'validation_error',
    );
  });
});

describe('Team', () => {
  it('pflegt Teammitglieder (noch ohne Auslieferung, daher kein Build) und prüft das Foto', async () => {
    enqueued.length = 0;
    const photo = await createMedia(t, ed);
    const c = await as(t, ed, 'POST', '/api/v1/team', {
      locale: 'de',
      name: 'Mira Beispiel',
      roleTitle: 'Designerin',
      photoMediaId: photo,
    });
    expect(c.statusCode).toBe(201);
    expect(enqueued).toHaveLength(0);
    expectError(
      await as(t, ed, 'POST', '/api/v1/team', {
        locale: 'de',
        name: 'X',
        roleTitle: 'Y',
        photoMediaId: randomUUID(),
      }),
      400,
      'validation_error',
    );
    expectError(await as(t, ed, 'DELETE', `/api/v1/media/${photo}`), 409, 'conflict'); // Foto referenziert
    expect(
      (await as(t, ed, 'PATCH', `/api/v1/team/${c.json().item.id}`, { bio: 'Kurzvita' })).json()
        .item.bio,
    ).toBe('Kurzvita');
    expect((await as(t, ed, 'DELETE', `/api/v1/team/${c.json().item.id}`)).statusCode).toBe(200);
    expect((await as(t, ed, 'DELETE', `/api/v1/media/${photo}`)).statusCode).toBe(200);
  });
});
