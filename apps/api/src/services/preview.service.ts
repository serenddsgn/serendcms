import { eq } from 'drizzle-orm';
import { pageMedia, type Database } from '@serend/db';
import {
  ROUTE_SEGMENTS,
  pagePath,
  projectPath,
  type BuildMedia,
  type BuildPage,
  type BuildProject,
  type Locale,
} from '@serend/schema';
import { errors } from '../lib/errors.js';
import { signPreviewToken, verifyPreviewToken, type PreviewPayload } from '../lib/preview-token.js';
import { buildRepo } from '../repositories/build.repo.js';
import { pagesRepo } from '../repositories/pages.repo.js';
import { projectsRepo } from '../repositories/projects.repo.js';
import type { AppConfig } from '../config.js';
import type { BuildService_ } from './build.service.js';
import { upgradeContent, type ProjectContent } from '@serend/schema';

/** Signierte Vorschau-Links (max. 15 Min.) und das Datenpaket, aus dem die Vorschau-Seite rendert. */
export function createPreviewService({
  db,
  config,
  buildService,
}: {
  db: Database;
  config: Pick<AppConfig, 'previewSigningKey' | 'previewUrl'>;
  buildService: BuildService_;
}) {
  async function link(target: { k: 'project' | 'page'; id: string }) {
    let path: string;
    if (target.k === 'project') {
      const project = await projectsRepo(db).findProject(target.id);
      const latest = project && (await projectsRepo(db).latestRevision(project.id));
      if (!project || !latest) throw errors.notFound('Projekt nicht gefunden.');
      path = `${projectPath(project.locale as Locale, latest.slug)}/`;
    } else {
      const page = await pagesRepo(db).findPage(target.id);
      const latest = page && (await pagesRepo(db).latestRevision(page.id));
      if (!page || !latest) throw errors.notFound('Seite nicht gefunden.');
      const locale = page.locale as Locale;
      path =
        page.systemKey === 'home'
          ? `/${locale}/`
          : page.systemKey === 'projects'
            ? `/${locale}/${ROUTE_SEGMENTS[locale].projects}/`
            : `${pagePath(locale, latest.slug)}/`;
    }
    const { token, expiresAt } = signPreviewToken(config.previewSigningKey, target);
    return {
      url: `${config.previewUrl}${path}?preview=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return {
    projectLink: (id: string) => link({ k: 'project', id }),
    pageLink: (id: string) => link({ k: 'page', id }),

    verify(token: string): PreviewPayload {
      const payload = verifyPreviewToken(config.previewSigningKey, token);
      if (!payload) throw errors.unauthenticated();
      return payload;
    },

    /**
     * Veröffentlichter Stand, in dem der betrachtete Inhalt durch seine **neueste** Revision ersetzt ist
     * (oder ergänzt wird, wenn er noch nicht veröffentlicht ist). Nur über ein gültiges Vorschau-Token erreichbar.
     */
    async bundle(payload: PreviewPayload) {
      const [projects, pages, services, navigation, settings, redirects] = await Promise.all([
        buildService.projects(),
        buildService.pages(),
        buildService.services(),
        buildService.navigation(),
        buildService.settings(),
        buildService.redirects(),
      ]);
      const mediaIds = new Set((await buildService.media()).map((m) => m.id));
      const extraMedia: string[] = [];

      if (payload.k === 'project') {
        const repo = projectsRepo(db);
        const project = await repo.findProject(payload.id);
        const latest = project && (await repo.latestRevision(project.id));
        if (!project || !latest) throw errors.notFound('Projekt nicht gefunden.');
        const gallery = await repo.galleryOf(latest.id);
        const draft: BuildProject = {
          id: project.id,
          locale: project.locale as Locale,
          translationGroupId: project.translationGroupId,
          featured: project.featured,
          featuredSortOrder: project.featuredSortOrder,
          sortOrder: project.sortOrder,
          revision: {
            id: latest.id,
            slug: latest.slug,
            title: latest.title,
            subtitle: latest.subtitle as BuildProject['revision']['subtitle'],
            year: latest.year,
            categories: latest.categories as BuildProject['revision']['categories'],
            color: latest.color,
            tileColor: latest.tileColor,
            client: latest.client,
            liveUrl: latest.liveUrl,
            coverMediaId: latest.coverMediaId,
            nextProjectId: latest.nextProjectId,
            content: upgradeContent(latest.content, latest.schemaVersion) as ProjectContent,
            gallery: gallery.map((g) => ({ mediaId: g.mediaId, altOverride: g.altOverride })),
            seoTitle: latest.seoTitle,
            seoDescription: latest.seoDescription,
            ogMediaId: latest.ogMediaId,
            publishedAt: latest.updatedAt.toISOString(),
          },
        };
        const i = projects.findIndex((p) => p.id === project.id);
        if (i >= 0) projects[i] = draft;
        else projects.push(draft);
        projects.sort((a, b) => a.locale.localeCompare(b.locale) || a.sortOrder - b.sortOrder);
        extraMedia.push(
          ...(latest.coverMediaId ? [latest.coverMediaId] : []),
          ...(latest.ogMediaId ? [latest.ogMediaId] : []),
          ...gallery.map((g) => g.mediaId),
        );
      } else {
        const repo = pagesRepo(db);
        const page = await repo.findPage(payload.id);
        const latest = page && (await repo.latestRevision(page.id));
        if (!page || !latest) throw errors.notFound('Seite nicht gefunden.');
        const draft: BuildPage = {
          id: page.id,
          locale: page.locale as Locale,
          translationGroupId: page.translationGroupId,
          systemKey: page.systemKey as BuildPage['systemKey'],
          revision: {
            id: latest.id,
            slug: latest.slug,
            title: latest.title,
            content: upgradeContent(latest.content, latest.schemaVersion),
            seoTitle: latest.seoTitle,
            seoDescription: latest.seoDescription,
            ogMediaId: latest.ogMediaId,
            publishedAt: latest.updatedAt.toISOString(),
          },
        };
        const i = pages.findIndex((p) => p.id === page.id);
        if (i >= 0) pages[i] = draft;
        else pages.push(draft);
        for (const r of await db
          .select({ id: pageMedia.mediaId })
          .from(pageMedia)
          .where(eq(pageMedia.revisionId, latest.id)))
          extraMedia.push(r.id);
        if (latest.ogMediaId) extraMedia.push(latest.ogMediaId);
      }
      for (const id of extraMedia) mediaIds.add(id);
      const media: BuildMedia[] = (await buildRepo(db).mediaByIds([...mediaIds])).map((m) => ({
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
      return {
        target: { kind: payload.k, id: payload.id },
        projects,
        pages,
        services,
        navigation,
        settings,
        media,
        redirects,
      };
    },

    /** Dateien nur für Medien, die im Vorschau-Paket vorkommen. */
    async mediaFile(payload: PreviewPayload, mediaId: string) {
      const bundle = await this.bundle(payload);
      if (!bundle.media.some((m) => m.id === mediaId))
        throw errors.notFound('Medium nicht gefunden.');
      return mediaId;
    },
  };
}

export type PreviewService = ReturnType<typeof createPreviewService>;
