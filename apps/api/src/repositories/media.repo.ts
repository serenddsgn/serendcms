import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { media, type MediaRow } from '@serend/db';
import type { Executor } from './executor.js';

export type MediaWithUsage = MediaRow & { inUse: boolean };

/** Verwendungsprüfung für die Anzeige; der eigentliche Schutz sind die FKs mit ON DELETE RESTRICT. */
const inUseSql = sql<boolean>`(
  exists (select 1 from project_revisions r where r.cover_media_id = "media"."id" or r.og_media_id = "media"."id")
  or exists (select 1 from project_media pm where pm.media_id = "media"."id")
)`;

export function mediaRepo(x: Executor) {
  return {
    async insert(values: typeof media.$inferInsert): Promise<MediaRow> {
      const [row] = await x.insert(media).values(values).returning();
      if (!row) throw new Error('insert media returned no row');
      return row;
    },
    async findById(id: string): Promise<MediaWithUsage | undefined> {
      const [row] = await x
        .select({ ...mediaColumns(), inUse: inUseSql })
        .from(media)
        .where(eq(media.id, id))
        .limit(1);
      return row;
    },
    async findManyByIds(ids: string[]): Promise<MediaRow[]> {
      if (ids.length === 0) return [];
      return x.select().from(media).where(inArray(media.id, ids));
    },
    async list(limit: number, offset: number): Promise<{ rows: MediaWithUsage[]; total: number }> {
      const rows = await x
        .select({ ...mediaColumns(), inUse: inUseSql })
        .from(media)
        .orderBy(desc(media.createdAt), desc(media.id))
        .limit(limit)
        .offset(offset);
      const [c] = await x.select({ n: count() }).from(media);
      return { rows, total: c?.n ?? 0 };
    },
    async update(
      id: string,
      patch: Partial<Pick<MediaRow, 'altText' | 'focalX' | 'focalY'>>,
    ): Promise<MediaRow | undefined> {
      const [row] = await x.update(media).set(patch).where(eq(media.id, id)).returning();
      return row;
    },
    async delete(id: string): Promise<MediaRow | undefined> {
      const [row] = await x.delete(media).where(eq(media.id, id)).returning();
      return row;
    },
  };
}

function mediaColumns() {
  return {
    id: media.id,
    storageKey: media.storageKey,
    originalFilename: media.originalFilename,
    mime: media.mime,
    byteSize: media.byteSize,
    width: media.width,
    height: media.height,
    sha256: media.sha256,
    altText: media.altText,
    focalX: media.focalX,
    focalY: media.focalY,
    createdBy: media.createdBy,
    createdAt: media.createdAt,
  };
}
