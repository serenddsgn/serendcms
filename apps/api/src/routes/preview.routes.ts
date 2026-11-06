import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Uuid } from '@serend/schema';
import { errors } from '../lib/errors.js';
import type { BuildService_ } from '../services/build.service.js';
import type { PreviewService } from '../services/preview.service.js';

/**
 * /internal/preview/*: nur lokal erreichbar. Der Bearer ist das signierte Vorschau-Token der Anfrage, nicht ein
 * dauerhaftes Secret. So hält der Astro-SSR-Prozess selbst kein Secret.
 */
export const previewRoutes: FastifyPluginAsyncZod<{
  previewService: PreviewService;
  buildService: BuildService_;
}> = async (app, { previewService, buildService }) => {
  app.addHook('onRequest', async (request) => {
    if (
      request.headers['x-forwarded-for'] !== undefined ||
      request.headers['x-forwarded-host'] !== undefined
    )
      throw errors.forbidden();
  });
  const payloadOf = (header: string | undefined) =>
    previewService.verify(header?.startsWith('Bearer ') ? header.slice(7) : '');

  app.get('/internal/preview/bundle', { schema: { hide: true } }, async (request) =>
    previewService.bundle(payloadOf(request.headers.authorization)),
  );

  app.get(
    '/internal/preview/media/:id/file',
    { schema: { hide: true, params: z.object({ id: Uuid }) } },
    async (request, reply) => {
      const payload = payloadOf(request.headers.authorization);
      await previewService.mediaFile(payload, request.params.id);
      const { buffer, mime } = await buildService.mediaFileUnchecked(request.params.id);
      return reply.header('content-type', mime).send(buffer);
    },
  );
};
