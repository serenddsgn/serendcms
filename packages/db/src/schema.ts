import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// IDs: UUIDv7 über PostgreSQL 18 (`uuidv7()`), Zeitstempel: timestamptz.
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    disabledAt: ts('disabled_at'),
    lastLoginAt: ts('last_login_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_role_check', sql`${t.role} in ('admin', 'editor')`),
  ],
);

/** `id` ist der HMAC des Cookie-Tokens, das Token selbst wird nie gespeichert. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;

// ── Medien ────────────────────────────────────────────────────────────
export const media = pgTable(
  'media',
  {
    id: id(),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mime: text('mime').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: text('sha256').notNull(),
    /** Alt-Text je Sprache: { "de": "…", "en": "…" } */
    altText: jsonb('alt_text').$type<Record<string, string>>().notNull().default({}),
    focalX: smallint('focal_x').notNull().default(50),
    focalY: smallint('focal_y').notNull().default(50),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('media_storage_key_key').on(t.storageKey),
    check('media_focal_x_range', sql`${t.focalX} between 0 and 100`),
    check('media_focal_y_range', sql`${t.focalY} between 0 and 100`),
  ],
);

// ── Projekte: stabiler Datensatz + Revisionen ─────────────────────────
const LOCALE_CHECK = (col: AnyPgColumn) => sql`${col} in ('de', 'en')`;
const STATUS_CHECK = (col: AnyPgColumn) => sql`${col} in ('draft', 'published', 'archived')`;

export const projects = pgTable(
  'projects',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    /** Verknüpft die Sprachversionen eines Projekts (Sprachumschalter, hreflang). */
    translationGroupId: uuid('translation_group_id')
      .notNull()
      .default(sql`uuidv7()`),
    status: text('status').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    featuredSortOrder: integer('featured_sort_order'),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedRevisionId: uuid('published_revision_id').references(
      (): AnyPgColumn => projectRevisions.id,
      { onDelete: 'restrict' },
    ),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('projects_locale_check', LOCALE_CHECK(t.locale)),
    check('projects_status_check', STATUS_CHECK(t.status)),
    uniqueIndex('projects_group_locale_key').on(t.translationGroupId, t.locale),
    index('projects_locale_sort_idx').on(t.locale, t.sortOrder),
  ],
);

