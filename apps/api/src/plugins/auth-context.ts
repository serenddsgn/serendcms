import type { FastifyInstance, onRequestAsyncHookHandler } from 'fastify';
import type { Role } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { sessionCookieName } from '../lib/cookies.js';
import { errors } from '../lib/errors.js';
import { safeEqual } from '../lib/tokens.js';
import type { AuthService } from '../services/auth.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Löst die Session aus dem Cookie auf und schützt schreibende Requests:
 *  1. Origin-Header (falls vorhanden) muss ADMIN_ORIGIN entsprechen,
 *  2. mit gültiger Session ist der Header `x-csrf-token` Pflicht.
 */
export function registerAuthContext(
  app: FastifyInstance,
  deps: { config: Pick<AppConfig, 'cookieSecure' | 'adminOrigin'>; authService: AuthService },
): void {
  const cookieName = sessionCookieName(deps.config);
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;

    const token = request.cookies[cookieName];
    if (token) request.auth = (await deps.authService.authenticate(token)) ?? null;

    if (SAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== deps.config.adminOrigin) throw errors.origin();

    if (request.auth && !request.routeOptions.config.skipCsrf) {
      const sent = request.headers['x-csrf-token'];
      if (typeof sent !== 'string' || !safeEqual(sent, request.auth.csrfToken)) throw errors.csrf();
    }
  });
}

/** Läuft als onRequest-Hook der Route, also vor der Body-Validierung. */
export const requireAuth: onRequestAsyncHookHandler = async (request) => {
  if (!request.auth) throw errors.unauthenticated();
};

/** Rollenprüfung ausschließlich serverseitig. */
export function requireRole(...roles: Role[]): onRequestAsyncHookHandler {
  return async (request) => {
    if (!request.auth) throw errors.unauthenticated();
    if (!roles.includes(request.auth.user.role)) throw errors.forbidden();
  };
}
