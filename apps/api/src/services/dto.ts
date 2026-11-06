import type { UserRow } from '@serend/db';
import type { Role, UserDto } from '@serend/schema';

/** Explizite Feldauswahl: nie ganze DB-Zeilen (insbesondere kein passwordHash) ausgeben. */
export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as Role,
    disabled: row.disabledAt !== null,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}

import type { MediaRow, ProjectMediaRow, ProjectRevisionRow, ProjectRow } from '@serend/db';
import {
  upgradeContent,
  type AltTexts,
  type Category,
  type Inline,
  type MediaDto,
  type ProjectContent,
  type ProjectRevisionDto,
  type Locale,
  type Status,
} from '@serend/schema';

export function toMediaDto(row: MediaRow, inUse: boolean): MediaDto {
  return {
    id: row.id,
    filename: row.originalFilename,
    mime: row.mime,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    altText: row.altText as AltTexts,
    focalX: row.focalX,
    focalY: row.focalY,
    inUse,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toProjectDto(row: ProjectRow) {
  return {
    id: row.id,
    locale: row.locale as Locale,
    translationGroupId: row.translationGroupId,
    status: row.status as Status,
    featured: row.featured,
    featuredSortOrder: row.featuredSortOrder,
    sortOrder: row.sortOrder,
    publishedRevisionId: row.publishedRevisionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRevisionDto(
  row: ProjectRevisionRow,
  gallery: ProjectMediaRow[],
): ProjectRevisionDto {
  return {
    id: row.id,
    revisionNo: row.revisionNo,
    schemaVersion: row.schemaVersion,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle as Inline | null,
    year: row.year,
    categories: row.categories as Category[],
    color: row.color,
    tileColor: row.tileColor,
    client: row.client,
    liveUrl: row.liveUrl,
    coverMediaId: row.coverMediaId,
    nextProjectId: row.nextProjectId,
    // Sicherheitsnetz: ältere Schema-Versionen werden beim Lesen hochgezogen.
    content: upgradeContent(row.content, row.schemaVersion) as ProjectContent,
    gallery: gallery.map((g) => ({ mediaId: g.mediaId, altOverride: g.altOverride })),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogMediaId: row.ogMediaId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
