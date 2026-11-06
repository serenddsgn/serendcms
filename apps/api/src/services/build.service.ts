import type { Database } from '@serend/db';
import {
  parseSetting,
  upgradeContent,
  type BuildManifest,
  type BuildMedia,
  type BuildNavItem,
  type BuildPage,
  type BuildProject,
  type BuildRedirect,
  type BuildService,
  type BuildSetting,
  type Locale,
  type ProjectContent,
  type SettingKey,
} from '@serend/schema';
import { buildRepo } from '../repositories/build.repo.js';
import { errors } from '../lib/errors.js';
import { StorageNotFoundError, type Storage } from '../storage/storage.js';

/** Alles, was Astro beim Build sehen darf: ausschließlich freigegebene Inhalte. */
export function createBuildService({ db, storage }: { db: Database; storage: Storage }) {
  const repo = buildRepo(db);

  async function projects(): Promise<BuildProject[]> {
    const rows = await repo.publishedProjects();
    const galleries = await repo.galleries(rows.map((r) => r.revision.id));
    return rows.map(({ project, revision }) => ({
      id: project.id,
      locale: project.locale as Locale,
      translationGroupId: project.translationGroupId,
      featured: project.featured,
      featuredSortOrder: project.featuredSortOrder,
      sortOrder: project.sortOrder,
      revision: {
        id: revision.id,
        slug: revision.slug,
        title: revision.title,
        subtitle: revision.subtitle as BuildProject['revision']['subtitle'],
        year: revision.year,
        categories: revision.categories as BuildProject['revision']['categories'],
        color: revision.color,
        tileColor: revision.tileColor,
        client: revision.client,
        liveUrl: revision.liveUrl,
        coverMediaId: revision.coverMediaId,
        nextProjectId: revision.nextProjectId,
        content: upgradeContent(revision.content, revision.schemaVersion) as ProjectContent,
        gallery: galleries
          .filter((g) => g.revisionId === revision.id)
          .map((g) => ({ mediaId: g.mediaId, altOverride: g.altOverride })),
        seoTitle: revision.seoTitle,
        seoDescription: revision.seoDescription,
        ogMediaId: revision.ogMediaId,
        // Veröffentlichte Revisionen haben immer einen Zeitstempel.
        publishedAt: (revision.publishedAt ?? revision.createdAt).toISOString(),
      },
    }));
  }

  async function pages(): Promise<BuildPage[]> {
    return (await repo.publishedPages()).map(({ page, revision }) => ({
      id: page.id,
      locale: page.locale as Locale,
      translationGroupId: page.translationGroupId,
      systemKey: page.systemKey as BuildPage['systemKey'],
      revision: {
        id: revision.id,
        slug: revision.slug,
        title: revision.title,
        content: upgradeContent(revision.content, revision.schemaVersion),
        seoTitle: revision.seoTitle,
        seoDescription: revision.seoDescription,
        ogMediaId: revision.ogMediaId,
        publishedAt: (revision.publishedAt ?? revision.createdAt).toISOString(),
      },
    }));
  }

  async function media(): Promise<BuildMedia[]> {
    const ids = [...new Set(await repo.referencedMediaIds())];
    return (await repo.mediaByIds(ids)).map((m) => ({
      id: m.id,
      storageKey: m.storageKey,
      mime: m.mime,
      width: m.width,
      height: m.height,
      byteSize: m.byteSize,
      sha256: m.sha256,
      altText: m.altText,
      focalX: m.focalX,
      focalY: m.focalY,
    }));
  }

  return {
    projects,
    pages,
    media,

    async services(): Promise<BuildService[]> {
      return (await repo.services()).map((s) => ({
        id: s.id,
        locale: s.locale as Locale,
        translationGroupId: s.translationGroupId,
        key: s.key as BuildService['key'],
        name: s.name,
        description: s.description,
        sortOrder: s.sortOrder,
      }));
    },

    async navigation(): Promise<BuildNavItem[]> {
      return (await repo.navigation()).map(({ item }) => ({
        id: item.id,
        locale: item.locale as Locale,
        location: item.location as BuildNavItem['location'],
        label: item.label,
        target: item.pageId
          ? { kind: 'page' as const, pageId: item.pageId, fragment: item.fragment }
          : { kind: 'url' as const, url: item.url ?? '' },
        sortOrder: item.sortOrder,
      }));
    },

    async settings(): Promise<BuildSetting[]> {
      // Jeder Wert wird mit dem Schema seines Keys validiert; ein ungültiger Wert bricht den Build ab.
      return (await repo.settings()).map((s) => ({
        key: s.key as SettingKey,
        locale: s.locale as Locale,
        value: parseSetting(s.key as SettingKey, s.value),
      }));
    },

    async redirects(): Promise<BuildRedirect[]> {
      return (await repo.redirects()).map((r) => ({ fromPath: r.fromPath, toPath: r.toPath }));
    },

    async manifest(): Promise<BuildManifest> {
      const [p, pg, svc, nav, set, med, red] = await Promise.all([
        repo.publishedProjects(),
        repo.publishedPages(),
        repo.services(),
        repo.navigation(),
        repo.settings(),
        media(),
        repo.redirects(),
      ]);
      return {
        counts: {
          projects: p.length,
          pages: pg.length,
          services: svc.length,
          navigation: nav.length,
          settings: set.length,
          media: med.length,
          redirects: red.length,
        },
        projectRevisionIds: p.map((r) => r.revision.id),
        pageRevisionIds: pg.map((r) => r.revision.id),
      };
    },

    /** Für die Vorschau: Datei ohne Prüfung auf veröffentlichte Verwendung (die Vorschau prüft selbst). */
    async mediaFileUnchecked(id: string): Promise<{ buffer: Buffer; mime: string }> {
      const [row] = await repo.mediaByIds([id]);
      if (!row) throw errors.notFound('Medium nicht gefunden.');
      try {
        return { buffer: await storage.get(row.storageKey), mime: row.mime };
      } catch (err) {
        if (err instanceof StorageNotFoundError) throw errors.notFound('Datei nicht gefunden.');
        throw err;
      }
    },

    /** Dateien nur für Medien, die von veröffentlichtem Inhalt verwendet werden. */
    async mediaFile(id: string): Promise<{ buffer: Buffer; mime: string }> {
      const allowed = new Set(await repo.referencedMediaIds());
      if (!allowed.has(id)) throw errors.notFound('Medium nicht gefunden.');
      const [row] = await repo.mediaByIds([id]);
      if (!row) throw errors.notFound('Medium nicht gefunden.');
      try {
        return { buffer: await storage.get(row.storageKey), mime: row.mime };
      } catch (err) {
        if (err instanceof StorageNotFoundError) throw errors.notFound('Datei nicht gefunden.');
        throw err;
      }
    },
  };
}

export type BuildService_ = ReturnType<typeof createBuildService>;
