import type { Database, ProjectRevisionRow, ProjectRow } from '@serend/db';
import {
  CONTENT_SCHEMA_VERSION,
  collectMediaIds,
  projectPath,
  type Locale,
  type ProjectRevisionInput,
} from '@serend/schema';
import { AppError, errors } from '../lib/errors.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import type { Executor } from '../repositories/executor.js';
import { mediaRepo } from '../repositories/media.repo.js';
import { projectsRepo, type NewRevision } from '../repositories/projects.repo.js';
import { toProjectDto, toRevisionDto } from './dto.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ProjectsServiceDeps {
  db: Database;
  /** Wird nach jeder Änderung am veröffentlichten Stand aufgerufen (Phase 4: Build-Job anlegen). */
  onPublishedChange?: () => Promise<void>;
}

const validation = (msg: string) => new AppError(400, 'validation_error', msg);

function revisionValues(
  input: ProjectRevisionInput,
): Omit<NewRevision, 'id' | 'projectId' | 'revisionNo'> {
  return {
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    year: input.year,
    categories: input.categories,
    color: input.color,
    tileColor: input.tileColor,
    client: input.client,
    liveUrl: input.liveUrl,
    coverMediaId: input.coverMediaId,
    nextProjectId: input.nextProjectId,
    content: input.content,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    ogMediaId: input.ogMediaId,
  };
}

