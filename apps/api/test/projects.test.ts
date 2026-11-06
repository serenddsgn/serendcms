import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  createMedia,
  createProject,
  createTestApp,
  draftBody,
  editorSession,
  expectError,
  projectPayload,
  type Session,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let ed: Session;
let admin: Session;
beforeAll(async () => {
  t = await createTestApp();
  ed = await editorSession(t, 'editor');
  admin = await editorSession(t, 'admin');
});
afterAll(() => t.close());

const save = (s: Session, id: string, body: object) =>
  as(t, s, 'PUT', `/api/v1/projects/${id}/draft`, body);
const publish = (s: Session, id: string) => as(t, s, 'POST', `/api/v1/projects/${id}/publish`);

/** Projekt, das alle Veröffentlichungsvoraussetzungen erfüllt. */
async function publishable(over: Record<string, unknown> = {}) {
  const cover = await createMedia(t, ed);
  return createProject(t, ed, { coverMediaId: cover, ...over });
}

const chapter = () => ({
  id: randomUUID(),
  type: 'chapter',
  title: 'Um wen es geht',
  lead: [{ text: 'Eine Pasticceria.' }],
  body: [[{ text: 'Genau das Aussuchen ist Teil des Produkts.' }]],
});

describe('Berechtigungen', () => {
  it('verlangt Anmeldung für alle Projekt-Endpunkte', async () => {
    for (const [m, u] of [
      ['GET', '/api/v1/projects'],
      ['POST', '/api/v1/projects'],
      ['GET', `/api/v1/projects/${randomUUID()}`],
      ['POST', `/api/v1/projects/${randomUUID()}/publish`],
    ] as const) {
      expectError(await as(t, null, m, u), 401, 'unauthenticated');
    }
  });

  it('erlaubt editor Bearbeiten und Veröffentlichen, aber nicht hartes Löschen', async () => {
    const p = await publishable();
    expect((await publish(ed, p.project.id)).statusCode).toBe(200);
    expectError(await as(t, ed, 'DELETE', `/api/v1/projects/${p.project.id}`), 403, 'forbidden');
  });

  it('erlaubt dem admin das Löschen nie veröffentlichter Projekte', async () => {
    const p = await createProject(t, ed);
    expect((await as(t, admin, 'DELETE', `/api/v1/projects/${p.project.id}`)).statusCode).toBe(200);
    expectError(await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}`), 404, 'not_found');
    // Slug ist danach wieder frei
    expect(
      (await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ slug: p.latest.slug })))
        .statusCode,
    ).toBe(201);
  });

  it('verbietet das Löschen veröffentlichter Projekte, auch dem admin', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    expectError(await as(t, admin, 'DELETE', `/api/v1/projects/${p.project.id}`), 409, 'conflict');
    await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/unpublish`);
    expectError(await as(t, admin, 'DELETE', `/api/v1/projects/${p.project.id}`), 409, 'conflict'); // war veröffentlicht
  });
});

