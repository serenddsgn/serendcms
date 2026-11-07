import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { CodeStatusResponse, OkResponse } from '@serend/schema';
import { requireRole } from '../plugins/auth-context.js';
import type { DeployService } from '../services/deploy.service.js';
import { errorResponses } from './schemas.js';

/** Code-Deployment (git pull + deploy.sh) aus dem Admin: nur Administratoren, denn es ändert die laufende Software. */
export const deployRoutes: FastifyPluginAsyncZod<{ deployService: DeployService }> = async (
  app,
  { deployService },
) => {
  const tags = ['deploy'];
  const admin = requireRole('admin');

  app.get(
    '/code',
    {
      onRequest: [admin],
      schema: {
        tags,
        summary: 'Code-Stand des Servers gegenüber origin/main und Stand des Deployments',
        response: { 200: CodeStatusResponse, ...errorResponses },
      },
    },
    async () => deployService.status(),
  );

  app.post(
    '/code/check',
    {
      onRequest: [admin],
      schema: {
        tags,
        summary: 'Jetzt bei GitHub nachsehen (git fetch) und den frischen Stand liefern',
        response: { 200: CodeStatusResponse, ...errorResponses },
      },
    },
    async () => deployService.checkNow(),
  );

  app.post(
    '/code/deploy',
    {
      onRequest: [admin],
      schema: {
        tags,
        summary: 'Code-Deployment anfordern (der Deploy-Dienst führt deploy.sh aus)',
        response: { 202: OkResponse, ...errorResponses },
      },
    },
    async (_request, reply) => {
      await deployService.deploy();
      return reply.status(202).send({ ok: true as const });
    },
  );
};
