import { z } from 'zod';
import { ProjectContent } from './blocks.js';
import { Locale, Uuid } from './common.js';
import { SettingKeySchema } from './settings.js';
import { Category } from './projects.js';
import { Inline } from './blocks.js';

/**
 * Antworten von /internal/build/*: ausschließlich freigegebene Inhalte.
 * Astro validiert sie beim Build mit denselben Schemas.
 */
export const BuildMedia = z.object({
  id: Uuid,
  storageKey: z.string(),
  mime: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  byteSize: z.number().int(),
  sha256: z.string(),
  altText: z.record(z.string(), z.string()),
  focalX: z.number().int(),
  focalY: z.number().int(),
});
export type BuildMedia = z.infer<typeof BuildMedia>;

export const BuildProject = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  featured: z.boolean(),
  featuredSortOrder: z.number().int().nullable(),
  sortOrder: z.number().int(),
  revision: z.object({
    id: Uuid,
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
    gallery: z.array(z.object({ mediaId: Uuid, altOverride: z.string().nullable() })),
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable(),
    ogMediaId: Uuid.nullable(),
    publishedAt: z.iso.datetime(),
  }),
});
export type BuildProject = z.infer<typeof BuildProject>;

export const BuildPage = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  systemKey: z.enum(['home', 'projects']).nullable(),
  revision: z.object({
    id: Uuid,
    slug: z.string(),
    title: z.string(),
    /** Wird beim Build je nach systemKey mit pageContentSchema validiert. */
    content: z.array(z.unknown()),
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable(),
    ogMediaId: Uuid.nullable(),
    publishedAt: z.iso.datetime(),
  }),
});
export type BuildPage = z.infer<typeof BuildPage>;

export const BuildService = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  key: Category,
  name: z.string(),
  description: z.string(),
  sortOrder: z.number().int(),
});
export type BuildService = z.infer<typeof BuildService>;

export const BuildNavItem = z.object({
  id: Uuid,
  locale: Locale,
  location: z.enum(['header', 'footer', 'legal']),
  label: z.string(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page'), pageId: Uuid, fragment: z.string().nullable() }),
    z.object({ kind: z.literal('url'), url: z.string() }),
  ]),
  sortOrder: z.number().int(),
});
export type BuildNavItem = z.infer<typeof BuildNavItem>;

export const BuildSetting = z.object({ key: SettingKeySchema, locale: Locale, value: z.unknown() });
export type BuildSetting = z.infer<typeof BuildSetting>;

export const BuildRedirect = z.object({ fromPath: z.string(), toPath: z.string() });
export type BuildRedirect = z.infer<typeof BuildRedirect>;

export const BuildManifest = z.object({
  counts: z.object({
    projects: z.number().int(),
    pages: z.number().int(),
    services: z.number().int(),
    navigation: z.number().int(),
    settings: z.number().int(),
    media: z.number().int(),
    redirects: z.number().int(),
  }),
  /** Revisions-IDs, aus denen gebaut wird (Reproduzierbarkeit). */
  projectRevisionIds: z.array(Uuid),
  pageRevisionIds: z.array(Uuid),
});
export type BuildManifest = z.infer<typeof BuildManifest>;
