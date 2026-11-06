import { createHmac } from 'node:crypto';
import { safeEqual } from './tokens.js';

/** Vorschau-Links gelten höchstens 15 Minuten. */
export const PREVIEW_MAX_TTL_SECONDS = 15 * 60;

export interface PreviewPayload {
  /** Art des Inhalts: project | page */
  k: 'project' | 'page';
  /** ID des Inhalts */
  id: string;
  iat: number;
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (key: string, data: string) =>
  createHmac('sha256', key).update(data).digest('base64url');

export function signPreviewToken(
  key: string,
  target: Pick<PreviewPayload, 'k' | 'id'>,
  now = Date.now(),
  ttlSeconds = PREVIEW_MAX_TTL_SECONDS,
): { token: string; expiresAt: Date } {
  const iat = Math.floor(now / 1000);
  const exp = iat + Math.min(ttlSeconds, PREVIEW_MAX_TTL_SECONDS);
  const body = b64(JSON.stringify({ ...target, iat, exp } satisfies PreviewPayload));
  return { token: `${body}.${sign(key, body)}`, expiresAt: new Date(exp * 1000) };
}

/** Prüft Signatur, Ablauf und die 15-Minuten-Obergrenze (auch bei manipuliertem Payload). */
export function verifyPreviewToken(
  key: string,
  token: string,
  now = Date.now(),
): PreviewPayload | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, sign(key, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PreviewPayload;
    if ((p.k !== 'project' && p.k !== 'page') || typeof p.id !== 'string') return null;
    if (!Number.isInteger(p.iat) || !Number.isInteger(p.exp)) return null;
    if (p.exp - p.iat > PREVIEW_MAX_TTL_SECONDS) return null;
    if (Math.floor(now / 1000) >= p.exp) return null;
    return p;
  } catch {
    return null;
  }
}
