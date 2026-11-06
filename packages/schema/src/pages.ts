import { z } from 'zod';
import { Locale, Slug, Uuid } from './common.js';
import { PageSystemKey } from './blocks.js';
import { Status } from './projects.js';

/** Inhalt einer Seitenrevision. `content` wird zusätzlich je Seitentyp (systemKey) validiert. */
export const PageRevisionInput = z.object({
  slug: Slug,
  title: z.string().trim().min(1).max(120),
  content: z.array(z.unknown()).max(80).default([]),
  seoTitle: z.string().trim().max(70).nullable().default(null),
  seoDescription: z.string().trim().max(200).nullable().default(null),
  ogMediaId: Uuid.nullable().default(null),
});
export type PageRevisionInput = z.infer<typeof PageRevisionInput>;

export const CreatePageBody = PageRevisionInput.extend({
  locale: Locale.default('de'),
  translationGroupId: Uuid.optional(),
  systemKey: PageSystemKey.nullable().default(null),
});
export const SavePageDraftBody = PageRevisionInput.extend({
  expectedRevisionNo: z.number().int().min(1).optional(),
});

export const PageDto = z.object({
  id: Uuid,
  locale: Locale,
  translationGroupId: Uuid,
  systemKey: PageSystemKey.nullable(),
  status: Status,
  sortOrder: z.number().int(),
  publishedRevisionId: Uuid.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const PageRevisionDto = z.object({
  id: Uuid,
  revisionNo: z.number().int(),
  schemaVersion: z.number().int(),
  slug: z.string(),
  title: z.string(),
  content: z.array(z.unknown()),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  ogMediaId: Uuid.nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const PageDetailResponse = z.object({
  page: PageDto,
  latest: PageRevisionDto,
  published: PageRevisionDto.nullable(),
  hasUnpublishedChanges: z.boolean(),
});
export const PageListResponse = z.object({
  pages: z.array(
    PageDto.extend({
      title: z.string(),
      slug: z.string(),
      hasUnpublishedChanges: z.boolean(),
    }),
  ),
});
export const PageIdParams = z.object({ id: Uuid });
export const PageListQuery = z.object({ locale: Locale.optional(), status: Status.optional() });