describe('Eingaben', () => {
  it('validiert Pflichtfelder, Farbe, Kategorien, Slug-Format und Jahr', async () => {
    const bad = [
      { slug: 'Ungültig Slug' },
      { color: 'rot' },
      { categories: [] },
      { categories: ['web', 'web'] },
      { categories: ['video'] },
      { year: 1999 },
      { title: '   ' },
      { liveUrl: 'javascript:alert(1)' },
    ];
    for (const over of bad) {
      expectError(
        await as(t, ed, 'POST', '/api/v1/projects', projectPayload(over)),
        400,
        'validation_error',
      );
    }
  });

  it('lehnt ungültige Blöcke und doppelte Block-IDs ab', async () => {
    const id = randomUUID();
    const dup = [
      { ...chapter(), id },
      { ...chapter(), id },
    ];
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ content: dup })),
      400,
      'validation_error',
    );
    const unknown = [{ id: randomUUID(), type: 'hero', eyebrow: 'x' }];
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ content: unknown })),
      400,
      'validation_error',
    );
    const noLead = [{ id: randomUUID(), type: 'chapter', title: 'x', body: [] }];
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ content: noLead })),
      400,
      'validation_error',
    );
  });

  it('speichert gültige Blöcke (Kapitel, Zitat, Pick&Mix-Demo) unverändert', async () => {
    const content = [
      chapter(),
      {
        id: randomUUID(),
        type: 'quote',
        lines: [
          [{ text: 'Das Problem war nicht der Shop.' }],
          [{ text: 'Das Problem war die Box.', liquid: true }],
        ],
      },
      {
        id: randomUUID(),
        type: 'interactive_demo',
        navLabel: 'Ausprobieren',
        demo: {
          component: 'pick-and-mix',
          eyebrow: 'Ausprobieren · Nachbau',
          title: 'Stellen Sie Ihre Box zusammen.',
          sizes: [12, 18, 24, 46],
          defaultSize: 12,
          flavors: [
            { key: 'mandel', name: 'Mandelgebäck', priceCents: 160, color: '#e0a98f' },
            { key: 'crostatina', name: 'Crostatina', priceCents: 220, color: '#b06bb4' },
          ],
        },
      },
    ];
    const p = await createProject(t, ed, { content });
    const got = (await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}`)).json();
    expect(got.latest.content).toEqual(content);
  });

  it('lehnt Verweise auf unbekannte Medien und Projekte ab', async () => {
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ coverMediaId: randomUUID() })),
      400,
      'validation_error',
    );
    const p = await createProject(t, ed);
    expectError(
      await save(ed, p.project.id, draftBody(p as never, { nextProjectId: randomUUID() })),
      400,
      'validation_error',
    );
    expectError(
      await save(ed, p.project.id, draftBody(p as never, { nextProjectId: p.project.id })),
      400,
      'validation_error',
    );
  });
});

describe('Slugs', () => {
  it('lehnt doppelte Slugs pro Sprache ab', async () => {
    const p = await createProject(t, ed);
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ slug: p.latest.slug })),
      409,
      'conflict',
    );
  });

  it('erlaubt denselben Slug in verschiedenen Sprachen', async () => {
    const p = await createProject(t, ed, { locale: 'de' });
    const en = await as(
      t,
      ed,
      'POST',
      '/api/v1/projects',
      projectPayload({ slug: p.latest.slug, locale: 'en' }),
    );
    expect(en.statusCode).toBe(201);
  });

  it('lehnt beim Bearbeiten den Slug eines anderen Projekts ab', async () => {
    const a = await createProject(t, ed);
    const b = await createProject(t, ed);
    expectError(
      await save(ed, b.project.id, draftBody(b as never, { slug: a.latest.slug })),
      409,
      'conflict',
    );
    // eigener Slug bleibt natürlich erlaubt
    expect((await save(ed, b.project.id, draftBody(b as never, { title: 'Neu' }))).statusCode).toBe(
      200,
    );
  });

  it('hält den Slug der veröffentlichten Revision reserviert, bis der neue Slug live ist', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    const oldSlug = p.latest.slug;
    const newSlug = `neu-${randomUUID().slice(0, 6)}`;
    const saved = await save(ed, p.project.id, draftBody(p as never, { slug: newSlug }));
    expect(saved.statusCode).toBe(200);
    // alter Slug ist live und bleibt reserviert, der neue ist als Entwurf reserviert
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ slug: oldSlug })),
      409,
      'conflict',
    );
    expectError(
      await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ slug: newSlug })),
      409,
      'conflict',
    );
    expect((await publish(ed, p.project.id)).statusCode).toBe(200);
    // nach der Veröffentlichung ist der alte Slug frei
    expect(
      (await as(t, ed, 'POST', '/api/v1/projects', projectPayload({ slug: oldSlug }))).statusCode,
    ).toBe(201);
  });

  it('erzeugt beim Veröffentlichen einer Slug-Änderung automatisch einen 301', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    const newSlug = `umbenannt-${randomUUID().slice(0, 6)}`;
    await save(ed, p.project.id, draftBody(p as never, { slug: newSlug }));
    await publish(ed, p.project.id);
    const { rows } = await t.handle.pool.query('select * from redirects where from_path = $1', [
      `/de/projekte/${p.latest.slug}`,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      to_path: `/de/projekte/${newSlug}`,
      status_code: 301,
      source: 'auto',
      locale: 'de',
    });

    // zweite Umbenennung: keine Kette, der erste Redirect zeigt direkt aufs Ziel
    const third = `drittens-${randomUUID().slice(0, 6)}`;
    const cur = (await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}`)).json();
    await save(ed, p.project.id, draftBody(cur, { slug: third }));
    await publish(ed, p.project.id);
    const all = await t.handle.pool.query(
      'select from_path, to_path from redirects where to_path like $1',
      [`%${third}`],
    );
    expect(all.rows.map((r) => r.from_path).sort()).toEqual(
      [`/de/projekte/${newSlug}`, `/de/projekte/${p.latest.slug}`].sort(),
    );
  });

  it('legt keinen Redirect an, wenn der Slug gleich bleibt', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    await save(ed, p.project.id, draftBody(p as never, { title: 'Anderer Titel' }));
    await publish(ed, p.project.id);
    const { rows } = await t.handle.pool.query('select 1 from redirects where from_path = $1', [
      `/de/projekte/${p.latest.slug}`,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('verhindert Redirect-Schleifen, wenn zu einem früheren Slug zurückbenannt wird', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    const other = `anders-${randomUUID().slice(0, 6)}`;
    await save(ed, p.project.id, draftBody(p as never, { slug: other }));
    await publish(ed, p.project.id);
    const cur = (await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}`)).json();
    await save(ed, p.project.id, draftBody(cur, { slug: p.latest.slug }));
    expect((await publish(ed, p.project.id)).statusCode).toBe(200);
    const { rows } = await t.handle.pool.query(
      'select from_path, to_path from redirects where from_path = $1 or to_path = $1',
      [`/de/projekte/${p.latest.slug}`],
    );
    expect(rows.every((r) => r.from_path !== r.to_path)).toBe(true);
    expect(rows.find((r) => r.from_path === `/de/projekte/${p.latest.slug}`)).toBeUndefined(); // aktiver Pfad leitet nicht weiter
  });
});

describe('Revisionen und Veröffentlichung', () => {
  it('ändert vor der Veröffentlichung nur den Entwurf (Revision bleibt 1)', async () => {
    const p = await createProject(t, ed);
    const r = await save(ed, p.project.id, draftBody(p as never, { title: 'Zweiter Titel' }));
    expect(r.json().latest).toMatchObject({ revisionNo: 1, title: 'Zweiter Titel' });
    expect(r.json().published).toBeNull();
    expect(r.json().project.status).toBe('draft');
  });

  it('verlangt zum Veröffentlichen Cover und Alt-Texte in der Sprache des Projekts', async () => {
    const noCover = await createProject(t, ed);
    const e1 = await publish(ed, noCover.project.id);
    expectError(e1, 400, 'validation_error');
    expect(e1.json().error.message).toContain('Cover');

    const noAlt = await createMedia(t, ed, { en: 'only english' });
    const p = await createProject(t, ed, { coverMediaId: noAlt });
    expect((await publish(ed, p.project.id)).json().error.message).toContain('Alt-Text des Covers');

    // Alt-Override an der Galerie genügt
    const cover = await createMedia(t, ed);
    const galNoAlt = await createMedia(t, ed, {});
    const g = await createProject(t, ed, { coverMediaId: cover, gallery: [{ mediaId: galNoAlt }] });
    expect((await publish(ed, g.project.id)).json().error.message).toContain('Galeriebild 1');
    const fixed = await save(
      ed,
      g.project.id,
      draftBody(g as never, { gallery: [{ mediaId: galNoAlt, altOverride: 'Eigener Text' }] }),
    );
    expect(fixed.statusCode).toBe(200);
    expect((await publish(ed, g.project.id)).statusCode).toBe(200);
  });

  it('veröffentlicht und verlangt danach neue Änderungen', async () => {
    const p = await publishable();
    const pub = await publish(ed, p.project.id);
    expect(pub.statusCode).toBe(200);
    expect(pub.json().project).toMatchObject({
      status: 'published',
      publishedRevisionId: p.latest.id,
    });
    expect(pub.json().published.id).toBe(p.latest.id);
    expect(pub.json().hasUnpublishedChanges).toBe(false);
    expectError(await publish(ed, p.project.id), 409, 'conflict');
  });

  it('erzeugt nach der Veröffentlichung beim Bearbeiten eine neue Revision und lässt die veröffentlichte unverändert', async () => {
    const p = await publishable({ title: 'Original' });
    await publish(ed, p.project.id);
    const before = await t.handle.pool.query('select * from project_revisions where id = $1', [
      p.latest.id,
    ]);

    const edit = await save(ed, p.project.id, draftBody(p as never, { title: 'Überarbeitet' }));
    const body = edit.json();
    expect(body.latest).toMatchObject({ revisionNo: 2, title: 'Überarbeitet', publishedAt: null });
    expect(body.published).toMatchObject({ id: p.latest.id, title: 'Original' });
    expect(body.project.publishedRevisionId).toBe(p.latest.id);
    expect(body.hasUnpublishedChanges).toBe(true);

    const after = await t.handle.pool.query('select * from project_revisions where id = $1', [
      p.latest.id,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]); // Zeile unverändert (inkl. updated_at)

    // weiteres Speichern ändert nur Revision 2
    const again = await save(ed, p.project.id, draftBody(body, { title: 'Nochmal' }));
    expect(again.json().latest).toMatchObject({ revisionNo: 2, title: 'Nochmal' });

    const pub = await publish(ed, p.project.id);
    expect(pub.json().published).toMatchObject({ revisionNo: 2, title: 'Nochmal' });
    const revs = (await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}/revisions`)).json()
      .revisions;
    expect(revs.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([2, 1]);
    const r1 = (
      await as(t, ed, 'GET', `/api/v1/projects/${p.project.id}/revisions/${p.latest.id}`)
    ).json().revision;
    expect(r1.title).toBe('Original');
  });

  it('erkennt gleichzeitige Bearbeitung über expectedRevisionNo', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    await save(ed, p.project.id, draftBody(p as never, { title: 'A' })); // Revision 2
    const stale = await save(ed, p.project.id, {
      ...draftBody(p as never, { title: 'B' }),
      expectedRevisionNo: 1,
    });
    expectError(stale, 409, 'conflict');
    const ok = await save(ed, p.project.id, {
      ...draftBody(p as never, { title: 'B' }),
      expectedRevisionNo: 2,
    });
    expect(ok.statusCode).toBe(200);
  });

  it('serialisiert gleichzeitiges Veröffentlichen (kein doppelter Zustand)', async () => {
    const p = await publishable();
    const [a, b] = await Promise.all([publish(ed, p.project.id), publish(ed, p.project.id)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  });

  it('unveröffentlicht, archiviert und stellt wieder her', async () => {
    const p = await publishable();
    await publish(ed, p.project.id);
    const un = await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/unpublish`);
    expect(un.json().project).toMatchObject({ status: 'draft', publishedRevisionId: null });
    expectError(
      await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/unpublish`),
      409,
      'conflict',
    );

    expect((await publish(ed, p.project.id)).statusCode).toBe(200); // erneut live schalten ohne Änderungen
    await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/unpublish`);
    await save(ed, p.project.id, draftBody(p as never, { title: 'Neu' }));
    expect((await publish(ed, p.project.id)).statusCode).toBe(200);

    const ar = await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/archive`);
    expect(ar.json().project).toMatchObject({ status: 'archived', publishedRevisionId: null });
    expectError(await save(ed, p.project.id, draftBody(p as never)), 409, 'conflict');
    expectError(await publish(ed, p.project.id), 409, 'conflict');
    const rs = await as(t, ed, 'POST', `/api/v1/projects/${p.project.id}/restore`);
    expect(rs.json().project.status).toBe('draft');
  });

  it('löst nach Veröffentlichungsänderungen den Build-Hook aus', async () => {
    let calls = 0;
    const hooked = await createTestApp({}, { onPublishedChange: async () => void calls++ });
    try {
      const s = await editorSession(hooked);
      const cover = await createMedia(hooked, s);
      const p = await createProject(hooked, s, { coverMediaId: cover });
      expect(calls).toBe(0); // Entwürfe lösen keinen Build aus
      await as(hooked, s, 'POST', `/api/v1/projects/${p.project.id}/publish`);
      expect(calls).toBe(1);
      await as(hooked, s, 'POST', `/api/v1/projects/${p.project.id}/unpublish`);
      expect(calls).toBe(2);
    } finally {
      await hooked.close();
    }
  });
});

