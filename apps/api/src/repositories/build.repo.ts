import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  media,
  navigationItems,
  pageRevisions,
  pages,
  projectMedia,
  projectRevisions,
  projects,
  redirects,
  services,
  siteSettings,
} from '@serend/db';
import type { Executor } from './executor.js';

/**
 * Lesezugriffe für /internal/build/*. Jede Abfrage liefert ausschließlich freigegebene Inhalte:
 * Projekte und Seiten nur über `published_revision_id` (nie die neueste Revision), alles andere nur
 * mit Status `published`.
 */
export function buildRepo(x: Executor) {
  async function publishedProjects() {
    return x
      .select({ project: projects, revision: projectRevisions })
      .from(projects)
      .innerJoin(projectRevisions, eq(projectRevisions.id, projects.publishedRevisionId))
      .where(eq(projects.status, 'published'))
      .orderBy(asc(projects.locale), asc(projects.sortOrder), asc(projects.id));
  }

  async function publishedPages() {
    return x
      .select({ page: pages, revision: pageRevisions })
      .from(pages)
      .innerJoin(pageRevisions, eq(pageRevisions.id, pages.publishedRevisionId))
      .where(eq(pages.status, 'published'))
      .orderBy(asc(pages.locale), asc(pages.sortOrder), asc(pages.id));
  }

  return {
    publishedProjects,
    publishedPages,

    async galleries(revisionIds: string[]) {
      if (revisionIds.length === 0) return [];
      return x
        .select()
        .from(projectMedia)
        .where(and(inArray(projectMedia.revisionId, revisionIds), eq(projectMedia.role, 'gallery')))
        .orderBy(asc(projectMedia.sortOrder));
    },

    async services() {
      return x
        .select()
        .from(services)
        .where(eq(services.status, 'published'))
        .orderBy(asc(services.locale), asc(services.sortOrder), asc(services.id));
    },

    /** Navigation nur mit veröffentlichten Zielseiten. */
    async navigation() {
      return x
        .select({ item: navigationItems })
        .from(navigationItems)
        .leftJoin(pages, eq(pages.id, navigationItems.pageId))
        .where(
          and(
            eq(navigationItems.status, 'published'),
            or(isNull(navigationItems.pageId), eq(pages.status, 'published')),
          ),
        )
        .orderBy(
          asc(navigationItems.locale),
          asc(navigationItems.location),
          asc(navigationItems.sortOrder),
        );
    },

    async settings() {
      return x.select().from(siteSettings).orderBy(asc(siteSettings.key), asc(siteSettings.locale));
    },

    async redirects() {
      return x.select().from(redirects).orderBy(asc(redirects.fromPath));
    },

    /** IDs aller Medien, die von veröffentlichtem Inhalt verwendet werden. */
    async referencedMediaIds(): Promise<string[]> {
      const rows = await x.execute<{ id: string }>(sql`
        select cover_media_id as id from project_revisions r join projects p on p.published_revision_id = r.id where p.status = 'published' and cover_media_id is not null
        union select og_media_id from project_revisions r join projects p on p.published_revision_id = r.id where p.status = 'published' and og_media_id is not null
        union select pm.media_id from project_media pm join projects p on p.published_revision_id = pm.revision_id where p.status = 'published'
        union select og_media_id from page_revisions r join pages p on p.published_revision_id = r.id where p.status = 'published' and og_media_id is not null
        union select pm.media_id from page_media pm join pages p on p.published_revision_id = pm.revision_id where p.status = 'published'
        union select media_id from site_settings where media_id is not null
      `);
      return rows.rows.map((r) => r.id);
    },

    async mediaByIds(ids: string[]) {
      if (ids.length === 0) return [];
      return x.select().from(media).where(inArray(media.id, ids)).orderBy(asc(media.id));
    },
  };
}
