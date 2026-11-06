import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { pageMedia, pageRevisions, pages, type PageRevisionRow, type PageRow } from '@serend/db';
import type { Executor } from './executor.js';

export type NewPageRevision = typeof pageRevisions.$inferInsert;
export type PageRevisionPatch = Partial<
  Omit<NewPageRevision, 'id' | 'pageId' | 'revisionNo' | 'createdAt'>
>;

export function pagesRepo(x: Executor) {
  return {
    async insertPage(values: typeof pages.$inferInsert): Promise<PageRow> {
      const [row] = await x.insert(pages).values(values).returning();
      if (!row) throw new Error('insert page returned no row');
      return row;
    },
    async findPage(id: string): Promise<PageRow | undefined> {
      const [row] = await x.select().from(pages).where(eq(pages.id, id)).limit(1);
      return row;
    },
    async lockPage(id: string): Promise<PageRow | undefined> {
      const [row] = await x.select().from(pages).where(eq(pages.id, id)).for('update').limit(1);
      return row;
    },
    async updatePage(
      id: string,
      patch: Partial<typeof pages.$inferInsert>,
    ): Promise<PageRow | undefined> {
      const [row] = await x
        .update(pages)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(pages.id, id))
        .returning();
      return row;
    },
    async groupHasLocale(groupId: string, locale: string): Promise<boolean> {
      const rows = await x
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.translationGroupId, groupId), eq(pages.locale, locale)))
        .limit(1);
      return rows.length > 0;
    },
    async listWithLatest(filter: { locale?: string; status?: string }) {
      return x
        .select({ page: pages, latest: pageRevisions })
        .from(pages)
        .innerJoin(
          pageRevisions,
          and(
            eq(pageRevisions.pageId, pages.id),
            eq(
              pageRevisions.revisionNo,
              sql`(select max(r2.revision_no) from page_revisions r2 where r2.page_id = ${pages.id})`,
            ),
          ),
        )
        .where(
          and(
            filter.locale ? eq(pages.locale, filter.locale) : undefined,
            filter.status ? eq(pages.status, filter.status) : undefined,
          ),
        )
        .orderBy(asc(pages.sortOrder), asc(pages.id));
    },
    async insertRevision(values: NewPageRevision): Promise<PageRevisionRow> {
      const [row] = await x.insert(pageRevisions).values(values).returning();
      if (!row) throw new Error('insert page revision returned no row');
      return row;
    },
    async updateRevision(
      id: string,
      patch: PageRevisionPatch,
    ): Promise<PageRevisionRow | undefined> {
      const [row] = await x
        .update(pageRevisions)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(pageRevisions.id, id))
        .returning();
      return row;
    },
    async latestRevision(pageId: string): Promise<PageRevisionRow | undefined> {
      const [row] = await x
        .select()
        .from(pageRevisions)
        .where(eq(pageRevisions.pageId, pageId))
        .orderBy(desc(pageRevisions.revisionNo))
        .limit(1);
      return row;
    },
    async findRevision(pageId: string, revisionId: string): Promise<PageRevisionRow | undefined> {
      const [row] = await x
        .select()
        .from(pageRevisions)
        .where(and(eq(pageRevisions.pageId, pageId), eq(pageRevisions.id, revisionId)))
        .limit(1);
      return row;
    },
    async hasPublishedRevision(pageId: string): Promise<boolean> {
      const rows = await x
        .select({ id: pageRevisions.id })
        .from(pageRevisions)
        .where(and(eq(pageRevisions.pageId, pageId), sql`${pageRevisions.publishedAt} is not null`))
        .limit(1);
      return rows.length > 0;
    },
    async replaceMediaRefs(revisionId: string, mediaIds: string[]): Promise<void> {
      await x.delete(pageMedia).where(eq(pageMedia.revisionId, revisionId));
      const unique = [...new Set(mediaIds)];
      if (unique.length > 0) {
        await x
          .insert(pageMedia)
          .values(unique.map((mediaId) => ({ revisionId, mediaId, role: 'block', sortOrder: 0 })));
      }
    },
  };
}
