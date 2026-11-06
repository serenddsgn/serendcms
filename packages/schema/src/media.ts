import { z } from 'zod';
import { LOCALES, Uuid } from './common.js';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Alt-Text je Sprache; fehlende Sprachen sind erlaubt, aber nicht veröffentlichbar. */
export const AltTexts = z.partialRecord(z.enum(LOCALES), z.string().trim().max(300));
export type AltTexts = z.infer<typeof AltTexts>;

export const MediaDto = z.object({
  id: Uuid,
  filename: z.string(),
  mime: z.string(),
  byteSize: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  altText: AltTexts,
  focalX: z.number().int(),
  focalY: z.number().int(),
  inUse: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type MediaDto = z.infer<typeof MediaDto>;

export const UpdateMediaBody = z
  .object({
    altText: AltTexts.optional(),
    focalX: z.number().int().min(0).max(100).optional(),
    focalY: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Mindestens ein Feld angeben' });

export const MediaIdParams = z.object({ id: Uuid });
export const MediaListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});
export const MediaListResponse = z.object({ media: z.array(MediaDto), total: z.number().int() });
export const MediaResponse = z.object({ media: MediaDto });
export const ThumbQuery = z.object({ w: z.coerce.number().int().min(64).max(1600).default(320) });
