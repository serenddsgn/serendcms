import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { builds, pages, projects, releases, type BuildRow, type ReleaseRow } from '@serend/db';
import type { Executor } from './executor.js';

export function buildsRepo(x: Executor) {
  return {
    async list(limit: number): Promise<(BuildRow & { releaseId: string | null })[]> {
      const rows = await x
        .select({ build: builds, releaseId: releases.id })
        .from(builds)
        .leftJoin(releases, eq(releases.buildId, builds.id))
        .orderBy(desc(builds.requestedAt))
        .limit(limit);
      return rows.map((r) => ({ ...r.build, releaseId: r.releaseId }));
    },
    async find(id: string): Promise<(BuildRow & { releaseId: string | null }) | undefined> {
      const [r] = await x
        .select({ build: builds, releaseId: releases.id })
        .from(builds)
        .leftJoin(releases, eq(releases.buildId, builds.id))
        .where(eq(builds.id, id))
        .limit(1);
      return r ? { ...r.build, releaseId: r.releaseId } : undefined;
    },
    async hasStatus(status: string): Promise<boolean> {
      const rows = await x
        .select({ id: builds.id })
        .from(builds)
        .where(eq(builds.status, status))
        .limit(1);
      return rows.length > 0;
    },
    async releases(limit: number): Promise<ReleaseRow[]> {
      return x.select().from(releases).orderBy(desc(releases.createdAt)).limit(limit);
    },
    async findRelease(id: string): Promise<ReleaseRow | undefined> {
      const [r] = await x.select().from(releases).where(eq(releases.id, id)).limit(1);
      return r;
    },
    /** Veröffentlichte Projekte/Seiten, deren neueste Revision nicht die veröffentlichte ist. */
    async pendingCounts(): Promise<{ projects: number; pages: number }> {
      const [p] = await x
        .select({ n: count() })
        .from(projects)
        .where(
          and(
            eq(projects.status, 'published'),
            isNotNull(projects.publishedRevisionId),
            ne(
              projects.publishedRevisionId,
              sql`(select r.id from project_revisions r where r.project_id = ${projects.id} order by r.revision_no desc limit 1)`,
            ),
          ),
        );
      const [g] = await x
        .select({ n: count() })
        .from(pages)
        .where(
          and(
            eq(pages.status, 'published'),
            isNotNull(pages.publishedRevisionId),
            ne(
              pages.publishedRevisionId,
              sql`(select r.id from page_revisions r where r.page_id = ${pages.id} order by r.revision_no desc limit 1)`,
            ),
          ),
        );
      return { projects: p?.n ?? 0, pages: g?.n ?? 0 };
    },
  };
}