export const projectRevisions = pgTable(
  'project_revisions',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    revisionNo: integer('revision_no').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    subtitle: jsonb('subtitle').$type<unknown[]>(),
    year: smallint('year').notNull(),
    categories: text('categories').array().notNull(),
    color: text('color').notNull(),
    tileColor: text('tile_color'),
    client: text('client'),
    liveUrl: text('live_url'),
    coverMediaId: uuid('cover_media_id').references(() => media.id, { onDelete: 'restrict' }),
    nextProjectId: uuid('next_project_id').references((): AnyPgColumn => projects.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content').$type<unknown[]>().notNull().default([]),
    schemaVersion: integer('schema_version').notNull(),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ogMediaId: uuid('og_media_id').references(() => media.id, { onDelete: 'restrict' }),
    /** NULL = Entwurf. Veröffentlichte Revisionen sind unveränderlich. */
    publishedAt: ts('published_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('project_revisions_project_no_key').on(t.projectId, t.revisionNo),
    check('project_revisions_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('project_revisions_year_range', sql`${t.year} between 2000 and 2100`),
    check(
      'project_revisions_categories_check',
      sql`cardinality(${t.categories}) between 1 and 4 and ${t.categories} <@ array['web','shop','brand','print']::text[]`,
    ),
    check('project_revisions_color_format', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
    check(
      'project_revisions_tile_color_format',
      sql`${t.tileColor} is null or ${t.tileColor} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
    index('project_revisions_cover_idx').on(t.coverMediaId),
    index('project_revisions_og_idx').on(t.ogMediaId),
  ],
);

/** Medienbezüge einer Revision: Galerie und (abgeleitet) Medien aus Blöcken. FK RESTRICT schützt vor Löschen. */
export const projectMedia = pgTable(
  'project_media',
  {
    id: id(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => projectRevisions.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    altOverride: text('alt_override'),
  },
  (t) => [
    check('project_media_role_check', sql`${t.role} in ('gallery', 'block')`),
    uniqueIndex('project_media_unique').on(t.revisionId, t.role, t.mediaId),
    index('project_media_media_idx').on(t.mediaId),
  ],
);

// ── Slugs und Redirects ───────────────────────────────────────────────
/**
 * Slugs liegen in Revisionen; für die Eindeutigkeit pro Sprache hält jede Entität
 * höchstens zwei Claims (Slug der veröffentlichten Revision und des Entwurfs).
 */
export const slugClaims = pgTable(
  'slug_claims',
  {
    locale: text('locale').notNull(),
    scope: text('scope').notNull(),
    slug: text('slug').notNull(),
    ownerId: uuid('owner_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.locale, t.scope, t.slug] }),
    check('slug_claims_scope_check', sql`${t.scope} in ('project', 'page')`),
    check('slug_claims_locale_check', LOCALE_CHECK(t.locale)),
    index('slug_claims_owner_idx').on(t.ownerId),
  ],
);

export const redirects = pgTable(
  'redirects',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    statusCode: smallint('status_code').notNull().default(301),
    source: text('source').notNull().default('auto'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('redirects_from_path_key').on(t.fromPath),
    check('redirects_status_check', sql`${t.statusCode} = 301`),
    check('redirects_source_check', sql`${t.source} in ('auto', 'manual')`),
    check('redirects_not_self', sql`${t.fromPath} <> ${t.toPath}`),
    check('redirects_locale_check', LOCALE_CHECK(t.locale)),
  ],
);

export type MediaRow = typeof media.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type ProjectRevisionRow = typeof projectRevisions.$inferSelect;
export type ProjectMediaRow = typeof projectMedia.$inferSelect;
export type RedirectRow = typeof redirects.$inferSelect;

// ── Seiten (Revisionen wie bei Projekten) ─────────────────────────────
export const pages = pgTable(
  'pages',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    translationGroupId: uuid('translation_group_id')
      .notNull()
      .default(sql`uuidv7()`),
    /** home | projects | NULL (freie Inhaltsseite) */
    systemKey: text('system_key'),
    status: text('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    publishedRevisionId: uuid('published_revision_id').references(
      (): AnyPgColumn => pageRevisions.id,
      { onDelete: 'restrict' },
    ),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('pages_locale_check', LOCALE_CHECK(t.locale)),
    check('pages_status_check', STATUS_CHECK(t.status)),
    check(
      'pages_system_key_check',
      sql`${t.systemKey} is null or ${t.systemKey} in ('home', 'projects')`,
    ),
    uniqueIndex('pages_group_locale_key').on(t.translationGroupId, t.locale),
    uniqueIndex('pages_system_key_locale_key')
      .on(t.locale, t.systemKey)
      .where(sql`${t.systemKey} is not null`),
  ],
);

export const pageRevisions = pgTable(
  'page_revisions',
  {
    id: id(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    revisionNo: integer('revision_no').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    content: jsonb('content').$type<unknown[]>().notNull().default([]),
    schemaVersion: integer('schema_version').notNull(),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ogMediaId: uuid('og_media_id').references(() => media.id, { onDelete: 'restrict' }),
    publishedAt: ts('published_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('page_revisions_page_no_key').on(t.pageId, t.revisionNo),
    check('page_revisions_slug_format', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    index('page_revisions_og_idx').on(t.ogMediaId),
  ],
);

/** Medienbezüge einer Seitenrevision (abgeleitet aus Blöcken); FK RESTRICT schützt vor Löschen. */
export const pageMedia = pgTable(
  'page_media',
  {
    id: id(),
    revisionId: uuid('revision_id')
      .notNull()
      .references(() => pageRevisions.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('block'),
    sortOrder: integer('sort_order').notNull().default(0),
    altOverride: text('alt_override'),
  },
  (t) => [
    check('page_media_role_check', sql`${t.role} = 'block'`),
    uniqueIndex('page_media_unique').on(t.revisionId, t.role, t.mediaId),
    index('page_media_media_idx').on(t.mediaId),
  ],
);

// ── Leistungen, Navigation, Einstellungen ─────────────────────────────
export const services = pgTable(
  'services',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    translationGroupId: uuid('translation_group_id')
      .notNull()
      .default(sql`uuidv7()`),
    /** Entspricht der Projektkategorie (web | shop | brand | print). */
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('services_locale_check', LOCALE_CHECK(t.locale)),
    check('services_status_check', STATUS_CHECK(t.status)),
    check('services_key_check', sql`${t.key} in ('web', 'shop', 'brand', 'print')`),
    uniqueIndex('services_locale_key_key').on(t.locale, t.key),
  ],
);

export const navigationItems = pgTable(
  'navigation_items',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    location: text('location').notNull(),
    label: text('label').notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'restrict' }),
    url: text('url'),
    fragment: text('fragment'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('navigation_locale_check', LOCALE_CHECK(t.locale)),
    check('navigation_status_check', STATUS_CHECK(t.status)),
    check('navigation_location_check', sql`${t.location} in ('header', 'footer', 'legal')`),
    check('navigation_target_check', sql`(${t.pageId} is not null) <> (${t.url} is not null)`),
    index('navigation_locale_location_idx').on(t.locale, t.location, t.sortOrder),
  ],
);

export const siteSettings = pgTable(
  'site_settings',
  {
    id: id(),
    key: text('key').notNull(),
    locale: text('locale').notNull().default('de'),
    value: jsonb('value').$type<unknown>().notNull(),
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'restrict' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('site_settings_locale_check', LOCALE_CHECK(t.locale)),
    uniqueIndex('site_settings_key_locale_key').on(t.key, t.locale),
  ],
);

export type PageRow = typeof pages.$inferSelect;
export type PageRevisionRow = typeof pageRevisions.$inferSelect;
export type ServiceRow = typeof services.$inferSelect;
export type NavigationItemRow = typeof navigationItems.$inferSelect;
export type SiteSettingRow = typeof siteSettings.$inferSelect;

// ── Builds und Releases ───────────────────────────────────────────────
export const builds = pgTable(
  'builds',
  {
    id: id(),
    status: text('status').notNull().default('queued'),
    trigger: text('trigger').notNull(),
    triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: ts('requested_at').notNull().defaultNow(),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    errorSummary: text('error_summary'),
    /** Build-Log ohne Secrets, gekürzt. */
    log: text('log'),
    /** Ergebnisse der Prüfungen: Links, HTML, JS-Budget, Lighthouse. */
    checks: jsonb('checks').$type<unknown>(),
    /** Revisions-IDs, aus denen gebaut wurde. */
    manifest: jsonb('manifest').$type<unknown>(),
  },
  (t) => [
    check('builds_status_check', sql`${t.status} in ('queued', 'running', 'succeeded', 'failed')`),
    check('builds_trigger_check', sql`${t.trigger} in ('publish', 'manual', 'deploy', 'settings')`),
    index('builds_requested_idx').on(t.requestedAt),
    // höchstens ein wartender und ein laufender Build gleichzeitig
    uniqueIndex('builds_one_queued_key')
      .on(t.status)
      .where(sql`${t.status} = 'queued'`),
    uniqueIndex('builds_one_running_key')
      .on(t.status)
      .where(sql`${t.status} = 'running'`),
  ],
);

export const releases = pgTable(
  'releases',
  {
    id: id(),
    buildId: uuid('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').notNull().default(false),
    activatedAt: ts('activated_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    /** Gesetzt, wenn die Dateien aufgeräumt wurden (kein Rollback mehr möglich). */
    removedAt: ts('removed_at'),
  },
  (t) => [
    uniqueIndex('releases_one_active_key')
      .on(t.isActive)
      .where(sql`${t.isActive}`),
    uniqueIndex('releases_build_key').on(t.buildId),
  ],
);

export type BuildRow = typeof builds.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;

// ── Team und Kontaktnachrichten ───────────────────────────────────────
export const teamMembers = pgTable(
  'team_members',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    translationGroupId: uuid('translation_group_id')
      .notNull()
      .default(sql`uuidv7()`),
    name: text('name').notNull(),
    roleTitle: text('role_title').notNull(),
    bio: text('bio'),
    photoMediaId: uuid('photo_media_id').references(() => media.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('team_locale_check', LOCALE_CHECK(t.locale)),
    check('team_status_check', STATUS_CHECK(t.status)),
    index('team_photo_idx').on(t.photoMediaId),
  ],
);

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: id(),
    locale: text('locale').notNull().default('de'),
    name: text('name').notNull(),
    email: text('email').notNull(),
    message: text('message').notNull(),
    status: text('status').notNull().default('new'),
    consentAt: ts('consent_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('contact_locale_check', LOCALE_CHECK(t.locale)),
    check('contact_status_check', sql`${t.status} in ('new', 'read', 'spam', 'archived')`),
    index('contact_created_idx').on(t.createdAt),
  ],
);

export type TeamMemberRow = typeof teamMembers.$inferSelect;
export type ContactMessageRow = typeof contactMessages.$inferSelect;