describe('Liste, Reihenfolge, Hervorhebung, Sprachversionen', () => {
  it('filtert nach Sprache und Status und zeigt offene Änderungen', async () => {
    const loc = await createTestApp();
    try {
      const s = await editorSession(loc);
      const cover = await createMedia(loc, s);
      const a = await createProject(loc, s, { coverMediaId: cover, locale: 'en' });
      await createProject(loc, s, { locale: 'de' });
      await as(loc, s, 'POST', `/api/v1/projects/${a.project.id}/publish`);
      const en = (await as(loc, s, 'GET', '/api/v1/projects?locale=en')).json().projects;
      expect(en).toHaveLength(1);
      expect(en[0]).toMatchObject({ status: 'published', hasUnpublishedChanges: false });
      expect(
        (await as(loc, s, 'GET', '/api/v1/projects?status=draft')).json().projects,
      ).toHaveLength(1);
      expect((await as(loc, s, 'GET', '/api/v1/projects')).json().projects).toHaveLength(2);
    } finally {
      await loc.close();
    }
  });

  it('ordnet Projekte per Drag & Drop neu', async () => {
    const loc = await createTestApp();
    try {
      const s = await editorSession(loc);
      const ids = [];
      for (let i = 0; i < 3; i++) ids.push((await createProject(loc, s)).project.id);
      const reversed = [...ids].reverse();
      expect(
        (await as(loc, s, 'PUT', '/api/v1/projects/order', { locale: 'de', ids: reversed }))
          .statusCode,
      ).toBe(200);
      const list = (await as(loc, s, 'GET', '/api/v1/projects?locale=de')).json().projects;
      expect(list.map((p: { id: string }) => p.id)).toEqual(reversed);
      expectError(
        await as(loc, s, 'PUT', '/api/v1/projects/order', { locale: 'en', ids }),
        400,
        'validation_error',
      );
      expectError(
        await as(loc, s, 'PUT', '/api/v1/projects/order', { locale: 'de', ids: [ids[0], ids[0]] }),
        400,
        'validation_error',
      );
    } finally {
      await loc.close();
    }
  });

  it('vergibt featured-Reihenfolge getrennt von der Listenreihenfolge', async () => {
    const a = await createProject(t, ed, { locale: 'en', featured: true });
    const b = await createProject(t, ed, { locale: 'en' });
    const pb = await as(t, ed, 'PATCH', `/api/v1/projects/${b.project.id}`, { featured: true });
    expect(pb.json().project.featuredSortOrder).toBeGreaterThan(
      (await as(t, ed, 'GET', `/api/v1/projects/${a.project.id}`)).json().project.featuredSortOrder,
    );
    const off = await as(t, ed, 'PATCH', `/api/v1/projects/${b.project.id}`, { featured: false });
    expect(off.json().project).toMatchObject({ featured: false, featuredSortOrder: null });
    expectError(
      await as(t, ed, 'PATCH', `/api/v1/projects/${b.project.id}`, {}),
      400,
      'validation_error',
    );
  });

  it('legt Sprachversionen als verknüpfte Kopie an', async () => {
    const cover = await createMedia(t, ed);
    const de = await createProject(t, ed, {
      coverMediaId: cover,
      content: [chapter()],
      gallery: [{ mediaId: cover }],
    });
    const en = await as(t, ed, 'POST', `/api/v1/projects/${de.project.id}/translations`, {
      locale: 'en',
    });
    expect(en.statusCode).toBe(201);
    const body = en.json();
    expect(body.project).toMatchObject({
      locale: 'en',
      status: 'draft',
      translationGroupId: de.project.translationGroupId,
    });
    expect(body.latest.content).toHaveLength(1);
    expect(body.latest.gallery).toHaveLength(1);
    expectError(
      await as(t, ed, 'POST', `/api/v1/projects/${de.project.id}/translations`, { locale: 'en' }),
      409,
      'conflict',
    );
    expectError(
      await as(t, ed, 'POST', `/api/v1/projects/${de.project.id}/translations`, { locale: 'de' }),
      409,
      'conflict',
    );
    // direkte Anlage mit bereits belegter Gruppe/Sprache
    expectError(
      await as(
        t,
        ed,
        'POST',
        '/api/v1/projects',
        projectPayload({ locale: 'en', translationGroupId: de.project.translationGroupId }),
      ),
      409,
      'conflict',
    );
  });

  it('hält „Nächstes Projekt“ innerhalb derselben Sprache', async () => {
    const de = await createProject(t, ed, { locale: 'de' });
    const en = await createProject(t, ed, { locale: 'en' });
    expectError(
      await save(ed, de.project.id, draftBody(de as never, { nextProjectId: en.project.id })),
      400,
      'validation_error',
    );
    const de2 = await createProject(t, ed, { locale: 'de' });
    const ok = await save(
      ed,
      de.project.id,
      draftBody(de as never, { nextProjectId: de2.project.id }),
    );
    expect(ok.json().latest.nextProjectId).toBe(de2.project.id);
  });
});

