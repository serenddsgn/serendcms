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
