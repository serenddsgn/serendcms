import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activateRelease,
  activeRelease,
  claimBuild,
  createRelease,
  deleteRelease,
  finishBuild,
  markReleasesRemoved,
  recentReleases,
  type Database,
} from '@serend/db';
import {
  currentReleaseId,
  pruneReleases,
  readCaddySnippets,
  runChecks,
  storeRelease,
  switchCurrent,
  releasePath,
  type ChecksOptions,
  type ChecksResult,
  writeCspSnippet,
} from '@serend/builder';
import type { WorkerConfig } from './config.js';
import { LogBuffer } from './log-buffer.js';
import type { SiteBuilder } from './site-builder.js';

export interface RunnerDeps {
  db: Database;
  config: Pick<
    WorkerConfig,
    'releasesDir' | 'keepReleases' | 'siteUrl' | 'buildToken' | 'lighthouse'
  > & {
    buildTmpDir?: string;
  };
  buildSite: SiteBuilder;
  /** Austauschbar für Tests; Standard sind die Prüfungen aus @serend/builder. */
  runChecks?: (dir: string, opts: ChecksOptions) => Promise<ChecksResult>;
  /** Nach dem Umschalten, z. B. `caddy reload` für geänderte Redirects. */
  afterSwitch?: (info: { releaseId: string; redirectsChanged: boolean }) => Promise<void>;
}

export type RunResult =
  | { status: 'skipped' }
  | { status: 'succeeded'; releaseId: string }
  | { status: 'failed'; error: string };

const readIfExists = (p: string) => readFile(p, 'utf8').catch(() => '');

/** Seiten, an denen Lighthouse misst: Startseiten, Projektübersicht und ein Projekt. */
async function lighthousePaths(dir: string): Promise<string[]> {
  const sitemap = await readIfExists(join(dir, 'sitemap.xml'));
  const urls = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]!);
  const pick = (re: RegExp) => urls.find((u) => re.test(u));
  return [
    ...new Set(
      [
        pick(/^\/de\/$/),
        pick(/^\/en\/$/),
        pick(/^\/de\/projekte\/$/),
        pick(/^\/de\/projekte\/[^/]+\/$/),
      ].filter((x): x is string => !!x),
    ),
  ];
}

/**
 * Führt einen Build aus: Astro-Build → Prüfungen → Upload nach releases/<id> → Symlink atomar umschalten →
 * Status speichern. Jeder Fehler vor dem Umschalten lässt das aktive Release unberührt.
 */
export async function runBuild(deps: RunnerDeps, buildId: string): Promise<RunResult> {
  const { db, config } = deps;
  const claimed = await claimBuild(db, buildId);
  if (!claimed) return { status: 'skipped' };

  const log = new LogBuffer([config.buildToken]);
  log.line(`Build ${buildId} gestartet (Auslöser: ${claimed.trigger}).`);
  // Nicht /tmp: Astro verschiebt Dateien per rename aus apps/web/.astro, das scheitert über Dateisystemgrenzen (EXDEV).
  const tmpBase = config.buildTmpDir ?? tmpdir();
  await mkdir(tmpBase, { recursive: true });
  const tmp = await mkdtemp(join(tmpBase, 'serend-build-'));
  const outDir = join(tmp, 'dist');
  let releaseId: string | undefined;
  let switched = false;
  const previousId = await currentReleaseId(config.releasesDir);
  let checks: ChecksResult | undefined;
  let manifest: unknown;

  try {
    await deps.buildSite({ outDir, log });
    log.line('Astro-Build abgeschlossen. Prüfungen laufen.');
    const hashes = await writeCspSnippet(outDir);
    log.line(`CSP: ${hashes.length} Inline-Skript-Hashes.`);

    manifest = JSON.parse(
      (await readIfExists(join(outDir, 'build-meta', 'build.json'))) || 'null',
    )?.manifest;
    const check = deps.runChecks ?? runChecks;
    checks = await check(outDir, {
      siteUrl: config.siteUrl,
      lighthouse: config.lighthouse.enabled,
      lighthouseMinScore: config.lighthouse.minScore,
      lighthousePaths: config.lighthouse.enabled ? await lighthousePaths(outDir) : [],
    });
    if (!checks.passed) {
      throw new Error(`Prüfungen fehlgeschlagen:\n${checks.problems.slice(0, 10).join('\n')}`);
    }
    log.line('Alle Prüfungen bestanden.');

    const release = await createRelease(db, buildId);
    releaseId = release.id;
    await storeRelease(config.releasesDir, release.id, outDir);
    const oldSnippets = previousId
      ? await readCaddySnippets(releasePath(config.releasesDir, previousId))
      : '';
    const newSnippets = await readCaddySnippets(outDir);

    await switchCurrent(config.releasesDir, release.id);
    switched = true;
    try {
      await activateRelease(db, release.id);
    } catch (err) {
      // Datenbank und Dateisystem müssen übereinstimmen: Symlink zurück.
      if (previousId) await switchCurrent(config.releasesDir, previousId).catch(() => {});
      switched = false;
      throw err;
    }
    log.line(`Release ${release.id} ist aktiv.`);
    await finishBuild(db, buildId, { status: 'succeeded', log: log.toString(), checks, manifest });

    await cleanup(deps, log);
    await deps
      .afterSwitch?.({ releaseId: release.id, redirectsChanged: oldSnippets !== newSnippets })
      .catch((e) => log.line(`Nachbereitung fehlgeschlagen: ${String(e)}`));
    return { status: 'succeeded', releaseId: release.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.line(`FEHLER: ${message}`);
    // Nie ein halb gespeichertes Release stehen lassen (außer es ist bereits aktiv, was oben zurückgenommen wird).
    if (releaseId && !switched) {
      await deleteRelease(db, releaseId).catch(() => {});
      await pruneReleases(
        config.releasesDir,
        new Set(await keepSet(db, config.releasesDir, releaseId)),
      ).catch(() => {});
    }
    await finishBuild(db, buildId, {
      status: 'failed',
      errorSummary: message.slice(0, 2000),
      log: log.toString(),
      ...(checks && { checks }),
      ...(manifest !== undefined && { manifest }),
    });
    return { status: 'failed', error: message };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Verzeichnisse, die bleiben müssen: aktives Release, Link-Ziel und alle Releases der Datenbank (außer `exclude`). */
async function keepSet(db: Database, releasesDir: string, exclude?: string): Promise<string[]> {
  const keep = (await recentReleases(db, 1000))
    .filter((r) => r.id !== exclude && !r.removedAt)
    .map((r) => r.id);
  const current = await currentReleaseId(releasesDir);
  const active = await activeRelease(db);
  return [...keep, ...(current ? [current] : []), ...(active ? [active.id] : [])];
}

/** Räumt alte Releases auf: die neuesten `keepReleases` und das aktive bleiben. */
async function cleanup(deps: RunnerDeps, log: LogBuffer): Promise<void> {
  const { db, config } = deps;
  const all = (await recentReleases(db, 1000)).filter((r) => !r.removedAt);
  const keep = new Set(all.slice(0, config.keepReleases).map((r) => r.id));
  const active = await activeRelease(db);
  if (active) keep.add(active.id);
  const current = await currentReleaseId(config.releasesDir);
  if (current) keep.add(current);
  const removable = all.filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (removable.length === 0) return;
  await pruneReleases(
    config.releasesDir,
    new Set([...keep, ...all.filter((r) => keep.has(r.id)).map((r) => r.id)]),
  );
  await markReleasesRemoved(db, removable);
  log.line(`${removable.length} alte Release(s) entfernt.`);
}
