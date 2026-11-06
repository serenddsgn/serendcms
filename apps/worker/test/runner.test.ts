import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import type { PgBoss } from 'pg-boss';
import {
  builds,
  createDb,
  failStaleBuilds,
  releases,
  requestBuild,
  type DbHandle,
} from '@serend/db';
import { createTestDatabase, type TestDatabase } from '@serend/db/testing';
import { currentReleaseId, type ChecksResult } from '@serend/builder';
import { runBuild, type RunnerDeps } from '../src/runner.js';
import { BUILD_QUEUE, pgBossQueue, startBoss } from '../src/queue.js';
import type { SiteBuilder } from '../src/site-builder.js';

const TOKEN = 'geheimes-build-token-'.padEnd(50, 'x');
let database: TestDatabase;
let h: DbHandle;
let releasesDir: string;

beforeAll(async () => {
  database = await createTestDatabase(inject('pgAdminUrl'));
  h = createDb(database.url, { max: 6 });
});
afterAll(async () => {
  await h.close();
  await database.drop();
});
beforeEach(async () => {
  releasesDir = mkdtempSync(join(tmpdir(), 'serend-releases-'));
  await h.db.delete(releases);
  await h.db.delete(builds);
});

const page = (body: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>T</title></head><body>${body}</body></html>`;
function write(dir: string, files: Record<string, string>) {
  for (const [n, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, n)), { recursive: true });
    writeFileSync(join(dir, n), c);
  }
}
const goodSite =
  (marker: string): SiteBuilder =>
  async ({ outDir, log }) => {
    log.add(`baue ${marker} mit Token ${TOKEN}\n`);
    write(outDir, {
      'index.html': page(`<p>${marker}</p><a href="/de/">x</a>`),
      'de/index.html': page(`<p>${marker}</p>`),
      'build-meta/build.json': JSON.stringify({ manifest: { counts: { projects: 1 } } }),
      'build-meta/redirects.caddy': `redir /alt /neu 301\n`,
    });
  };

function deps(buildSite: SiteBuilder, extra: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    db: h.db,
    config: {
      releasesDir,
      keepReleases: 3,
      siteUrl: 'https://example.com',
      buildToken: TOKEN,
      lighthouse: { enabled: false, minScore: 95 },
    },
    buildSite,
    ...extra,
  };
}
async function queued() {
  return (await requestBuild(h.db, { trigger: 'manual' })).build.id;
}
const activeRows = () => h.db.select().from(releases).where(eq(releases.isActive, true));
const html = (id: string) => readFileSync(join(releasesDir, id, 'de/index.html'), 'utf8');

describe('Erfolgreicher Build', () => {
  it('baut, prüft, lädt hoch, schaltet atomar um und speichert den Status', async () => {
    const id = await queued();
    const r = await runBuild(deps(goodSite('eins')), id);
    expect(r.status).toBe('succeeded');
    if (r.status !== 'succeeded') return;

    expect(await currentReleaseId(releasesDir)).toBe(r.releaseId);
    expect(html(r.releaseId)).toContain('eins');
    const [b] = await h.db.select().from(builds).where(eq(builds.id, id));
    expect(b).toMatchObject({ status: 'succeeded', errorSummary: null });
    expect(b!.startedAt && b!.finishedAt).toBeTruthy();
    expect(b!.manifest).toEqual({ counts: { projects: 1 } });
    expect((b!.checks as ChecksResult).passed).toBe(true);
    const active = await activeRows();
    expect(active.map((a) => a.id)).toEqual([r.releaseId]);
    expect(active[0]!.buildId).toBe(id);
  });

  it('schwärzt das Build-Token im gespeicherten Log', async () => {
    const id = await queued();
    await runBuild(deps(goodSite('x')), id);
    const [b] = await h.db.select().from(builds).where(eq(builds.id, id));
    expect(b!.log).toContain('[REDACTED]');
    expect(b!.log).not.toContain(TOKEN);
  });

  it('löst nach dem Umschalten den Hook aus und meldet geänderte Redirects', async () => {
    const calls: boolean[] = [];
    const afterSwitch = async (i: { redirectsChanged: boolean }) =>
      void calls.push(i.redirectsChanged);
    await runBuild(deps(goodSite('a'), { afterSwitch }), await queued());
    await runBuild(deps(goodSite('b'), { afterSwitch }), await queued());
    expect(calls).toEqual([true, false]); // erstes Release: neu; zweites: Redirects gleich
  });

  it('hält genau ein Release aktiv und räumt alte Releases nach keepReleases auf', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await runBuild(deps(goodSite(`v${i}`)), await queued());
      if (r.status === 'succeeded') ids.push(r.releaseId);
      expect(await activeRows()).toHaveLength(1);
    }
    expect(await currentReleaseId(releasesDir)).toBe(ids[4]);
    const dirs = readdirSync(releasesDir).filter((n) => n !== 'current' && !n.startsWith('.'));
    expect(dirs.sort()).toEqual(ids.slice(2).sort()); // neueste 3 bleiben
    const removed = await h.db.select().from(releases);
    expect(
      removed
        .filter((r) => r.removedAt)
        .map((r) => r.id)
        .sort(),
    ).toEqual(ids.slice(0, 2).sort());
  });
});

describe('Fehlgeschlagener Build lässt das aktive Release unverändert', () => {
  async function withLiveRelease() {
    const r = await runBuild(deps(goodSite('LIVE')), await queued());
    if (r.status !== 'succeeded') throw new Error('Ausgangsrelease fehlt');
    return r.releaseId;
  }
  async function expectUntouched(liveId: string) {
    expect(await currentReleaseId(releasesDir)).toBe(liveId);
    expect(html(liveId)).toContain('LIVE');
    expect((await activeRows()).map((a) => a.id)).toEqual([liveId]);
    expect((await h.db.select().from(releases)).map((r) => r.id)).toEqual([liveId]); // kein Geisterrelease
    expect(readdirSync(releasesDir).filter((n) => n !== 'current' && !n.startsWith('.'))).toEqual([
      liveId,
    ]); // kein halbes Verzeichnis
  }

  it('wenn der Astro-Build scheitert', async () => {
    const live = await withLiveRelease();
    const id = await queued();
    const failing: SiteBuilder = async ({ log }) => {
      log.add(`kaputt, Token ${TOKEN}\n`);
      throw new Error('Astro-Build beendet mit Exit-Code 1.');
    };
    const r = await runBuild(deps(failing), id);
    expect(r).toMatchObject({ status: 'failed' });
    const [b] = await h.db.select().from(builds).where(eq(builds.id, id));
    expect(b).toMatchObject({
      status: 'failed',
      errorSummary: 'Astro-Build beendet mit Exit-Code 1.',
    });
    expect(b!.log).not.toContain(TOKEN);
    await expectUntouched(live);
  });

  it('wenn Prüfungen fehlschlagen (kaputter Link) und speichert die Prüfergebnisse', async () => {
    const live = await withLiveRelease();
    const id = await queued();
    const broken: SiteBuilder = async ({ outDir }) =>
      write(outDir, {
        'de/index.html': page('<a href="/de/gibt-es-nicht/">x</a>'),
        'build-meta/build.json': '{}',
      });
    const r = await runBuild(deps(broken), id);
    expect(r.status).toBe('failed');
    const [b] = await h.db.select().from(builds).where(eq(builds.id, id));
    expect(b!.errorSummary).toContain('Kaputter Link');
    expect((b!.checks as ChecksResult).passed).toBe(false);
    await expectUntouched(live);
  });

  it('wenn das JS-Budget überschritten wird', async () => {
    const live = await withLiveRelease();
    const big = Array.from(
      { length: 12000 },
      (_, i) => `export const v${i}=${Math.random()};`,
    ).join('\n');
    const bloated: SiteBuilder = async ({ outDir }) =>
      write(outDir, {
        'de/index.html': page('<script type="module" src="/_assets/a.js"></script>'),
        '_assets/a.js': big,
      });
    const r = await runBuild(deps(bloated), await queued());
    expect(r).toMatchObject({ status: 'failed' });
    expect((r as { error: string }).error).toContain('JS-Budget');
    await expectUntouched(live);
  });

  it('wenn ein Prüfschritt selbst abstürzt', async () => {
    const live = await withLiveRelease();
    const r = await runBuild(
      deps(goodSite('neu'), {
        runChecks: async () => {
          throw new Error('lighthouse crashed');
        },
      }),
      await queued(),
    );
    expect(r).toMatchObject({ status: 'failed', error: 'lighthouse crashed' });
    await expectUntouched(live);
  });

  it('wenn das Speichern des Release fehlschlägt (Verzeichnis existiert bereits)', async () => {
    const live = await withLiveRelease();
    // blockiert den Release-Pfad, indem das Releases-Verzeichnis zur Datei wird
    const id = await queued();
    const sabotage: SiteBuilder = async (input) => {
      await goodSite('neu')(input);
      writeFileSync(join(releasesDir, 'blocker'), 'x');
    };
    const r = await runBuild(
      deps(sabotage, {
        config: { ...deps(sabotage).config, releasesDir: join(releasesDir, 'blocker') },
      }),
      id,
    );
    expect(r.status).toBe('failed');
    // das echte Releases-Verzeichnis ist unberührt
    expect(await currentReleaseId(releasesDir)).toBe(live);
    expect(html(live)).toContain('LIVE');
    expect((await activeRows()).map((a) => a.id)).toEqual([live]);
  });
});

describe('Arbeitsverzeichnis des Builds', () => {
  it('baut im konfigurierten Verzeichnis (nicht in /tmp) und räumt es danach auf', async () => {
    const base = mkdtempSync(join(tmpdir(), 'serend-buildbase-'));
    let seen = '';
    const recording: SiteBuilder = async (input) => {
      seen = input.outDir;
      await goodSite('x')(input);
    };
    const id = await queued();
    const r = await runBuild(
      deps(recording, { config: { ...deps(recording).config, buildTmpDir: join(base, 'nested') } }),
      id,
    );
    expect(r.status).toBe('succeeded');
    expect(seen.startsWith(join(base, 'nested'))).toBe(true);
    expect(readdirSync(join(base, 'nested'))).toEqual([]); // aufgeräumt
  });
});

describe('Warteschlange und Zustand', () => {
  it('verschmilzt mehrfaches Anfordern zu einem wartenden Build', async () => {
    const a = await requestBuild(h.db, { trigger: 'publish' });
    const b = await requestBuild(h.db, { trigger: 'manual' });
    const c = await requestBuild(h.db, { trigger: 'publish' });
    expect([a.created, b.created, c.created]).toEqual([true, false, false]);
    expect(new Set([a.build.id, b.build.id, c.build.id]).size).toBe(1);
    expect(await h.db.select().from(builds)).toHaveLength(1);
  });

  it('erlaubt nach dem Start des Builds einen neuen wartenden (Veröffentlichung während des Builds)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: SiteBuilder = async (input) => {
      await gate;
      await goodSite('x')(input);
    };
    const first = await queued();
    const running = runBuild(deps(slow), first);
    await new Promise((r) => setTimeout(r, 200));
    const next = await requestBuild(h.db, { trigger: 'publish' });
    expect(next.created).toBe(true);
    // zweiter Lauf wird nicht parallel gestartet
    expect(await runBuild(deps(goodSite('y')), next.build.id)).toEqual({ status: 'skipped' });
    release();
    expect((await running).status).toBe('succeeded');
    expect((await runBuild(deps(goodSite('y')), next.build.id)).status).toBe('succeeded');
  });

  it('überspringt Builds, die nicht (mehr) warten', async () => {
    const id = await queued();
    await runBuild(deps(goodSite('x')), id);
    expect(await runBuild(deps(goodSite('x')), id)).toEqual({ status: 'skipped' });
    expect(await runBuild(deps(goodSite('x')), '0198a0a0-0000-7000-8000-000000000000')).toEqual({
      status: 'skipped',
    });
  });

  it('markiert beim Start unterbrochene Builds als fehlgeschlagen', async () => {
    const id = await queued();
    await h.db.update(builds).set({ status: 'running' }).where(eq(builds.id, id));
    expect(await failStaleBuilds(h.db)).toBe(1);
    const [b] = await h.db.select().from(builds).where(eq(builds.id, id));
    expect(b).toMatchObject({ status: 'failed' });
    expect(b!.errorSummary).toContain('Worker');
  });

  it('verarbeitet Jobs über pg-boss', async () => {
    const boss: PgBoss = await startBoss(database.url);
    try {
      const id = await queued();
      const done = new Promise<string>((resolve) => {
        void boss.work(BUILD_QUEUE, { batchSize: 1 }, async ([job]) => {
          const { buildId } = job!.data as { buildId: string };
          resolve((await runBuild(deps(goodSite('boss')), buildId)).status);
        });
      });
      await pgBossQueue(boss).enqueue(id);
      await pgBossQueue(boss).enqueue(id); // doppelt gemeldet (Sweep): wird nicht doppelt ausgeführt
      expect(
        await Promise.race([
          done,
          new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 20_000)),
        ]),
      ).toBe('succeeded');
      expect(existsSync(join(releasesDir, 'current'))).toBe(true);
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
