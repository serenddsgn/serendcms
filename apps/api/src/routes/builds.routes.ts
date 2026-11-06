import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  BuildCreatedResponse,
  BuildDetailResponse,
  BuildIdParams,
  BuildListQuery,
  BuildListResponse,
  ReleaseIdParams,
  ReleaseListResponse,
  StatusResponse,
  ReleaseDto,
} from '@serend/schema';
import { z } from 'zod';
import { requireRole } from '../plugins/auth-context.js';
import type { BuildsService } from '../services/builds.service.js';
import { errorResponses } from './schemas.js';

export const buildsRoutes: FastifyPluginAsyncZod<{ buildsService: BuildsService }> = async (
  app,
  { buildsService },
) => {
  const tags = ['builds'];
  const editor = requireRole('admin', 'editor');

  app.get(
    '/status',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Offene Änderungen, aktives Release, letzter Build',
        response: { 200: StatusResponse, ...errorResponses },
      },
    },
    async () => buildsService.status(),
  );

  app.get(
    '/builds',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Build-Verlauf',
        querystring: BuildListQuery,
        response: { 200: BuildListResponse, ...errorResponses },
      },
    },
    async (request) => ({
      builds: await buildsService.list(request.query.limit),
    }),
  );

  app.get(
    '/builds/:id',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Build mit Log und Prüfergebnissen',
        params: BuildIdParams,
        response: { 200: BuildDetailResponse, ...errorResponses },
      },
    },
    async (request) => ({
      build: await buildsService.get(request.params.id),
    }),
  );

  app.post(
    '/builds',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Build manuell anstoßen (verschmilzt mit einem wartenden Build)',
        response: { 202: BuildCreatedResponse, ...errorResponses },
      },
    },
    async (request, reply) =>
      reply.status(202).send(await buildsService.triggerManual(request.auth!.user.id)),
  );

  app.get(
    '/releases',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Releases',
        response: { 200: ReleaseListResponse, ...errorResponses },
      },
    },
    async () => ({
      releases: await buildsService.releases(),
    }),
  );

  app.post(
    '/releases/:id/activate',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary: 'Rollback: früheres Release aktivieren (nur admin)',
        params: ReleaseIdParams,
        response: { 200: z.object({ release: ReleaseDto }), ...errorResponses },
      },
    },
    async (request) => ({ release: await buildsService.activate(request.params.id) }),
  );
};
