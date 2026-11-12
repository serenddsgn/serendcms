import { z } from 'zod';
import { Inline, ProjectContent } from './blocks.js';
import { Locale, Slug, Uuid } from './common.js';

export const CATEGORIES = ['web', 'shop', 'brand', 'print'] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

export const STATUSES = ['draft', 'published', 'archived'] as const;
export const Status = z.enum(STATUSES);
export type Status = z.infer<typeof Status>;

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex-Farbe wie #ba1f2a');

export const GalleryItem = z.object({
  mediaId: Uuid,
  altOverride: z.string().trim().max(300).nullable().default(null),
});

/** Inhalt einer Revision (Entwurf speichern = vollständig ersetzen). */
export const ProjectRevisionInput = z.object({
  slug: Slug,
  title: z.string().trim().min(1).max(120),
  subtitle: Inline.nullable().default(null),
  year: z.number().int().min(2000).max(2100),
  categories: z
    .array(Category)
    .min(1)
    .max(4)
    .refine((c) => new Set(c).size === c.length, 'Kategorien müssen eindeutig sein'),
  color: HexColor,
  tileColor: HexColor.nullable().default(null),
  client: z.string().trim().max(120).nullable().default(null),
  liveUrl: z
    .url({ protocol: /^https?$/ })
    .max(300)
    .nullable()
    .default(null),
  coverMediaId: Uuid.nullable().default(null),
  nextProjectId: Uuid.nullable().default(null),
  content: ProjectContent.default([]),
  gallery: z.array(GalleryItem).max(30).default([]),
  seoTitle: z.string().trim().max(70).nullable().default(null),
  seoDescription: z.string().trim().max(200).nullable().default(null),
  /** In Suchmaschinen anzeigen. Standard: nein (noindex), damit die Fallstudie nicht mit der Seite des Kunden konkurriert. */
  indexable: z.boolean().default(false),
  ogMediaId: Uuid.nullable().default(null),
});
export type ProjectRevisionInput = z.infer<typeof ProjectRevisionInput>;

export const CreateProjectBody = ProjectRevisionInput.extend({
  locale: Locale.default('de'),
  /** Vorhandene Gruppe, wenn dies die Sprachversion eines Projekts ist. */
  translationGroupId: Uuid.optional(),
  featured: z.boolean().default(false),
});

export const SaveDraftBody = ProjectRevisionInput.extend({
  /** Optimistische Sperre: Revisionsnummer, auf der der Client aufgebaut hat. */
  expectedRevisionNo: z.number().int().min(1).optional(),
});

/**
 * Kachelgröße in der Startseiten-Auswahl (3-Spalten-Raster): `auto` richtet sich nach der Position,
 * `s` = 1×1, `w` = breit 2×1, `t` = hoch 1×2, `l` = groß 2×2.
 */
export const FEATURED_SIZES = ['auto', 's', 'w', 't', 'l'] as const;
export const FeaturedSize = z.enum(FEATURED_SIZES);
export type FeaturedSize = z.infer<typeof FeaturedSize>;

export const UpdateProjectBody = z
  .object({
    featured: z.boolean().optional(),
    featuredSortOrder: z.number().int().min(0).max(999).nullable().optional(),
    featuredSize: FeaturedSize.optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Mindestens ein Feld angeben' });

/** Layout der Startseiten-Auswahl: genau diese Projekte in dieser Reihenfolge und Größe, alle anderen fliegen raus. */
export const FeaturedLayoutBody = z.object({
  locale: Locale,
  items: z.array(z.object({ id: Uuid, size: FeaturedSize })).max(24),
  /** Auswahl auch auf verknüpfte Sprachversionen übertragen. */
  applyToOtherLocales: z.boolean().default(false),
});

export const OrderBody = z.object({
  locale: Locale,
  ids: z.array(Uuid).min(1).max(500),
});

export const TranslateBody = z.object({
  locale: Locale,
  slug: Slug.optional(),
});

/** Bestehende Version der anderen Sprache als Gegenstück verknüpfen (Projekt oder Seite). */
export const LinkTranslationBody = z.object({ targetId: Uuid });

export const ProjectIdParams = z.object({ id: Uuid });
export const RevisionParams = z.object({ id: Uuid, revisionId: Uuid });
export const ProjectListQuery = z.object({
  locale: Locale.optional(),
  status: Status.optional(),
});

// ── Antworten ─────────────────────────────────────────────────────────
export const ProjectDto = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  status: Status,
  featured: z.boolean(),
  featuredSortOrder: z.number().int().nullable(),
  featuredSize: FeaturedSize,
  sortOrder: z.number().int(),
  publishedRevisionId: Uuid.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ProjectRevisionDto = z.object({
  id: Uuid,
  revisionNo: z.number().int(),
  schemaVersion: z.number().int(),
  slug: z.string(),
  title: z.string(),
  subtitle: Inline.nullable(),
  year: z.number().int(),
  categories: z.array(Category),
  color: z.string(),
  tileColor: z.string().nullable(),
  client: z.string().nullable(),
  liveUrl: z.string().nullable(),
  coverMediaId: Uuid.nullable(),
  nextProjectId: Uuid.nullable(),
  content: ProjectContent,
  gallery: z.array(GalleryItem),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  indexable: z.boolean(),
  ogMediaId: Uuid.nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectRevisionDto = z.infer<typeof ProjectRevisionDto>;

export const ProjectDetailResponse = z.object({
  project: ProjectDto,
  latest: ProjectRevisionDto,
  published: ProjectRevisionDto.nullable(),
  hasUnpublishedChanges: z.boolean(),
});

export const ProjectListItem = ProjectDto.extend({
  title: z.string(),
  slug: z.string(),
  year: z.number().int(),
  categories: z.array(Category),
  color: z.string(),
  coverMediaId: Uuid.nullable(),
  hasUnpublishedChanges: z.boolean(),
});
export const ProjectListResponse = z.object({ projects: z.array(ProjectListItem) });
export const RevisionListResponse = z.object({
  revisions: z.array(
    z.object({
      id: Uuid,
      revisionNo: z.number().int(),
      slug: z.string(),
      title: z.string(),
      publishedAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export const RevisionResponse = z.object({ revision: ProjectRevisionDto });
