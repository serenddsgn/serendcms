import { eq } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { pages, type Database, type PageRevisionRow, type PageRow } from '@serend/db';
import {
  CONTENT_SCHEMA_VERSION,
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
    const parsed = pageContentSchema(page.systemKey).safeParse(input.content);
    if (!parsed.success) {
      throw validation(`Ungültiger Seiteninhalt: ${describeIssues(parsed.error)}`);
    }
    const mediaIds = [
      ...collectMediaIds(input.content),
      ...(input.ogMediaId ? [input.ogMediaId] : []),
    ];
    const unique = [...new Set(mediaIds)];
    if ((await mediaRepo(tx).findManyByIds(unique)).length !== unique.length) {
      throw validation('Ein referenziertes Medium existiert nicht.');
    }
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

  return {
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
}

export type PagesService = ReturnType<typeof createPagesService>;
