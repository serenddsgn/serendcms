import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Session-ID in der DB = HMAC des Cookie-Tokens; das Token selbst wird nie gespeichert. */
export function hashToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

/** Zeitkonstanter Vergleich beliebig langer Strings. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
