import { asc, eq, sql } from 'drizzle-orm';
import {
  navigationItems,
  pages,
  services,
  siteSettings,
  teamMembers,
  type Database,
  type NavigationItemRow,
  type ServiceRow,
  type TeamMemberRow,
} from '@serend/db';
import { SETTING_SCHEMAS, type Locale, type SettingKey, type Status } from '@serend/schema';
import { AppError, errors } from '../lib/errors.js';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/pg-errors.js';
import { mediaRepo } from '../repositories/media.repo.js';

type Cat = 'web' | 'shop' | 'brand' | 'print';
type NavTarget =
  { kind: 'page'; pageId: string; fragment: string | null } | { kind: 'url'; url: string };

const validation = (m: string) => new AppError(400, 'validation_error', m);

const serviceDto = (s: ServiceRow) => ({
  id: s.id,
  locale: s.locale as Locale,
  translationGroupId: s.translationGroupId,
  key: s.key as Cat,
  name: s.name,
  description: s.description,
  sortOrder: s.sortOrder,
  status: s.status as Status,
});
const navDto = (n: NavigationItemRow) => ({
  id: n.id,
  locale: n.locale as Locale,
  location: n.location as 'header' | 'footer' | 'legal',
  label: n.label,
  target: (n.pageId
    ? { kind: 'page', pageId: n.pageId, fragment: n.fragment }
    : { kind: 'url', url: n.url ?? '' }) as NavTarget,
  sortOrder: n.sortOrder,
  status: n.status as Status,
});
const teamDto = (t: TeamMemberRow) => ({
  id: t.id,
  locale: t.locale as Locale,
  translationGroupId: t.translationGroupId,
  name: t.name,
  roleTitle: t.roleTitle,
  bio: t.bio,
  photoMediaId: t.photoMediaId,
  sortOrder: t.sortOrder,
  status: t.status as Status,
});

