import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activateRelease, createRelease, finishBuild, requestBuild } from '@serend/db';
import { currentReleaseId, storeRelease, switchCurrent } from '@serend/builder';
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

const enqueued: string[] = [];
let t: TestApp;
let ed: Session;

beforeAll(async () => {
  t = await createTestApp({}, { queue: { enqueue: async (id) => void enqueued.push(id) } });
  ed = await editorSession(t, 'editor');
});
afterAll(() => t.close());

describe('Builds anstoßen', () => {
  it('verlangt Anmeldung und erlaubt editor die Ansicht und den manuellen Build', async () => {
    for (const [m, u] of [
      ['GET', '/api/v1/status'],
      ['GET', '/api/v1/builds'],
      ['GET', '/api/v1/releases'],
      ['POST', '/api/v1/builds'],
    ] as const) {
      expectError(await as(t, null, m, u), 401, 'unauthenticated');
    }
    expect((await as(t, ed, 'GET', '/api/v1/status')).statusCode).toBe(200);
  });

  it('legt beim Veröffentlichen einen Build an und reiht ihn ein; weitere Veröffentlichungen verschmelzen', async () => {
    const local = await createTestApp(
      {},
      { queue: { enqueue: async (id) => void enqueued.push(id) } },
    );
    try {
      const s = await editorSession(local);
      enqueued.length = 0;
      const cover = await createMedia(local, s);
      const a = await createProject(local, s, { coverMediaId: cover });
      const b = await createProject(local, s, { coverMediaId: cover });
      expect(enqueued).toHaveLength(0); // Entwürfe lösen nichts aus
      await as(local, s, 'POST', `/api/v1/projects/${a.project.id}/publish`);
      await as(local, s, 'POST', `/api/v1/projects/${b.project.id}/publish`);
      expect(enqueued).toHaveLength(1); // zweiter Build verschmolzen
      const list = (await as(local, s, 'GET', '/api/v1/builds')).json().builds;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ status: 'queued', trigger: 'publish', releaseId: null });
      expect((await as(local, s, 'GET', '/api/v1/status')).json()).toMatchObject({
        buildQueued: true,
        buildRunning: false,
        activeRelease: null,
      });
    } finally {
      await local.close();
    }
  });

  it('stößt manuell einen Build an und verschmilzt ihn mit einem wartenden', async () => {
    const local = await createTestApp(
      {},
      { queue: { enqueue: async (id) => void enqueued.push(id) } },
    );
    try {
      const s = await editorSession(local);
      enqueued.length = 0;
      const one = await as(local, s, 'POST', '/api/v1/builds');
      expect(one.statusCode).toBe(202);
      expect(one.json()).toMatchObject({
        created: true,
        build: { status: 'queued', trigger: 'manual' },
      });
      const two = await as(local, s, 'POST', '/api/v1/builds');
      expect(two.json()).toMatchObject({ created: false });
      expect(two.json().build.id).toBe(one.json().build.id);
      expect(enqueued).toEqual([one.json().build.id]);
    } finally {
      await local.close();
    }
  });

  it('übersteht, dass die Warteschlange nicht erreichbar ist (der Worker-Sweep holt den Build nach)', async () => {
    const local = await createTestApp(
      {},
      {
        queue: {
          enqueue: async () => {
            throw new Error('boss down');
          },
        },
      },
    );
    try {
      const s = await editorSession(local);
      const res = await as(local, s, 'POST', '/api/v1/builds');
      expect(res.statusCode).toBe(202);
      expect((await as(local, s, 'GET', '/api/v1/builds')).json().builds[0].status).toBe('queued');
    } finally {
      await local.close();
    }
  });
});

describe('Status und Verlauf', () => {
  it('zählt offene Änderungen veröffentlichter Inhalte', async () => {
    const local = await createTestApp();
    try {
      const s = await editorSession(local);
      const cover = await createMedia(local, s);
      const p = await createProject(local, s, { coverMediaId: cover });
      await as(local, s, 'POST', `/api/v1/projects/${p.project.id}/publish`);
      expect((await as(local, s, 'GET', '/api/v1/status')).json().pending).toEqual({
        projects: 0,
        pages: 0,
      });
      await as(
        local,
        s,
        'PUT',
        `/api/v1/projects/${p.project.id}/draft`,
        draftBody(p as never, { title: 'Geändert' }),
      );
      expect((await as(local, s, 'GET', '/api/v1/status')).json().pending).toEqual({
        projects: 1,
        pages: 0,
      });
    } finally {
      await local.close();
    }
  });

  it('liefert Log und Prüfergebnisse eines Builds', async () => {
    const { build } = await requestBuild(t.handle.db, { trigger: 'deploy' });
    await finishBuild(t.handle.db, build.id, {
      status: 'failed',
      errorSummary: 'Kaputter Link',
      log: 'zeile 1\nzeile 2',
      checks: { passed: false },
    });
    const res = await as(t, ed, 'GET', `/api/v1/builds/${build.id}`);
    expect(res.json().build).toMatchObject({
      status: 'failed',
      errorSummary: 'Kaputter Link',
      log: 'zeile 1\nzeile 2',
      checks: { passed: false },
      trigger: 'deploy',
    });
    expectError(
      await as(t, ed, 'GET', '/api/v1/builds/0198a0a0-0000-7000-8000-000000000000'),
      404,
      'not_found',
    );
    // Liste enthält kein Log
    expect(JSON.stringify((await as(t, ed, 'GET', '/api/v1/builds')).json())).not.toContain(
      'zeile 1',
    );
  });
});

