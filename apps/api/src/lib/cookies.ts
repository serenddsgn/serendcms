import type { CookieSerializeOptions } from '@fastify/cookie';
import type { AppConfig } from '../config.js';

/** Mit Secure-Flag zusätzlich das __Host--Präfix (Path=/, kein Domain-Attribut). */
export function sessionCookieName(config: Pick<AppConfig, 'cookieSecure'>): string {
  return config.cookieSecure ? '__Host-serend_sid' : 'serend_sid';
}

export function sessionCookieOptions(
  config: Pick<AppConfig, 'cookieSecure'>,
): CookieSerializeOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}
