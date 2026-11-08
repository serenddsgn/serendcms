import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CreateProjectBody,
  OkResponse,
  OrderBody,
  ProjectDetailResponse,
  ProjectIdParams,
  ProjectListQuery,
  ProjectListResponse,
  RevisionListResponse,
  RevisionParams,
  RevisionResponse,
  PreviewLinkResponse,
  SaveDraftBody,
  LinkTranslationBody,
  TranslateBody,
  UpdateProjectBody,
} from '@serend/schema';
import { requireRole } from '../plugins/auth-context.js';
import type { PreviewService } from '../services/preview.service.js';
import type { ProjectsService } from '../services/projects.service.js';
import { errorResponses } from './schemas.js';

export const projectsRoutes: FastifyPluginAsyncZod<{
  projectsService: ProjectsService;
  previewService: PreviewService;
}> = async (app, { projectsService, previewService }) => {
  const tags = ['projects'];
  const editor = requireRole('admin', 'editor');
  const detail = { 200: ProjectDetailResponse, ...errorResponses };
  const actor = (r: { auth: { user: { id: string } } | null }) => r.auth!.user.id;

  app.get(
    '/projects',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Projekte auflisten',
        querystring: ProjectListQuery,
        response: { 200: ProjectListResponse, ...errorResponses },
      },
    },
    async (request) => ({ projects: await projectsService.list(request.query) }),
  );

  app.post(
    '/projects',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Projekt anlegen (Revision 1 als Entwurf)',
        body: CreateProjectBody,
        response: { 201: ProjectDetailResponse, ...errorResponses },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await projectsService.create(actor(request), request.body)),
  );

  app.put(
    '/projects/order',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Reihenfolge festlegen (Drag & Drop)',
        body: OrderBody,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      await projectsService.order(request.body.locale, request.body.ids);
      return { ok: true as const };
    },
  );

  app.get(
    '/projects/:id',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Projekt mit Entwurf und veröffentlichter Revision',
        params: ProjectIdParams,
        response: detail,
      },
    },
    async (request) => projectsService.get(request.params.id),
  );

  app.patch(
    '/projects/:id',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Stabile Felder ändern (featured, Reihenfolge)',
        params: ProjectIdParams,
        body: UpdateProjectBody,
        response: detail,
      },
    },
    async (request) => projectsService.update(request.params.id, request.body),
  );

  app.put(
    '/projects/:id/draft',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Entwurf speichern (legt nach Veröffentlichung eine neue Revision an)',
        params: ProjectIdParams,
        body: SaveDraftBody,
        response: detail,
      },
    },
    async (request) => projectsService.saveDraft(actor(request), request.params.id, request.body),
  );

  app.get(
    '/projects/:id/revisions',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Revisionsverlauf',
        params: ProjectIdParams,
        response: { 200: RevisionListResponse, ...errorResponses },
      },
    },
    async (request) => ({ revisions: await projectsService.revisions(request.params.id) }),
  );

  app.get(
    '/projects/:id/revisions/:revisionId',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Einzelne Revision',
        params: RevisionParams,
        response: { 200: RevisionResponse, ...errorResponses },
      },
    },
    async (request) => ({
      revision: await projectsService.revision(request.params.id, request.params.revisionId),
    }),
  );

  for (const [action, summary] of [
    ['publish', 'Neueste Revision veröffentlichen'],
    ['unpublish', 'Zurück zum Entwurf (nicht mehr öffentlich)'],
    ['archive', 'Archivieren (nicht mehr öffentlich)'],
    ['restore', 'Archiviertes Projekt als Entwurf wiederherstellen'],
  ] as const) {
    app.post(
      `/projects/:id/${action}`,
      { onRequest: [editor], schema: { tags, summary, params: ProjectIdParams, response: detail } },
      async (request) => projectsService[action](request.params.id),
    );
  }

  app.post(
    '/projects/:id/translations',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Sprachversion als Kopie anlegen',
        params: ProjectIdParams,
        body: TranslateBody,
        response: { 201: ProjectDetailResponse, ...errorResponses },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await projectsService.translate(actor(request), request.params.id, request.body)),
  );

  app.put(
    '/projects/:id/translation-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Bestehendes Projekt der anderen Sprache als Sprachversion verknüpfen',
        params: ProjectIdParams,
        body: LinkTranslationBody,
        response: detail,
      },
    },
    async (request) => projectsService.linkTranslation(request.params.id, request.body.targetId),
  );

  app.delete(
    '/projects/:id/translation-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Verknüpfung mit der anderen Sprachversion lösen',
        params: ProjectIdParams,
        response: detail,
      },
    },
    async (request) => projectsService.unlinkTranslation(request.params.id),
  );

  app.post(
    '/projects/:id/preview-link',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Signierter Vorschau-Link (max. 15 Minuten)',
        params: ProjectIdParams,
        response: { 200: PreviewLinkResponse, ...errorResponses },
      },
    },
    async (request) => previewService.projectLink(request.params.id),
  );

  app.delete(
    '/projects/:id',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary: 'Hart löschen (nur admin, nur nie veröffentlichte Projekte)',
        params: ProjectIdParams,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      await projectsService.remove(request.params.id);
      return { ok: true as const };
    },
  );
};
