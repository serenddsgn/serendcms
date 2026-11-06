import { z } from 'zod';

export const Uuid = z.uuid();

export const LOCALES = ['de', 'en'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;
export const DEFAULT_LOCALE: Locale = 'de';

/** Einheitliches Fehlerformat der API. */
export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const ERROR_CODES = [
  'validation_error',
  'bad_request',
  'payload_too_large',
  'unauthenticated',
  'invalid_credentials',
  'forbidden',
  'csrf_invalid',
  'origin_invalid',
  'not_found',
  'conflict',
  'rate_limited',
  'unsupported_media_type',
  'internal_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche')
  .min(1)
  .max(80);

/** Routen-Segmente je Sprache (fest durch das Design: /de/projekte/…, /en/work/…). */
export const ROUTE_SEGMENTS: Record<Locale, { projects: string }> = {
  de: { projects: 'projekte' },
  en: { projects: 'work' },
};

export function projectPath(locale: Locale, slug: string): string {
  return `/${locale}/${ROUTE_SEGMENTS[locale].projects}/${slug}`;
}
export function projectIndexPath(locale: Locale): string {
  return `/${locale}/${ROUTE_SEGMENTS[locale].projects}/`;
}
export function pagePath(locale: Locale, slug: string): string {
  return `/${locale}/${slug}`;
}
