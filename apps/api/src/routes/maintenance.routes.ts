import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  MaintenanceBody,
  MaintenanceEnterQuery,
  MaintenancePassResponse,
  MaintenanceResponse,
} from '@serend/schema';
import type { AppConfig } from '../config.js';
import { requireRole } from '../plugins/auth-context.js';
import type { MaintenanceService } from '../services/maintenance.service.js';
import { errorResponses } from './schemas.js';

export const passCookieName = (c: Pick<AppConfig, 'cookieSecure'>) =>
  c.cookieSecure ? '__Host-serend_pass' : 'serend_pass';

/** Admin: Wartungsmodus lesen, ändern (nur admin), Zugangs-Link erzeugen. Dazu der Einstieg der öffentlichen Domain. */
export const maintenanceRoutes: FastifyPluginAsyncZod<{
  maintenanceService: MaintenanceService;
  config: Pick<AppConfig, 'cookieSecure'>;
}> = async (app, { maintenanceService, config }) => {
  const tags = ['maintenance'];
  const editor = requireRole('admin', 'editor');

  app.get(
    '/maintenance',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Wartungsmodus',
        response: { 200: MaintenanceResponse, ...errorResponses },
      },
    },
    async () => ({
      maintenance: await maintenanceService.get(),
    }),
  );

  app.put(
    '/maintenance',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary:
          'Wartungsmodus ein-/ausschalten und Texte/Logo setzen (nur admin; wirkt sofort, kein Build nötig)',
        body: MaintenanceBody,
        response: { 200: MaintenanceResponse, ...errorResponses },
      },
    },
    async (request) => ({
      maintenance: await maintenanceService.update(request.auth!.user.id, request.body),
    }),
  );

  app.post(
    '/maintenance/pass',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Einmal-Link (5 Min.), der die echte Seite für diesen Browser freischaltet',
        response: { 200: MaintenancePassResponse, ...errorResponses },
      },
    },
    async () => maintenanceService.passLink(),
  );

  // Öffentlich erreichbar (Caddy leitet /__maintenance/enter hierher): tauscht den Einmal-Link gegen ein HttpOnly-Cookie.
  app.get(
    '/public/maintenance/enter',
    { schema: { tags: ['public'], hide: true, querystring: MaintenanceEnterQuery } },
    async (request, reply) => {
      const { cookie, expiresAt } = maintenanceService.enter(request.query.token);
      void reply.setCookie(passCookieName(config), cookie, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });
      return reply.redirect('/', 302);
    },
  );
};

/** /internal: von Caddy (forward_auth) pro Anfrage im Wartungsmodus aufgerufen. Nur localhost. */
export const maintenanceInternalRoutes: FastifyPluginAsyncZod<{
  maintenanceService: MaintenanceService;
  config: Pick<AppConfig, 'cookieSecure'>;
}> = async (app, { maintenanceService, config }) => {
  app.get('/internal/maintenance/check', { schema: { hide: true } }, async (request, reply) => {
    const ok = maintenanceService.isPassed(request.cookies[passCookieName(config)]);
    return reply.status(ok ? 204 : 401).send();
  });
};
