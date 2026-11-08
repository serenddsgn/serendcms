import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import {
  projectMedia,
  projectRevisions,
  projects,
  redirects,
  slugClaims,
  type ProjectMediaRow,
  type ProjectRevisionRow,
  type ProjectRow,
} from '@serend/db';
import type { Executor } from './executor.js';

export type NewRevision = typeof projectRevisions.$inferInsert;
export type RevisionPatch = Partial<
  Omit<NewRevision, 'id' | 'projectId' | 'revisionNo' | 'createdAt'>
>;

export interface ProjectWithLatest {
  project: ProjectRow;
  latest: ProjectRevisionRow;
}

export function projectsRepo(x: Executor) {
  return {
    // ── Projekte ────────────────────────────────────────────────────
    async insertProject(values: typeof projects.$inferInsert): Promise<ProjectRow> {
      const [row] = await x.insert(projects).values(values).returning();
      if (!row) throw new Error('insert project returned no row');
      return row;
    },
    async findProject(id: string): Promise<ProjectRow | undefined> {
      const [row] = await x.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row;
    },
    /** Sperrt die Zeile bis zum Transaktionsende (serialisiert Bearbeiten und Veröffentlichen). */
    async lockProject(id: string): Promise<ProjectRow | undefined> {
      const [row] = await x
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .for('update')
        .limit(1);
      return row;
    },
    async updateProject(
      id: string,
      patch: Partial<typeof projects.$inferInsert>,
    ): Promise<ProjectRow | undefined> {
      const [row] = await x
        .update(projects)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(projects.id, id))
        .returning();
      return row;
    },
    async deleteProject(id: string): Promise<void> {
      await x.delete(projects).where(eq(projects.id, id));
    },
    async maxSortOrder(locale: string): Promise<number> {
      const [r] = await x
        .select({ m: max(projects.sortOrder) })
        .from(projects)
        .where(eq(projects.locale, locale));
      return r?.m ?? -1;
    },
    async maxFeaturedOrder(locale: string): Promise<number> {
      const [r] = await x
        .select({ m: max(projects.featuredSortOrder) })
        .from(projects)
        .where(eq(projects.locale, locale));
      return r?.m ?? -1;
    },
    /** Hängt die Zeile an eine Übersetzungsgruppe; ohne `groupId` bekommt sie eine neue (Verknüpfung lösen). */
    async setGroup(id: string, groupId: string | null): Promise<void> {
      await x
        .update(projects)
        .set({ translationGroupId: groupId ?? sql`uuidv7()`, updatedAt: sql`now()` })
        .where(eq(projects.id, id));
    },
    async groupSize(groupId: string): Promise<number> {
      const rows = await x
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.translationGroupId, groupId));
      return rows.length;
    },
    async groupHasLocale(groupId: string, locale: string): Promise<boolean> {
      const rows = await x
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.translationGroupId, groupId), eq(projects.locale, locale)))
        .limit(1);
      return rows.length > 0;
    },
    async featuredInLocale(locale: string): Promise<ProjectRow[]> {
      return x
        .select()
        .from(projects)
        .where(and(eq(projects.locale, locale), eq(projects.featured, true)));
    },
    async findInGroup(groupId: string, locale: string): Promise<ProjectRow | undefined> {
      const [row] = await x
        .select()
        .from(projects)
        .where(and(eq(projects.translationGroupId, groupId), eq(projects.locale, locale)))
        .limit(1);
      return row;
    },
    async findManyByIds(ids: string[]): Promise<ProjectRow[]> {
      if (ids.length === 0) return [];
      return x.select().from(projects).where(inArray(projects.id, ids));
    },
    async setSortOrder(id: string, sortOrder: number): Promise<void> {
      await x
        .update(projects)
        .set({ sortOrder, updatedAt: sql`now()` })
        .where(eq(projects.id, id));
    },

    /** Alle Projekte (optional gefiltert) mit ihrer neuesten Revision. */
    async listWithLatest(filter: {
      locale?: string;
      status?: string;
    }): Promise<ProjectWithLatest[]> {
      const rows = await x
        .select({ project: projects, latest: projectRevisions })
        .from(projects)
        .innerJoin(
          projectRevisions,
          and(
            eq(projectRevisions.projectId, projects.id),
            eq(
              projectRevisions.revisionNo,
              sql`(select max(r2.revision_no) from project_revisions r2 where r2.project_id = ${projects.id})`,
            ),
          ),
        )
        .where(
          and(
            filter.locale ? eq(projects.locale, filter.locale) : undefined,
            filter.status ? eq(projects.status, filter.status) : undefined,
          ),
        )
        .orderBy(asc(projects.sortOrder), asc(projects.id));
      return rows;
    },

    // ── Revisionen ──────────────────────────────────────────────────
    async insertRevision(values: NewRevision): Promise<ProjectRevisionRow> {
      const [row] = await x.insert(projectRevisions).values(values).returning();
      if (!row) throw new Error('insert revision returned no row');
      return row;
    },
    async updateRevision(
      id: string,
      patch: RevisionPatch,
    ): Promise<ProjectRevisionRow | undefined> {
      const [row] = await x
        .update(projectRevisions)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(projectRevisions.id, id))
        .returning();
      return row;
    },
    async latestRevision(projectId: string): Promise<ProjectRevisionRow | undefined> {
      const [row] = await x
        .select()
        .from(projectRevisions)
        .where(eq(projectRevisions.projectId, projectId))
        .orderBy(desc(projectRevisions.revisionNo))
        .limit(1);
      return row;
    },
    async findRevision(
      projectId: string,
      revisionId: string,
    ): Promise<ProjectRevisionRow | undefined> {
      const [row] = await x
        .select()
        .from(projectRevisions)
        .where(and(eq(projectRevisions.projectId, projectId), eq(projectRevisions.id, revisionId)))
        .limit(1);
      return row;
    },
    async listRevisions(projectId: string): Promise<ProjectRevisionRow[]> {
      return x
        .select()
        .from(projectRevisions)
        .where(eq(projectRevisions.projectId, projectId))
        .orderBy(desc(projectRevisions.revisionNo));
    },
    async hasPublishedRevision(projectId: string): Promise<boolean> {
      const rows = await x
        .select({ id: projectRevisions.id })
        .from(projectRevisions)
        .where(
          and(
            eq(projectRevisions.projectId, projectId),
            sql`${projectRevisions.publishedAt} is not null`,
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    // ── Medienbezüge ────────────────────────────────────────────────
    async galleryOf(revisionId: string): Promise<ProjectMediaRow[]> {
      return x
        .select()
        .from(projectMedia)
        .where(and(eq(projectMedia.revisionId, revisionId), eq(projectMedia.role, 'gallery')))
        .orderBy(asc(projectMedia.sortOrder));
    },
    async refsOf(revisionId: string): Promise<ProjectMediaRow[]> {
      return x.select().from(projectMedia).where(eq(projectMedia.revisionId, revisionId));
    },
    /** Ersetzt Galerie und abgeleitete Block-Referenzen einer Revision. */
    async replaceMediaRefs(
      revisionId: string,
      gallery: { mediaId: string; altOverride: string | null }[],
      blockMediaIds: string[],
    ): Promise<void> {
      await x.delete(projectMedia).where(eq(projectMedia.revisionId, revisionId));
      const galleryIds = new Set<string>();
      const rows: (typeof projectMedia.$inferInsert)[] = [];
      gallery.forEach((g, i) => {
        if (galleryIds.has(g.mediaId)) return; // pro Revision jedes Medium höchstens einmal je Rolle
        galleryIds.add(g.mediaId);
        rows.push({
          revisionId,
          mediaId: g.mediaId,
          role: 'gallery',
          sortOrder: i,
          altOverride: g.altOverride,
        });
      });
      for (const mediaId of new Set(blockMediaIds)) {
        rows.push({ revisionId, mediaId, role: 'block', sortOrder: 0, altOverride: null });
      }
      if (rows.length > 0) await x.insert(projectMedia).values(rows);
    },

    // ── Slug-Claims ─────────────────────────────────────────────────
    async claimOwner(locale: string, scope: string, slug: string): Promise<string | undefined> {
      const [row] = await x
        .select({ ownerId: slugClaims.ownerId })
        .from(slugClaims)
        .where(
          and(
            eq(slugClaims.locale, locale),
            eq(slugClaims.scope, scope),
            eq(slugClaims.slug, slug),
          ),
        )
        .limit(1);
      return row?.ownerId;
    },
    async replaceClaims(
      ownerId: string,
      locale: string,
      scope: string,
      slugs: string[],
    ): Promise<void> {
      await x.delete(slugClaims).where(eq(slugClaims.ownerId, ownerId));
      const unique = [...new Set(slugs)];
      if (unique.length > 0) {
        await x.insert(slugClaims).values(unique.map((slug) => ({ locale, scope, slug, ownerId })));
      }
    },
    async deleteClaims(ownerId: string): Promise<void> {
      await x.delete(slugClaims).where(eq(slugClaims.ownerId, ownerId));
    },

    // ── Redirects ───────────────────────────────────────────────────
    /** Ein veröffentlichter Pfad darf nicht gleichzeitig weiterleiten. */
    async clearRedirectFrom(path: string): Promise<void> {
      await x.delete(redirects).where(eq(redirects.fromPath, path));
    },
    /** Legt 301 von `from` nach `to` an, biegt bestehende Redirects auf `from` um und entfernt Schleifen. */
    async redirectMoved(locale: string, from: string, to: string): Promise<void> {
      if (from === to) return;
      await x.delete(redirects).where(eq(redirects.fromPath, to));
      await x.update(redirects).set({ toPath: to }).where(eq(redirects.toPath, from));
      await x
        .insert(redirects)
        .values({ locale, fromPath: from, toPath: to, source: 'auto' })
        .onConflictDoUpdate({ target: redirects.fromPath, set: { toPath: to, source: 'auto' } });
      // durch das Umbiegen kann ein Eintrag auf sich selbst zeigen
      await x.delete(redirects).where(eq(redirects.fromPath, redirects.toPath));
    },
  };
}
