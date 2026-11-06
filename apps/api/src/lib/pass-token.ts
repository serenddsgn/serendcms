import { createHmac } from 'node:crypto';
import { safeEqual } from './tokens.js';

/**
 * Zugang zur Website während des Wartungsmodus. Zwei Arten, mit demselben Signaturschlüssel, aber getrennten `k`-Werten:
 *  - `enter`: Einmal-Link aus dem Admin (5 Minuten), wird gegen ein Cookie getauscht
 *  - `pass`:  Cookie auf der öffentlichen Domain (8 Stunden), das Caddy über die API prüfen lässt
 * Ein Vorschau-Token (andere Art) wird nie akzeptiert.
 */
export type PassKind = 'enter' | 'pass';
export const PASS_TTL_SECONDS: Record<PassKind, number> = { enter: 5 * 60, pass: 8 * 3600 };

const sign = (key: string, data: string) =>
  createHmac('sha256', key).update(data).digest('base64url');

export function signPassToken(
  key: string,
  kind: PassKind,
  now = Date.now(),
): { token: string; expiresAt: Date } {
  const iat = Math.floor(now / 1000);
  const exp = iat + PASS_TTL_SECONDS[kind];
  const body = Buffer.from(JSON.stringify({ k: `maintenance-${kind}`, iat, exp })).toString(
    'base64url',
  );
  return { token: `${body}.${sign(key, body)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPassToken(
  key: string,
  kind: PassKind,
  token: string,
  now = Date.now(),
): boolean {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, sign(key, body))) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      k?: string;
      iat?: number;
      exp?: number;
    };
    if (p.k !== `maintenance-${kind}` || !Number.isInteger(p.iat) || !Number.isInteger(p.exp))
      return false;
    if (p.exp! - p.iat! > PASS_TTL_SECONDS[kind]) return false;
    return Math.floor(now / 1000) < p.exp!;
  } catch {
    return false;
  }
}
