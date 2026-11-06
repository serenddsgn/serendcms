import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BuildManifest,
  BuildMedia,
  BuildNavItem,
  BuildPage,
  BuildProject,
  BuildRedirect,
  BuildService,
  BuildSetting,
  Uuid,
} from '@serend/schema';
import { errors } from '../lib/errors.js';
import { safeEqual } from '../lib/tokens.js';
import type { BuildService_ } from '../services/build.service.js';
import { errorResponses } from './schemas.js';

/**
 * /internal/build/*: nur lokal erreichbar (Caddy reicht /internal nie durch) und zusätzlich per
 * Build-Token geschützt. Liefert ausschließlich freigegebene Inhalte.
 */
export const buildRoutes: FastifyPluginAsyncZod<{
  buildService: BuildService_;
  buildToken: string;
}> = async (app, { buildService, buildToken }) => {
  app.addHook('onRequest', async (request) => {
    // Anfragen, die über einen Proxy kamen, sind hier nie legitim.
    if (
      request.headers['x-forwarded-for'] !== undefined ||
      request.headers['x-forwarded-host'] !== undefined
    ) {
      throw errors.forbidden();
    }
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, buildToken)) throw errors.unauthenticated();
  });

  const tags = ['internal'];
  const list = <T extends z.ZodType>(name: string, schema: T, load: () => Promise<unknown>) =>
    app.get(
      `/internal/build/${name}`,
      { schema: { tags, hide: true, response: { 200: z.array(schema), ...errorResponses } } },
      async () => (await load()) as z.infer<T>[],
    );

  list('projects', BuildProject, buildService.projects);
  list('pages', BuildPage, buildService.pages);
  list('services', BuildService, buildService.services);
  list('navigation', BuildNavItem, buildService.navigation);
  list('settings', BuildSetting, buildService.settings);
  list('media', BuildMedia, buildService.media);
  list('redirects', BuildRedirect, buildService.redirects);

  app.get(
    '/internal/build/manifest',
    { schema: { tags, hide: true, response: { 200: BuildManifest, ...errorResponses } } },
    async () => buildService.manifest(),
  );

  app.get(
    '/internal/build/media/:id/file',
    { schema: { tags, hide: true, params: z.object({ id: Uuid }) } },
    async (request, reply) => {
      const { buffer, mime } = await buildService.mediaFile(request.params.id);
      return reply.header('content-type', mime).send(buffer);
    },
  );
};
