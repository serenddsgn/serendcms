import { eq } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { pages, type Database, type PageRevisionRow, type PageRow } from '@serend/db';
import {
  CONTENT_SCHEMA_VERSION,
  DEFAULT_LOCALE,
  RESERVED_ROOT_SEGMENTS,
  ROUTE_SEGMENTS,
  collectLinkTargets,
  collectMediaIds,
  pageContentSchema,
  pagePath,
  type Locale,
  type PageRevisionInput,
  type PageSystemKey,
  upgradeContent,
} from '@serend/schema';
import { AppError, errors } from '../lib/errors.js';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/pg-errors.js';
import { mediaRepo } from '../repositories/media.repo.js';
import { pagesRepo, type NewPageRevision } from '../repositories/pages.repo.js';
import { projectsRepo } from '../repositories/projects.repo.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const validation = (msg: string) => new AppError(400, 'validation_error', msg);

const toDto = (p: PageRow) => ({
  id: p.id,
  locale: p.locale as Locale,
  translationGroupId: p.translationGroupId,
  systemKey: p.systemKey as PageSystemKey | null,
  status: p.status as 'draft' | 'published' | 'archived',
  sortOrder: p.sortOrder,
  publishedRevisionId: p.publishedRevisionId,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
const toRevisionDto = (r: PageRevisionRow) => ({
  id: r.id,
  revisionNo: r.revisionNo,
  schemaVersion: r.schemaVersion,
  slug: r.slug,
  title: r.title,
  content: upgradeContent(r.content, r.schemaVersion),
  seoTitle: r.seoTitle,
  seoDescription: r.seoDescription,
  ogMediaId: r.ogMediaId,
  publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

function revisionValues(
  input: PageRevisionInput,
): Omit<NewPageRevision, 'id' | 'pageId' | 'revisionNo'> {
  return {
    slug: input.slug,
    title: input.title,
    content: input.content,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    ogMediaId: input.ogMediaId,
  };
}

/** Systemseiten haben feste Slugs, aus denen sich die Routen ergeben. */
function expectedSystemSlug(systemKey: PageSystemKey | null, locale: Locale): string | null {
  if (systemKey === 'home') return 'home';
  if (systemKey === 'projects') return ROUTE_SEGMENTS[locale].projects;
  return null;
}

/** Verständliche Kurzfassung der Schema-Fehler: „Block 3: Text zu lang (max. 5000 Zeichen)“ statt Pfaden wie 2.nodes.0.runs.0.text. */
function describeIssues(error: ZodError): string {
  const lines = error.issues.map((i) => {
    const [first] = i.path;
    const where = typeof first === 'number' ? `Block ${first + 1}` : 'Inhalt';
    if (i.path.at(-1) === 'mediaId') return `${where}: Bitte ein Bild wählen`;
    let why = i.message;
    if (i.code === 'too_big')
      why =
        i.origin === 'string'
          ? `Text zu lang (max. ${i.maximum} Zeichen)`
          : `zu viele Einträge (max. ${i.maximum})`;
    else if (i.code === 'too_small')
      why =
        i.origin === 'string' ? 'darf nicht leer sein' : `zu wenige Einträge (min. ${i.minimum})`;
    return `${where}: ${why}`;
  });
  return [...new Set(lines)].slice(0, 5).join('; ');
}

export function createPagesService({
  db,
  onPublishedChange,
}: {
  db: Database;
  onPublishedChange?: () => Promise<void>;
}) {
  async function detail(x: Tx | Database, page: PageRow) {
    const repo = pagesRepo(x);
    const latest = await repo.latestRevision(page.id);
    if (!latest) throw new Error(`page ${page.id} has no revision`);
    const published =
      page.publishedRevisionId === null
        ? undefined
        : page.publishedRevisionId === latest.id
          ? latest
          : await repo.findRevision(page.id, page.publishedRevisionId);
    return {
      page: toDto(page),
      latest: toRevisionDto(latest),
      published: published ? toRevisionDto(published) : null,
      hasUnpublishedChanges: latest.id !== page.publishedRevisionId,
    };
  }

  /** Inhalt gegen das Schema des Seitentyps prüfen und alle Verweise (Medien, Links) auflösen. */
  async function assertContent(
    tx: Tx,
    input: PageRevisionInput,
    page: { locale: string; systemKey: PageSystemKey | null },
  ): Promise<void> {
    const slug = expectedSystemSlug(page.systemKey, page.locale as Locale);
    if (slug !== null && input.slug !== slug)
      throw validation(`Der Slug dieser Systemseite ist fest: „${slug}“.`);
    if (
      page.systemKey === null &&
      page.locale === DEFAULT_LOCALE &&
      RESERVED_ROOT_SEGMENTS.includes(input.slug)
    )
      throw validation(
        `Der Slug „${input.slug}“ ist reserviert (Sprachpräfix oder technische Route).`,
      );
    const parsed = pageContentSchema(page.systemKey).safeParse(input.content);
    if (!parsed.success) {
      throw validation(`Ungültiger Seiteninhalt: ${describeIssues(parsed.error)}`);
    }
    const mediaIds = [
      ...collectMediaIds(input.content),
      ...(input.ogMediaId ? [input.ogMediaId] : []),
    ];
    const unique = [...new Set(mediaIds)];
    const foundMedia = await mediaRepo(tx).findManyByIds(unique);
    if (foundMedia.length !== unique.length) {
      throw validation('Ein referenziertes Medium existiert nicht.');
    }
    if (
      input.ogMediaId &&
      foundMedia.find((m) => m.id === input.ogMediaId)?.mime.startsWith('video/')
    )
      throw validation('Das Social-Media-Bild muss ein Bild sein, kein Video.');
    const { pageIds, projectIds } = collectLinkTargets(input.content);
    for (const id of pageIds) {
      const p = await pagesRepo(tx).findPage(id);
      if (!p || p.locale !== page.locale)
        throw validation('Ein Link verweist auf eine unbekannte Seite.');
    }
    for (const id of projectIds) {
      const p = await projectsRepo(tx).findProject(id);
      if (!p || p.locale !== page.locale)
        throw validation('Ein Link verweist auf ein unbekanntes Projekt.');
    }
  }

  async function claim(tx: Tx, page: PageRow, slugs: (string | undefined)[]) {
    const repo = projectsRepo(tx);
    const wanted = slugs.filter((s): s is string => Boolean(s));
    for (const slug of wanted) {
      const owner = await repo.claimOwner(page.locale, 'page', slug);
      if (owner && owner !== page.id)
        throw errors.conflict(`Der Slug „${slug}“ ist bereits vergeben.`);
    }
    try {
      await repo.replaceClaims(page.id, page.locale, 'page', wanted);
    } catch (err) {
      if (isUniqueViolation(err)) throw errors.conflict('Der Slug ist bereits vergeben.');
      throw err;
    }
  }

  async function sync(tx: Tx, page: PageRow, revision: PageRevisionRow, input: PageRevisionInput) {
    const repo = pagesRepo(tx);
    await repo.replaceMediaRefs(revision.id, collectMediaIds(input.content));
    const liveSlug =
      page.publishedRevisionId && page.publishedRevisionId !== revision.id
        ? (await repo.findRevision(page.id, page.publishedRevisionId))?.slug
        : undefined;
    await claim(tx, page, [liveSlug, revision.slug]);
  }

  async function lockOrFail(tx: Tx, id: string): Promise<PageRow> {
    const page = await pagesRepo(tx).lockPage(id);
    if (!page) throw errors.notFound('Seite nicht gefunden.');
    return page;
  }

  const service = {
    async list(filter: { locale?: string | undefined; status?: string | undefined }) {
      return (await pagesRepo(db).listWithLatest(filter)).map(({ page, latest }) => ({
        ...toDto(page),
        title: latest.title,
        slug: latest.slug,
        hasUnpublishedChanges: latest.id !== page.publishedRevisionId,
      }));
    },

    async get(id: string) {
      const page = await pagesRepo(db).findPage(id);
      if (!page) throw errors.notFound('Seite nicht gefunden.');
      return detail(db, page);
    },

    /** `id` darf vorgegeben werden (Seeds: Seiten verlinken sich gegenseitig per ID). */
    async create(
      actorId: string,
      body: PageRevisionInput & {
        locale: Locale;
        systemKey: PageSystemKey | null;
        translationGroupId?: string | undefined;
        id?: string | undefined;
      },
    ) {
      return db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        if (
          body.translationGroupId &&
          (await repo.groupHasLocale(body.translationGroupId, body.locale))
        ) {
          throw errors.conflict('Für diese Sprache existiert bereits eine Version.');
        }
        let page: PageRow;
        try {
          page = await repo.insertPage({
            ...(body.id && { id: body.id }),
            locale: body.locale,
            systemKey: body.systemKey,
            ...(body.translationGroupId && { translationGroupId: body.translationGroupId }),
          });
        } catch (err) {
          if (isUniqueViolation(err))
            throw errors.conflict('Diese Systemseite existiert in dieser Sprache bereits.');
          throw err;
        }
        // Vorab-Prüfung ohne Link-Auflösung der eigenen ID (Seiten dürfen sich selbst verlinken)
        await assertContent(tx, body, { locale: page.locale, systemKey: body.systemKey });
        const revision = await repo.insertRevision({
          pageId: page.id,
          revisionNo: 1,
          createdBy: actorId,
          ...revisionValues(body),
        });
        await sync(tx, page, revision, body);
        return detail(tx, page);
      });
    },

    /**
     * Legt die Sprachversion als Kopie der neuesten Revision an (gleiches Layout, gleiche Blöcke).
     * Links auf Seiten/Projekte müssen in der Zielsprache liegen: Sie werden auf die jeweilige
     * Sprachversion umgebogen. Fehlt diese, bricht das Kopieren mit einer Liste der fehlenden Versionen ab.
     */
    async translate(
      actorId: string,
      id: string,
      body: { locale: Locale; slug?: string | undefined },
    ) {
      const source = await db.transaction(async (tx) => {
        const page = await pagesRepo(tx).findPage(id);
        if (!page) throw errors.notFound('Seite nicht gefunden.');
        const latest = (await pagesRepo(tx).latestRevision(id))!;
        return { page, latest };
      });
      const { page, latest } = source;
      if (page.locale === body.locale)
        throw errors.conflict('Die Seite hat bereits diese Sprache.');

      const missing: string[] = [];
      const targets = collectLinkTargets(latest.content);
      const pageMap = new Map<string, string>();
      const projectMap = new Map<string, string>();
      await db.transaction(async (tx) => {
        for (const pid of targets.pageIds) {
          const linked = await pagesRepo(tx).findPage(pid);
          const sibling =
            linked && (await pagesRepo(tx).findInGroup(linked.translationGroupId, body.locale));
          if (sibling) pageMap.set(pid, sibling.id);
          else missing.push(`Seite „${(await pagesRepo(tx).latestRevision(pid))?.title ?? pid}“`);
        }
        for (const pid of targets.projectIds) {
          const linked = await projectsRepo(tx).findProject(pid);
          const sibling =
            linked && (await projectsRepo(tx).findInGroup(linked.translationGroupId, body.locale));
          if (sibling) projectMap.set(pid, sibling.id);
          else
            missing.push(`Projekt „${(await projectsRepo(tx).latestRevision(pid))?.title ?? pid}“`);
        }
      });
      if (missing.length > 0)
        throw errors.conflict(
          `Verlinkte Inhalte haben noch keine Version in dieser Sprache: ${[...new Set(missing)].join(', ')}. Bitte zuerst diese übersetzen.`,
        );

      const remap = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(remap);
        if (typeof v !== 'object' || v === null) return v;
        const o = { ...(v as Record<string, unknown>) };
        if (o.kind === 'page' && typeof o.pageId === 'string')
          o.pageId = pageMap.get(o.pageId) ?? o.pageId;
        if (o.kind === 'project' && typeof o.projectId === 'string')
          o.projectId = projectMap.get(o.projectId) ?? o.projectId;
        for (const [k, val] of Object.entries(o)) o[k] = remap(val);
        return o;
      };

      return service.create(actorId, {
        locale: body.locale,
        systemKey: page.systemKey as PageSystemKey | null,
        translationGroupId: page.translationGroupId,
        slug:
          expectedSystemSlug(page.systemKey as PageSystemKey | null, body.locale) ??
          body.slug ??
          latest.slug,
        title: latest.title,
        content: remap(latest.content) as unknown[],
        seoTitle: null,
        seoDescription: null,
        ogMediaId: latest.ogMediaId,
      });
    },

    async saveDraft(
      actorId: string,
      id: string,
      body: PageRevisionInput & { expectedRevisionNo?: number | undefined },
    ) {
      return db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        const page = await lockOrFail(tx, id);
        if (page.status === 'archived')
          throw errors.conflict('Archivierte Seiten müssen zuerst wiederhergestellt werden.');
        await assertContent(tx, body, page as { locale: string; systemKey: PageSystemKey | null });
        const latest = await repo.latestRevision(id);
        if (!latest) throw new Error('missing revision');
        if (
          body.expectedRevisionNo !== undefined &&
          body.expectedRevisionNo !== latest.revisionNo
        ) {
          throw errors.conflict('Die Seite wurde zwischenzeitlich geändert. Bitte neu laden.');
        }
        let revision: PageRevisionRow;
        if (latest.publishedAt) {
          revision = await repo.insertRevision({
            pageId: id,
            revisionNo: latest.revisionNo + 1,
            createdBy: actorId,
            ...revisionValues(body),
          });
        } else {
          revision = (await repo.updateRevision(latest.id, revisionValues(body)))!;
        }
        await sync(tx, page, revision, body);
        await repo.updatePage(id, {});
        return detail(tx, (await repo.findPage(id))!);
      });
    },

    async publish(id: string) {
      const result = await db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        const page = await lockOrFail(tx, id);
        if (page.status === 'archived')
          throw errors.conflict('Archivierte Seiten können nicht veröffentlicht werden.');
        const latest = (await repo.latestRevision(id))!;
        if (latest.id === page.publishedRevisionId)
          throw errors.conflict('Keine unveröffentlichten Änderungen.');

        // Alt-Texte aller Block-Bilder in der Sprache der Seite
        const refs = collectMediaIds(latest.content);
        const medias = await mediaRepo(tx).findManyByIds(refs);
        const missing = medias.filter((m) => !m.altText[page.locale]?.trim());
        if (missing.length > 0)
          throw validation(
            `Nicht veröffentlichbar: Alt-Text fehlt für ${missing.length} Bild(er).`,
          );

        const previous = page.publishedRevisionId
          ? await repo.findRevision(id, page.publishedRevisionId)
          : undefined;
        if (!latest.publishedAt) await repo.updateRevision(latest.id, { publishedAt: new Date() });
        if (page.systemKey === null) {
          const projects = projectsRepo(tx);
          const to = pagePath(page.locale as Locale, latest.slug);
          if (previous && previous.slug !== latest.slug) {
            await projects.redirectMoved(
              page.locale,
              pagePath(page.locale as Locale, previous.slug),
              to,
            );
          } else {
            await projects.clearRedirectFrom(to);
          }
        }
        const updated = await repo.updatePage(id, {
          status: 'published',
          publishedRevisionId: latest.id,
        });
        await claim(tx, page, [latest.slug]);
        return detail(tx, updated!);
      });
      await onPublishedChange?.();
      return result;
    },

    /** Hartes Löschen nur für freie Inhaltsseiten, die nie veröffentlicht waren und nirgends verlinkt sind. */
    async remove(id: string): Promise<void> {
      await db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        const page = await lockOrFail(tx, id);
        if (page.systemKey !== null)
          throw errors.conflict('Systemseiten können nicht gelöscht werden.');
        if (page.publishedRevisionId || (await repo.hasPublishedRevision(id))) {
          throw errors.conflict(
            'Veröffentlichte Seiten können nur zurück zum Entwurf gesetzt werden.',
          );
        }
        await projectsRepo(tx).deleteClaims(id);
        try {
          await tx.delete(pages).where(eq(pages.id, id));
        } catch (err) {
          if (isForeignKeyViolation(err))
            throw errors.conflict('Die Seite wird noch von der Navigation verwendet.');
          throw err;
        }
      });
    },

    /**
     * Verknüpft zwei unabhängig angelegte Seiten (DE und EN) als Sprachversionen: `targetId` übernimmt die
     * Übersetzungsgruppe von `id`. Beide dürfen noch kein Gegenstück haben und müssen derselbe Seitentyp sein
     * (Startseite nur mit Startseite, normale Seite nur mit normaler Seite).
     */
    async linkTranslation(id: string, targetId: string) {
      const result = await db.transaction(async (tx) => {
        if (id === targetId)
          throw errors.conflict('Eine Seite kann nicht mit sich selbst verknüpft werden.');
        const repo = pagesRepo(tx);
        const locked = new Map<string, PageRow>();
        for (const pid of [id, targetId].sort()) locked.set(pid, await lockOrFail(tx, pid));
        const source = locked.get(id)!;
        const target = locked.get(targetId)!;
        if (source.locale === target.locale)
          throw errors.conflict('Gegenstück und Seite müssen verschiedene Sprachen haben.');
        if (source.systemKey !== target.systemKey)
          throw errors.conflict(
            'Systemseiten lassen sich nur mit dem gleichen Seitentyp verknüpfen.',
          );
        if (
          source.translationGroupId === target.translationGroupId ||
          (await repo.groupHasLocale(source.translationGroupId, target.locale)) ||
          (await repo.groupHasLocale(target.translationGroupId, source.locale))
        ) {
          throw errors.conflict('Eine der beiden Seiten hat bereits eine Sprachversion.');
        }
        await repo.setGroup(target.id, source.translationGroupId);
        return {
          detail: await detail(tx, (await repo.findPage(id))!),
          published: source.status === 'published' || target.status === 'published',
        };
      });
      if (result.published) await onPublishedChange?.();
      return result.detail;
    },

    /** Löst die Verknüpfung: Die Seite bekommt eine eigene Übersetzungsgruppe, das Gegenstück bleibt wie es ist. */
    async unlinkTranslation(id: string) {
      const result = await db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        const page = await lockOrFail(tx, id);
        if ((await repo.groupSize(page.translationGroupId)) < 2)
          throw errors.conflict('Die Seite hat keine verknüpfte Sprachversion.');
        await repo.setGroup(id, null);
        return {
          detail: await detail(tx, (await repo.findPage(id))!),
        };
      });
      // Das gelöste Gegenstück kann veröffentlicht sein: hreflang/Umschalter müssen neu gebaut werden
      await onPublishedChange?.();
      return result.detail;
    },

    async unpublish(id: string) {
      const result = await db.transaction(async (tx) => {
        const repo = pagesRepo(tx);
        const page = await lockOrFail(tx, id);
        if (page.status !== 'published')
          throw errors.conflict('Die Seite ist nicht veröffentlicht.');
        const latest = (await repo.latestRevision(id))!;
        const updated = await repo.updatePage(id, { status: 'draft', publishedRevisionId: null });
        await claim(tx, page, [latest.slug]);
        return detail(tx, updated!);
      });
      await onPublishedChange?.();
      return result;
    },
  };
  return service;
}

export type PagesService = ReturnType<typeof createPagesService>;
