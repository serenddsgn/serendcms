import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  activateRelease,
  activeRelease,
  requestBuild,
  type BuildRow,
  type Database,
  type ReleaseRow,
} from '@serend/db';
import { currentReleaseId, releasePath, switchCurrent } from '@serend/builder';
import type { BuildSummaryDto, ReleaseDto } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';
import { buildsRepo } from '../repositories/builds.repo.js';

const run = promisify(exec);

/** Schnittstelle zur Warteschlange (pg-boss im Betrieb, Attrappe in Tests). */
export interface BuildQueue {
  enqueue(buildId: string): Promise<void>;
}

const toSummary = (b: BuildRow & { releaseId: string | null }): BuildSummaryDto => ({
  id: b.id,
  status: b.status as BuildSummaryDto['status'],
  trigger: b.trigger as BuildSummaryDto['trigger'],
  requestedAt: b.requestedAt.toISOString(),
  startedAt: b.startedAt ? b.startedAt.toISOString() : null,
  finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
  errorSummary: b.errorSummary,
  releaseId: b.releaseId,
});
const toRelease = (r: ReleaseRow): ReleaseDto => ({
  id: r.id,
  buildId: r.buildId,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
  activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
  removed: r.removedAt !== null,
});

export function createBuildsService({
  db,
  queue,
  config,
  log,
}: {
  db: Database;
  queue: BuildQueue;
  config: Pick<AppConfig, 'releasesDir' | 'caddyReloadCommand'>;
  log?: { error: (obj: unknown, msg: string) => void };
}) {
  const repo = buildsRepo(db);

  /** Fordert einen Build an; schlägt das Einreihen fehl, holt der Worker-Sweep ihn nach. */
  async function request(trigger: 'publish' | 'manual' | 'settings', userId: string | null) {
    const { build, created } = await requestBuild(db, { trigger, userId });
    if (created) {
      try {
        await queue.enqueue(build.id);
      } catch (err) {
        log?.error({ err }, 'build konnte nicht eingereiht werden (Sweep holt es nach)');
      }
    }
    return { build: { ...build, releaseId: null }, created };
  }

  return {
    request,

    /** Hook für Projekte/Seiten: Veröffentlichungsänderungen lösen einen Build aus. */
    onPublishedChange: async () => {
      await request('publish', null);
    },

    async status() {
      const [active, builds, queued, running, pending] = await Promise.all([
        activeRelease(db),
        repo.list(1),
        repo.hasStatus('queued'),
        repo.hasStatus('running'),
        repo.pendingCounts(),
      ]);
      return {
        activeRelease: active ? toRelease(active) : null,
        lastBuild: builds[0] ? toSummary(builds[0]) : null,
        buildQueued: queued,
        buildRunning: running,
        pending,
      };
    },

    async list(limit: number) {
      return (await repo.list(limit)).map(toSummary);
    },

    async get(id: string) {
      const b = await repo.find(id);
      if (!b) throw errors.notFound('Build nicht gefunden.');
      return { ...toSummary(b), log: b.log, checks: b.checks ?? null };
    },

    async triggerManual(userId: string) {
      const r = await request('manual', userId);
      return { build: toSummary(r.build), created: r.created };
    },

    async releases() {
      return (await repo.releases(100)).map(toRelease);
    },

    /** Rollback: Symlink atomar auf ein früheres Release, danach Datenbank angleichen (bei Fehler Symlink zurück). */
    async activate(releaseId: string) {
      const target = await repo.findRelease(releaseId);
      if (!target) throw errors.notFound('Release nicht gefunden.');
      if (target.removedAt) throw errors.conflict('Die Dateien dieses Releases wurden aufgeräumt.');
      const previous = await currentReleaseId(config.releasesDir);
      try {
        await switchCurrent(config.releasesDir, releaseId);
      } catch {
        throw errors.conflict('Das Release-Verzeichnis existiert nicht mehr.');
      }
      let activated: ReleaseRow;
      try {
        activated = await activateRelease(db, releaseId);
      } catch (err) {
        if (previous) await switchCurrent(config.releasesDir, previous).catch(() => {});
        throw err;
      }
      if (config.caddyReloadCommand && previous && previous !== releaseId) {
        const file = (id: string) =>
          join(releasePath(config.releasesDir, id), 'build-meta', 'redirects.caddy');
        const [a, b] = await Promise.all([
          readFile(file(previous), 'utf8').catch(() => ''),
          readFile(file(releaseId), 'utf8').catch(() => ''),
        ]);
        if (a !== b)
          await run(config.caddyReloadCommand).catch((err) =>
            log?.error({ err }, 'caddy reload fehlgeschlagen'),
          );
      }
      return toRelease(activated);
    },
  };
}

export type BuildsService = ReturnType<typeof createBuildsService>;
