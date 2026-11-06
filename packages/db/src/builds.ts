/**
 * Build- und Release-Zustand. Wird von API (anfordern, Rollback) und Worker (ausführen) genutzt.
 * Garantien kommen aus der Datenbank: höchstens ein wartender und ein laufender Build, genau ein aktives Release.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { builds, releases, type BuildRow, type ReleaseRow } from './schema.js';

export type BuildTrigger = 'publish' | 'manual' | 'deploy' | 'settings';

function isUnique(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && typeof e === 'object' && i < 5; i++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Fordert einen Build an. Ist bereits einer in der Warteschlange, wird er wiederverwendet (er liest beim Start den
 * dann aktuellen Stand), mehrfaches Veröffentlichen verschmilzt also zu einem Build.
 */
export async function requestBuild(
  db: Database,
  opts: { trigger: BuildTrigger; userId?: string | null },
): Promise<{ build: BuildRow; created: boolean }> {
  try {
    const [row] = await db
      .insert(builds)
      .values({ trigger: opts.trigger, triggeredBy: opts.userId ?? null })
      .returning();
    return { build: row!, created: true };
  } catch (err) {
    if (!isUnique(err)) throw err;
    const [existing] = await db.select().from(builds).where(eq(builds.status, 'queued')).limit(1);
    if (!existing) return requestBuild(db, opts); // gerade gestartet: neu versuchen
    return { build: existing, created: false };
  }
}

/** Setzt einen wartenden Build auf `running`. `undefined`, wenn er nicht (mehr) wartet oder schon einer läuft. */
export async function claimBuild(db: Database, id: string): Promise<BuildRow | undefined> {
  try {
    const [row] = await db
      .update(builds)
      .set({ status: 'running', startedAt: sql`now()` })
      .where(and(eq(builds.id, id), eq(builds.status, 'queued')))
      .returning();
    return row;
  } catch (err) {
    if (isUnique(err)) return undefined; // anderer Build läuft
    throw err;
  }
}

export async function finishBuild(
  db: Database,
  id: string,
  patch: {
    status: 'succeeded' | 'failed';
    errorSummary?: string | null;
    log?: string;
    checks?: unknown;
    manifest?: unknown;
  },
): Promise<void> {
  await db
    .update(builds)
    .set({
      status: patch.status,
      finishedAt: sql`now()`,
      errorSummary: patch.errorSummary ?? null,
      ...(patch.log !== undefined && { log: patch.log }),
      ...(patch.checks !== undefined && { checks: patch.checks }),
      ...(patch.manifest !== undefined && { manifest: patch.manifest }),
    })
    .where(eq(builds.id, id));
}

/** Beim Start des Workers: Build, die beim letzten Absturz liefen, sind gescheitert. */
export async function failStaleBuilds(db: Database): Promise<number> {
  const rows = await db
    .update(builds)
    .set({
      status: 'failed',
      finishedAt: sql`now()`,
      errorSummary: 'Worker wurde während des Builds beendet.',
    })
    .where(eq(builds.status, 'running'))
    .returning({ id: builds.id });
  return rows.length;
}

export async function queuedBuilds(db: Database): Promise<BuildRow[]> {
  return db
    .select()
    .from(builds)
    .where(eq(builds.status, 'queued'))
    .orderBy(asc(builds.requestedAt));
}

export async function createRelease(db: Database, buildId: string): Promise<ReleaseRow> {
  const [row] = await db.insert(releases).values({ buildId }).returning();
  return row!;
}

export async function deleteRelease(db: Database, id: string): Promise<void> {
  await db.delete(releases).where(eq(releases.id, id));
}

/** Macht ein Release aktiv und das bisherige inaktiv, in einer Transaktion. */
export async function activateRelease(db: Database, id: string): Promise<ReleaseRow> {
  return db.transaction(async (tx) => {
    await tx.update(releases).set({ isActive: false }).where(eq(releases.isActive, true));
    const [row] = await tx
      .update(releases)
      .set({ isActive: true, activatedAt: sql`now()` })
      .where(eq(releases.id, id))
      .returning();
    if (!row) throw new Error(`release ${id} not found`);
    return row;
  });
}

export async function activeRelease(db: Database): Promise<ReleaseRow | undefined> {
  const [row] = await db.select().from(releases).where(eq(releases.isActive, true)).limit(1);
  return row;
}

export async function markReleasesRemoved(db: Database, ids: string[]): Promise<void> {
  for (const id of ids)
    await db
      .update(releases)
      .set({ removedAt: sql`now()` })
      .where(eq(releases.id, id));
}

export async function recentReleases(db: Database, limit: number): Promise<ReleaseRow[]> {
  return db.select().from(releases).orderBy(desc(releases.createdAt)).limit(limit);
}