/** Leistungen, Navigation, Team und Einstellungen. Änderungen an sichtbaren Inhalten lösen einen Build aus. */
export function createSiteService({
  db,
  onSiteChange,
}: {
  db: Database;
  onSiteChange?: () => Promise<void>;
}) {
  const changed = async () => void (await onSiteChange?.());

  async function checkNavTarget(locale: string, target: NavTarget) {
    if (target.kind !== 'page') return;
    const [p] = await db.select().from(pages).where(eq(pages.id, target.pageId)).limit(1);
    if (!p || p.locale !== locale)
      throw validation('Die Zielseite existiert nicht oder hat eine andere Sprache.');
  }

  async function reorder<T extends { id: string; locale: string }>(
    table: typeof services | typeof navigationItems | typeof teamMembers,
    ids: string[],
  ) {
    if (new Set(ids).size !== ids.length) throw validation('IDs müssen eindeutig sein.');
    await db.transaction(async (tx) => {
      const rows = (await tx.select({ id: table.id, locale: table.locale }).from(table)) as T[];
      const known = new Map(rows.map((r) => [r.id, r.locale]));
      const locales = new Set(ids.map((id) => known.get(id)));
      if (ids.some((id) => !known.has(id)) || locales.size !== 1)
        throw validation('Unbekannte Einträge oder gemischte Sprachen.');
      for (const [i, id] of ids.entries())
        await tx
          .update(table)
          .set({ sortOrder: i, updatedAt: sql`now()` })
          .where(eq(table.id, id));
    });
  }

  return {
    // ── Leistungen ────────────────────────────────────────────────
    services: {
      async list(locale?: string) {
        return (
          await db
            .select()
            .from(services)
            .where(locale ? eq(services.locale, locale) : undefined)
            .orderBy(asc(services.locale), asc(services.sortOrder))
        ).map(serviceDto);
      },
      async create(body: {
        locale: Locale;
        translationGroupId?: string | undefined;
        key: Cat;
        name: string;
        description: string;
        sortOrder: number;
        status: Status;
      }) {
        try {
          const [row] = await db.insert(services).values(body).returning();
          await changed();
          return serviceDto(row!);
        } catch (err) {
          if (isUniqueViolation(err))
            throw errors.conflict('Diese Leistung existiert in dieser Sprache bereits.');
          throw err;
        }
      },
      async update(
        id: string,
        patch: Partial<{ name: string; description: string; sortOrder: number; status: Status }>,
      ) {
        const [row] = await db
          .update(services)
          .set({ ...patch, updatedAt: sql`now()` })
          .where(eq(services.id, id))
          .returning();
        if (!row) throw errors.notFound('Leistung nicht gefunden.');
        await changed();
        return serviceDto(row);
      },
      async remove(id: string) {
        const rows = await db
          .delete(services)
          .where(eq(services.id, id))
          .returning({ id: services.id });
        if (rows.length === 0) throw errors.notFound('Leistung nicht gefunden.');
        await changed();
      },
      async order(ids: string[]) {
        await reorder(services, ids);
        await changed();
      },
    },

    // ── Navigation ────────────────────────────────────────────────
    navigation: {
      async list(locale?: string) {
        return (
          await db
            .select()
            .from(navigationItems)
            .where(locale ? eq(navigationItems.locale, locale) : undefined)
            .orderBy(
              asc(navigationItems.locale),
              asc(navigationItems.location),
              asc(navigationItems.sortOrder),
            )
        ).map(navDto);
      },
      async create(body: {
        locale: Locale;
        location: 'header' | 'footer' | 'legal';
        label: string;
        target: NavTarget;
        sortOrder: number;
        status: Status;
      }) {
        await checkNavTarget(body.locale, body.target);
        const [row] = await db
          .insert(navigationItems)
          .values({
            locale: body.locale,
            location: body.location,
            label: body.label,
            sortOrder: body.sortOrder,
            status: body.status,
            pageId: body.target.kind === 'page' ? body.target.pageId : null,
            fragment: body.target.kind === 'page' ? body.target.fragment : null,
            url: body.target.kind === 'url' ? body.target.url : null,
          })
          .returning();
        await changed();
        return navDto(row!);
      },
      async update(
        id: string,
        patch: Partial<{
          location: 'header' | 'footer' | 'legal';
          label: string;
          target: NavTarget;
          sortOrder: number;
          status: Status;
        }>,
      ) {
        const [current] = await db
          .select()
          .from(navigationItems)
          .where(eq(navigationItems.id, id))
          .limit(1);
        if (!current) throw errors.notFound('Navigationseintrag nicht gefunden.');
        if (patch.target) await checkNavTarget(current.locale, patch.target);
        const [row] = await db
          .update(navigationItems)
          .set({
            ...(patch.location && { location: patch.location }),
            ...(patch.label && { label: patch.label }),
            ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
            ...(patch.status && { status: patch.status }),
            ...(patch.target && {
              pageId: patch.target.kind === 'page' ? patch.target.pageId : null,
              fragment: patch.target.kind === 'page' ? patch.target.fragment : null,
              url: patch.target.kind === 'url' ? patch.target.url : null,
            }),
            updatedAt: sql`now()`,
          })
          .where(eq(navigationItems.id, id))
          .returning();
        await changed();
        return navDto(row!);
      },
      async remove(id: string) {
        const rows = await db
          .delete(navigationItems)
          .where(eq(navigationItems.id, id))
          .returning({ id: navigationItems.id });
        if (rows.length === 0) throw errors.notFound('Navigationseintrag nicht gefunden.');
        await changed();
      },
      async order(ids: string[]) {
        await reorder(navigationItems, ids);
        await changed();
      },
    },

    // ── Team (wird noch nicht ausgeliefert, daher kein Build) ─────
    team: {
      async list(locale?: string) {
        return (
          await db
            .select()
            .from(teamMembers)
            .where(locale ? eq(teamMembers.locale, locale) : undefined)
            .orderBy(asc(teamMembers.locale), asc(teamMembers.sortOrder))
        ).map(teamDto);
      },
      async create(body: {
        locale: Locale;
        translationGroupId?: string | undefined;
        name: string;
        roleTitle: string;
        bio: string | null;
        photoMediaId: string | null;
        sortOrder: number;
        status: Status;
      }) {
        if (
          body.photoMediaId &&
          (await mediaRepo(db).findManyByIds([body.photoMediaId])).length === 0
        )
          throw validation('Das Foto existiert nicht.');
        const [row] = await db.insert(teamMembers).values(body).returning();
        return teamDto(row!);
      },
      async update(
        id: string,
        patch: Partial<{
          name: string;
          roleTitle: string;
          bio: string | null;
          photoMediaId: string | null;
          sortOrder: number;
          status: Status;
        }>,
      ) {
        if (
          patch.photoMediaId &&
          (await mediaRepo(db).findManyByIds([patch.photoMediaId])).length === 0
        )
          throw validation('Das Foto existiert nicht.');
        const [row] = await db
          .update(teamMembers)
          .set({ ...patch, updatedAt: sql`now()` })
          .where(eq(teamMembers.id, id))
          .returning();
        if (!row) throw errors.notFound('Teammitglied nicht gefunden.');
        return teamDto(row);
      },
      async remove(id: string) {
        const rows = await db
          .delete(teamMembers)
          .where(eq(teamMembers.id, id))
          .returning({ id: teamMembers.id });
        if (rows.length === 0) throw errors.notFound('Teammitglied nicht gefunden.');
      },
      async order(ids: string[]) {
        await reorder(teamMembers, ids);
      },
    },

    // ── Einstellungen: pro Key mit Zod validiert ──────────────────
    settings: {
      async list() {
        const rows = await db
          .select()
          .from(siteSettings)
          .orderBy(asc(siteSettings.key), asc(siteSettings.locale));
        return rows.map((r) => ({
          key: r.key as SettingKey,
          locale: r.locale as Locale,
          value: r.value,
          updatedAt: r.updatedAt.toISOString(),
        }));
      },
      async put(key: SettingKey, locale: Locale, value: unknown) {
        const parsed = SETTING_SCHEMAS[key].safeParse(value);
        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || key))].join(
            ', ',
          );
          throw validation(`Ungültiger Wert für ${key}: ${fields}`);
        }
        // Link-Ziele einer Einstellung müssen existieren (z. B. site.cta)
        const target = (parsed.data as { target?: NavTarget }).target;
        if (target) await checkNavTarget(locale, target);
        try {
          const [row] = await db
            .insert(siteSettings)
            .values({ key, locale, value: parsed.data })
            .onConflictDoUpdate({
              target: [siteSettings.key, siteSettings.locale],
              set: { value: parsed.data, updatedAt: sql`now()` },
            })
            .returning();
          await changed();
          return { key, locale, value: row!.value, updatedAt: row!.updatedAt.toISOString() };
        } catch (err) {
          if (isForeignKeyViolation(err)) throw validation('Ungültiger Verweis.');
          throw err;
        }
      },
    },
  };
}

export type SiteService = ReturnType<typeof createSiteService>;