describe('Datenbank-Constraints', () => {
  it('erzwingt Status, Sprache, Kategorien und Farbformat auch direkt in der Datenbank', async () => {
    const p = await createProject(t, ed);
    const q = (sql: string, args: unknown[] = []) => t.handle.pool.query(sql, args);
    await expect(
      q("update projects set status = 'live' where id = $1", [p.project.id]),
    ).rejects.toThrow(/check/i);
    await expect(
      q("update projects set locale = 'fr' where id = $1", [p.project.id]),
    ).rejects.toThrow(/check/i);
    await expect(
      q("update project_revisions set categories = array['video'] where id = $1", [p.latest.id]),
    ).rejects.toThrow(/check/i);
    await expect(
      q("update project_revisions set color = 'red' where id = $1", [p.latest.id]),
    ).rejects.toThrow(/check/i);
    await expect(
      q("update project_revisions set slug = 'Bad Slug' where id = $1", [p.latest.id]),
    ).rejects.toThrow(/check/i);
    await expect(
      q(
        "insert into slug_claims (locale, scope, slug, owner_id) select locale, 'project', $2, id from projects where id = $1 union all select locale, 'project', $2, id from projects where id = $1",
        [p.project.id, 'dup-claim'],
      ),
    ).rejects.toThrow(/duplicate|unique/i);
  });
});