describe('Rollback', () => {
  let releasesDir: string;
  let ids: string[];
  let app: TestApp;
  let admin2: Session;
  let editor2: Session;

  beforeAll(async () => {
    app = await createTestApp();
    releasesDir = app.config.releasesDir;
    admin2 = await editorSession(app, 'admin');
    editor2 = await editorSession(app, 'editor');
    ids = [];
    for (const marker of ['eins', 'zwei', 'drei']) {
      const { build } = await requestBuild(app.handle.db, { trigger: 'manual' });
      await finishBuild(app.handle.db, build.id, { status: 'succeeded' });
      const r = await createRelease(app.handle.db, build.id);
      const src = mkdtempSync(join(tmpdir(), 'serend-src-'));
      writeFileSync(join(src, 'index.html'), marker);
      await storeRelease(releasesDir, r.id, src);
      rmSync(src, { recursive: true });
      ids.push(r.id);
    }
    await switchCurrent(releasesDir, ids[2]!);
    await activateRelease(app.handle.db, ids[2]!);
  });
  afterAll(() => app.close());

  it('listet Releases mit aktivem Release', async () => {
    const list = (await as(app, editor2, 'GET', '/api/v1/releases')).json().releases as {
      id: string;
      isActive: boolean;
    }[];
    expect(list.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect(list.filter((r) => r.isActive).map((r) => r.id)).toEqual([ids[2]]);
    expect((await as(app, editor2, 'GET', '/api/v1/status')).json().activeRelease.id).toBe(ids[2]);
  });

  it('erlaubt den Rollback nur dem admin', async () => {
    expectError(
      await as(app, null, 'POST', `/api/v1/releases/${ids[0]}/activate`),
      401,
      'unauthenticated',
    );
    expectError(
      await as(app, editor2, 'POST', `/api/v1/releases/${ids[0]}/activate`),
      403,
      'forbidden',
    );
    expect(await currentReleaseId(releasesDir)).toBe(ids[2]);
  });

  it('schaltet auf ein früheres Release zurück (Symlink und Datenbank)', async () => {
    const res = await as(app, admin2, 'POST', `/api/v1/releases/${ids[0]}/activate`);
    expect(res.statusCode).toBe(200);
    expect(res.json().release).toMatchObject({ id: ids[0], isActive: true });
    expect(await currentReleaseId(releasesDir)).toBe(ids[0]);
    const list = (await as(app, admin2, 'GET', '/api/v1/releases')).json().releases as {
      isActive: boolean;
    }[];
    expect(list.filter((r) => r.isActive)).toHaveLength(1);
  });

  it('lehnt unbekannte, aufgeräumte und fehlende Releases ab, ohne den Zustand zu ändern', async () => {
    expectError(
      await as(
        app,
        admin2,
        'POST',
        '/api/v1/releases/0198a0a0-0000-7000-8000-000000000000/activate',
      ),
      404,
      'not_found',
    );
    await app.handle.pool.query('update releases set removed_at = now() where id = $1', [ids[1]]);
    expectError(
      await as(app, admin2, 'POST', `/api/v1/releases/${ids[1]}/activate`),
      409,
      'conflict',
    );
    rmSync(join(releasesDir, ids[2]!), { recursive: true });
    expectError(
      await as(app, admin2, 'POST', `/api/v1/releases/${ids[2]}/activate`),
      409,
      'conflict',
    );
    expect(await currentReleaseId(releasesDir)).toBe(ids[0]);
    const active = await app.handle.pool.query('select id from releases where is_active');
    expect(active.rows.map((r) => r.id)).toEqual([ids[0]]);
    expect(existsSync(join(releasesDir, 'current'))).toBe(true);
  });

  it('lässt auf Datenbankebene nie zwei aktive Releases zu', async () => {
    const { build } = await requestBuild(app.handle.db, { trigger: 'manual' });
    const r = await createRelease(app.handle.db, build.id);
    await expect(
      app.handle.pool.query('update releases set is_active = true where id = $1', [r.id]),
    ).rejects.toThrow(/unique|duplicate/i);
    mkdirSync(join(releasesDir, 'noop'), { recursive: true });
  });
});
