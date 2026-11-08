import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CreatePageBody,
  LinkTranslationBody,
  OkResponse,
  PageDetailResponse,
  PageIdParams,
  PageListQuery,
  PageListResponse,
  PreviewLinkResponse,
  SavePageDraftBody,
  TranslatePageBody,
} from '@serend/schema';
import { requireRole } from '../plugins/auth-context.js';
import type { PagesService } from '../services/pages.service.js';
import type { PreviewService } from '../services/preview.service.js';
import { errorResponses } from './schemas.js';

export const pagesRoutes: FastifyPluginAsyncZod<{
  pagesService: PagesService;
  previewService: PreviewService;
}> = async (app, { pagesService, previewService }) => {
  const tags = ['pages'];
  const editor = requireRole('admin', 'editor');
  const detail = { 200: PageDetailResponse, ...errorResponses };
  const actor = (r: { auth: { user: { id: string } } | null }) => r.auth!.user.id;

  app.get(
    '/pages',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Seiten auflisten',
        querystring: PageListQuery,
        response: { 200: PageListResponse, ...errorResponses },
      },
    },
    async (request) => ({
      pages: await pagesService.list(request.query),
    }),
  );

  app.post(
    '/pages',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Inhaltsseite anlegen (Systemseiten legt das Seeding an)',
        body: CreatePageBody.extend({}),
        response: { 201: PageDetailResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      // Systemseiten (home, projects) werden nicht über die API angelegt
      const body = { ...request.body, systemKey: null };
      return reply.status(201).send(await pagesService.create(actor(request), body));
    },
  );

  app.get(
    '/pages/:id',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Seite mit Entwurf und veröffentlichter Revision',
        params: PageIdParams,
        response: detail,
      },
    },
    async (request) => pagesService.get(request.params.id),
  );

  app.put(
    '/pages/:id/draft',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Entwurf speichern',
        params: PageIdParams,
        body: SavePageDraftBody,
        response: detail,
      },
    },
    async (request) => pagesService.saveDraft(actor(request), request.params.id, request.body),
  );

  app.post(
    '/pages/:id/translations',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Sprachversion als Kopie anlegen',
        params: PageIdParams,
        body: TranslatePageBody,
        response: { 201: PageDetailResponse, ...errorResponses },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await pagesService.translate(actor(request), request.params.id, request.body)),
  );

  app.put(
    '/pages/:id/translation-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Bestehende Seite der anderen Sprache als Sprachversion verknüpfen',
        params: PageIdParams,
        body: LinkTranslationBody,
        response: detail,
      },
    },
    async (request) => pagesService.linkTranslation(request.params.id, request.body.targetId),
  );

  app.delete(
    '/pages/:id/translation-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Verknüpfung mit der anderen Sprachversion lösen',
        params: PageIdParams,
        response: detail,
      },
    },
    async (request) => pagesService.unlinkTranslation(request.params.id),
  );

  app.post(
    '/pages/:id/publish',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Veröffentlichen (löst einen Build aus)',
        params: PageIdParams,
        response: detail,
      },
    },
    async (request) => pagesService.publish(request.params.id),
  );
  app.post(
    '/pages/:id/unpublish',
    {
      onRequest: [editor],
      schema: { tags, summary: 'Zurück zum Entwurf', params: PageIdParams, response: detail },
    },
    async (request) => pagesService.unpublish(request.params.id),
  );

  app.post(
    '/pages/:id/preview-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Signierter Vorschau-Link (max. 15 Minuten)',
        params: PageIdParams,
        response: { 200: PreviewLinkResponse, ...errorResponses },
      },
    },
    async (request) => previewService.pageLink(request.params.id),
  );

  app.delete(
    '/pages/:id',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary: 'Löschen (nur admin, nur nie veröffentlichte Inhaltsseiten)',
        params: PageIdParams,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      await pagesService.remove(request.params.id);
      return { ok: true as const };
    },
  );
};