export function createProjectsService({ db, onPublishedChange }: ProjectsServiceDeps) {
  async function loadDetail(x: Executor, project: ProjectRow) {
    const repo = projectsRepo(x);
    const latest = await repo.latestRevision(project.id);
    if (!latest) throw new Error(`project ${project.id} has no revision`);
    const published =
      project.publishedRevisionId === null
        ? undefined
        : project.publishedRevisionId === latest.id
          ? latest
          : await repo.findRevision(project.id, project.publishedRevisionId);
    return {
      project: toProjectDto(project),
      latest: toRevisionDto(latest, await repo.galleryOf(latest.id)),
      published: published ? toRevisionDto(published, await repo.galleryOf(published.id)) : null,
      hasUnpublishedChanges: latest.id !== project.publishedRevisionId,
    };
  }

  async function lockOrFail(tx: Tx, id: string): Promise<ProjectRow> {
    const project = await projectsRepo(tx).lockProject(id);
    if (!project) throw errors.notFound('Projekt nicht gefunden.');
    return project;
  }

  /** Prüft alle Verweise der Eingabe, bevor etwas geschrieben wird (saubere 400 statt FK-Fehler). */
  async function assertRefs(
    tx: Tx,
    input: ProjectRevisionInput,
    locale: string,
    selfId?: string,
  ): Promise<void> {
    const wanted = [
      ...new Set([
        ...collectMediaIds(input.content),
        ...input.gallery.map((g) => g.mediaId),
        ...(input.coverMediaId ? [input.coverMediaId] : []),
        ...(input.ogMediaId ? [input.ogMediaId] : []),
      ]),
    ];
    const found = await mediaRepo(tx).findManyByIds(wanted);
    if (found.length !== wanted.length)
      throw validation('Ein referenziertes Medium existiert nicht.');
    if (input.ogMediaId && found.find((m) => m.id === input.ogMediaId)?.mime.startsWith('video/'))
      throw validation('Das Social-Media-Bild muss ein Bild sein, kein Video.');

    if (input.nextProjectId) {
      const next = await projectsRepo(tx).findProject(input.nextProjectId);
      if (!next || next.id === selfId || next.locale !== locale) {
        throw validation('„Nächstes Projekt“ muss ein anderes Projekt derselben Sprache sein.');
      }
    }
  }

  /** Schreibt Medienbezüge und gleicht die Slug-Claims ab (Verweise sind bereits geprüft). */
  async function syncRevision(
    tx: Tx,
    project: ProjectRow,
    revision: ProjectRevisionRow,
    input: ProjectRevisionInput,
  ): Promise<void> {
    const repo = projectsRepo(tx);
    await repo.replaceMediaRefs(revision.id, input.gallery, collectMediaIds(input.content));
    const publishedSlug =
      project.publishedRevisionId && project.publishedRevisionId !== revision.id
        ? (await repo.findRevision(project.id, project.publishedRevisionId))?.slug
        : undefined;
    await claimSlugs(tx, project, [publishedSlug, revision.slug]);
  }

  async function claimSlugs(
    tx: Tx,
    project: ProjectRow,
    slugs: (string | undefined)[],
  ): Promise<void> {
    const repo = projectsRepo(tx);
    const wanted = slugs.filter((s): s is string => Boolean(s));
    for (const slug of wanted) {
      const owner = await repo.claimOwner(project.locale, 'project', slug);
      if (owner && owner !== project.id)
        throw errors.conflict(`Der Slug „${slug}“ ist bereits vergeben.`);
    }
    try {
      await repo.replaceClaims(project.id, project.locale, 'project', wanted);
    } catch (err) {
      if (isUniqueViolation(err)) throw errors.conflict('Der Slug ist bereits vergeben.');
      throw err;
    }
  }

  /** Veröffentlichbar heißt: Cover vorhanden und alle Bilder haben einen Alt-Text in der Sprache des Projekts. */
  async function assertPublishable(
    tx: Tx,
    project: ProjectRow,
    revision: ProjectRevisionRow,
  ): Promise<void> {
    const repo = projectsRepo(tx);
    const problems: string[] = [];
    if (!revision.coverMediaId) problems.push('Cover-Bild fehlt');
    const gallery = await repo.galleryOf(revision.id);
    const ids = [
      ...(revision.coverMediaId ? [revision.coverMediaId] : []),
      ...gallery.map((g) => g.mediaId),
    ];
    const medias = new Map((await mediaRepo(tx).findManyByIds(ids)).map((m) => [m.id, m]));
    const altOf = (mediaId: string, override?: string | null) =>
      override?.trim() || medias.get(mediaId)?.altText[project.locale]?.trim();
    if (revision.coverMediaId && !altOf(revision.coverMediaId))
      problems.push('Alt-Text des Covers fehlt');
    gallery.forEach((g, i) => {
      if (!altOf(g.mediaId, g.altOverride))
        problems.push(`Alt-Text für Galeriebild ${i + 1} fehlt`);
    });
    if (problems.length > 0) throw validation(`Nicht veröffentlichbar: ${problems.join('; ')}.`);
  }

  async function notify(): Promise<void> {
    await onPublishedChange?.();
  }

  return {
    async list(filter: { locale?: string | undefined; status?: string | undefined }) {
      const rows = await projectsRepo(db).listWithLatest(filter);
      return rows.map(({ project, latest }) => ({
        ...toProjectDto(project),
        title: latest.title,
        slug: latest.slug,
        year: latest.year,
        categories: latest.categories as ('web' | 'shop' | 'brand' | 'print')[],
        color: latest.color,
        coverMediaId: latest.coverMediaId,
        hasUnpublishedChanges: latest.id !== project.publishedRevisionId,
      }));
    },

    async get(id: string) {
      const project = await projectsRepo(db).findProject(id);
      if (!project) throw errors.notFound('Projekt nicht gefunden.');
      return loadDetail(db, project);
    },

    async create(
      actorId: string,
      body: ProjectRevisionInput & {
        locale: Locale;
        translationGroupId?: string | undefined;
        featured: boolean;
      },
    ) {
      return db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        await assertRefs(tx, body, body.locale);
        if (
          body.translationGroupId &&
          (await repo.groupHasLocale(body.translationGroupId, body.locale))
        ) {
          throw errors.conflict('Für diese Sprache existiert bereits eine Version.');
        }
        const project = await repo.insertProject({
          locale: body.locale,
          ...(body.translationGroupId && { translationGroupId: body.translationGroupId }),
          featured: body.featured,
          featuredSortOrder: body.featured ? (await repo.maxFeaturedOrder(body.locale)) + 1 : null,
          sortOrder: (await repo.maxSortOrder(body.locale)) + 1,
        });
        const revision = await repo.insertRevision({
          projectId: project.id,
          revisionNo: 1,
          createdBy: actorId,
          ...revisionValues(body),
        });
        await syncRevision(tx, project, revision, body);
        return loadDetail(tx, project);
      });
    },

    /** Entwurf speichern: ändert nur die Entwurfsrevision; ist die neueste Revision veröffentlicht, entsteht eine neue. */
    async saveDraft(
      actorId: string,
      id: string,
      body: ProjectRevisionInput & { expectedRevisionNo?: number | undefined },
    ) {
      return db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if (project.status === 'archived') {
          throw errors.conflict('Archivierte Projekte müssen zuerst wiederhergestellt werden.');
        }
        await assertRefs(tx, body, project.locale, id);
        const latest = await repo.latestRevision(id);
        if (!latest) throw new Error('missing revision');
        if (
          body.expectedRevisionNo !== undefined &&
          body.expectedRevisionNo !== latest.revisionNo
        ) {
          throw errors.conflict('Das Projekt wurde zwischenzeitlich geändert. Bitte neu laden.');
        }
        let revision: ProjectRevisionRow;
        if (latest.publishedAt) {
          revision = await repo.insertRevision({
            projectId: id,
            revisionNo: latest.revisionNo + 1,
            createdBy: actorId,
            ...revisionValues(body),
          });
        } else {
          const updated = await repo.updateRevision(latest.id, revisionValues(body));
          if (!updated) throw errors.notFound('Revision nicht gefunden.');
          revision = updated;
        }
        await syncRevision(tx, project, revision, body);
        await repo.updateProject(id, {});
        return loadDetail(tx, (await repo.findProject(id))!);
      });
    },

    async update(
      id: string,
      patch: {
        featured?: boolean | undefined;
        featuredSortOrder?: number | null | undefined;
        sortOrder?: number | undefined;
      },
    ) {
      return db
        .transaction(async (tx) => {
          const repo = projectsRepo(tx);
          const project = await lockOrFail(tx, id);
          const featured = patch.featured ?? project.featured;
          let featuredSortOrder = patch.featuredSortOrder ?? project.featuredSortOrder;
          if (!featured) featuredSortOrder = null;
          else if (featuredSortOrder === null)
            featuredSortOrder = (await repo.maxFeaturedOrder(project.locale)) + 1;
          const updated = await repo.updateProject(id, {
            featured,
            featuredSortOrder,
            ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
          });
          const detail = await loadDetail(tx, updated!);
          return { detail, published: project.status === 'published' };
        })
        .then(async (r) => {
          if (r.published) await notify();
          return r.detail;
        });
    },

    async order(locale: Locale, ids: string[]): Promise<void> {
      if (new Set(ids).size !== ids.length) throw validation('IDs müssen eindeutig sein.');
      await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const rows = await repo.findManyByIds(ids);
        if (rows.length !== ids.length || rows.some((r) => r.locale !== locale)) {
          throw validation('Unbekannte Projekte oder falsche Sprache.');
        }
        for (const [i, id] of ids.entries()) await repo.setSortOrder(id, i);
      });
      await notify();
    },

    async publish(id: string) {
      const detail = await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if (project.status === 'archived')
          throw errors.conflict('Archivierte Projekte können nicht veröffentlicht werden.');
        const latest = await repo.latestRevision(id);
        if (!latest) throw new Error('missing revision');
        if (latest.id === project.publishedRevisionId)
          throw errors.conflict('Keine unveröffentlichten Änderungen.');
        await assertPublishable(tx, project, latest);

        const previous = project.publishedRevisionId
          ? await repo.findRevision(id, project.publishedRevisionId)
          : undefined;
        // Nach „Zurück zum Entwurf“ ist die neueste Revision bereits veröffentlicht gewesen: erneut live schalten.
        if (!latest.publishedAt) await repo.updateRevision(latest.id, { publishedAt: new Date() });
        const to = projectPath(project.locale as Locale, latest.slug);
        if (previous && previous.slug !== latest.slug) {
          await repo.redirectMoved(
            project.locale,
            projectPath(project.locale as Locale, previous.slug),
            to,
          );
        } else {
          await repo.clearRedirectFrom(to);
        }
        const updated = await repo.updateProject(id, {
          status: 'published',
          publishedRevisionId: latest.id,
        });
        await claimSlugs(tx, project, [latest.slug]);
        return loadDetail(tx, updated!);
      });
      await notify();
      return detail;
    },

    async unpublish(id: string) {
      const detail = await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if (project.status !== 'published')
          throw errors.conflict('Das Projekt ist nicht veröffentlicht.');
        const latest = (await repo.latestRevision(id))!;
        const updated = await repo.updateProject(id, {
          status: 'draft',
          publishedRevisionId: null,
        });
        await claimSlugs(tx, project, [latest.slug]);
        return loadDetail(tx, updated!);
      });
      await notify();
      return detail;
    },

    async archive(id: string) {
      const { detail, wasPublished } = await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if (project.status === 'archived')
          throw errors.conflict('Das Projekt ist bereits archiviert.');
        const latest = (await repo.latestRevision(id))!;
        const updated = await repo.updateProject(id, {
          status: 'archived',
          publishedRevisionId: null,
        });
        await claimSlugs(tx, project, [latest.slug]);
        return {
          detail: await loadDetail(tx, updated!),
          wasPublished: project.status === 'published',
        };
      });
      if (wasPublished) await notify();
      return detail;
    },

    async restore(id: string) {
      return db.transaction(async (tx) => {
        const project = await lockOrFail(tx, id);
        if (project.status !== 'archived')
          throw errors.conflict('Das Projekt ist nicht archiviert.');
        const updated = await projectsRepo(tx).updateProject(id, { status: 'draft' });
        return loadDetail(tx, updated!);
      });
    },

    /**
     * Verknüpft zwei unabhängig angelegte Projekte (DE und EN) als Sprachversionen derselben Sache:
     * `targetId` übernimmt die Übersetzungsgruppe von `id`. Beide dürfen noch kein Gegenstück haben.
     */
    async linkTranslation(id: string, targetId: string) {
      const result = await db.transaction(async (tx) => {
        if (id === targetId)
          throw errors.conflict('Ein Projekt kann nicht mit sich selbst verknüpft werden.');
        const repo = projectsRepo(tx);
        // feste Sperrreihenfolge, damit gleichzeitiges Verknüpfen nicht in einen Deadlock läuft
        const locked = new Map<string, ProjectRow>();
        for (const pid of [id, targetId].sort()) locked.set(pid, await lockOrFail(tx, pid));
        const source = locked.get(id)!;
        const target = locked.get(targetId)!;
        if (source.locale === target.locale)
          throw errors.conflict('Gegenstück und Projekt müssen verschiedene Sprachen haben.');
        if (
          source.translationGroupId === target.translationGroupId ||
          (await repo.groupHasLocale(source.translationGroupId, target.locale)) ||
          (await repo.groupHasLocale(target.translationGroupId, source.locale))
        ) {
          throw errors.conflict('Eines der beiden Projekte hat bereits eine Sprachversion.');
        }
        await repo.setGroup(target.id, source.translationGroupId);
        return {
          detail: await loadDetail(tx, (await repo.findProject(id))!),
          published: source.status === 'published' || target.status === 'published',
        };
      });
      if (result.published) await notify();
      return result.detail;
    },

    /** Löst die Verknüpfung: Das Projekt bekommt eine eigene Übersetzungsgruppe, das Gegenstück bleibt wie es ist. */
    async unlinkTranslation(id: string) {
      const result = await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if ((await repo.groupSize(project.translationGroupId)) < 2)
          throw errors.conflict('Das Projekt hat keine verknüpfte Sprachversion.');
        await repo.setGroup(id, null);
        return { detail: await loadDetail(tx, (await repo.findProject(id))!) };
      });
      // Das gelöste Gegenstück kann veröffentlicht sein: hreflang/Umschalter müssen neu gebaut werden
      await notify();
      return result.detail;
    },

    /** Legt die Sprachversion als Kopie der neuesten Revision an. */
    async translate(
      actorId: string,
      id: string,
      body: { locale: Locale; slug?: string | undefined },
    ) {
      return db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const source = await lockOrFail(tx, id);
        if (await repo.groupHasLocale(source.translationGroupId, body.locale)) {
          throw errors.conflict('Für diese Sprache existiert bereits eine Version.');
        }
        const latest = (await repo.latestRevision(id))!;
        const gallery = await repo.galleryOf(latest.id);
        const project = await repo.insertProject({
          locale: body.locale,
          translationGroupId: source.translationGroupId,
          featured: false,
          sortOrder: (await repo.maxSortOrder(body.locale)) + 1,
        });
        const input: ProjectRevisionInput = {
          slug: body.slug ?? latest.slug,
          title: latest.title,
          subtitle: latest.subtitle as ProjectRevisionInput['subtitle'],
          year: latest.year,
          categories: latest.categories as ProjectRevisionInput['categories'],
          color: latest.color,
          tileColor: latest.tileColor,
          client: latest.client,
          liveUrl: latest.liveUrl,
          coverMediaId: latest.coverMediaId,
          nextProjectId: null, // verweist sonst auf ein Projekt der anderen Sprache
          content: latest.content as ProjectRevisionInput['content'],
          gallery: gallery.map((g) => ({ mediaId: g.mediaId, altOverride: null })),
          seoTitle: null,
          seoDescription: null,
          ogMediaId: latest.ogMediaId,
        };
        const revision = await repo.insertRevision({
          projectId: project.id,
          revisionNo: 1,
          createdBy: actorId,
          ...revisionValues(input),
        });
        await syncRevision(tx, project, revision, input);
        return loadDetail(tx, project);
      });
    },

    async revisions(id: string) {
      const repo = projectsRepo(db);
      if (!(await repo.findProject(id))) throw errors.notFound('Projekt nicht gefunden.');
      return (await repo.listRevisions(id)).map((r) => ({
        id: r.id,
        revisionNo: r.revisionNo,
        slug: r.slug,
        title: r.title,
        publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async revision(id: string, revisionId: string) {
      const repo = projectsRepo(db);
      const revision = await repo.findRevision(id, revisionId);
      if (!revision) throw errors.notFound('Revision nicht gefunden.');
      return toRevisionDto(
        revision,
        await repo.refsOf(revision.id).then((r) => r.filter((x) => x.role === 'gallery')),
      );
    },

    /** Hartes Löschen nur für Projekte, die nie veröffentlicht waren. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const repo = projectsRepo(tx);
        const project = await lockOrFail(tx, id);
        if (project.publishedRevisionId || (await repo.hasPublishedRevision(id))) {
          throw errors.conflict('Veröffentlichte Projekte können nur archiviert werden.');
        }
        await repo.deleteClaims(id);
        await repo.deleteProject(id);
      });
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
