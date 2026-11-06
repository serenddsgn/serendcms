import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  MediaIdParams,
  MediaListQuery,
  MediaListResponse,
  MediaResponse,
  OkResponse,
  ThumbQuery,
  UpdateMediaBody,
} from '@serend/schema';
import { AppError } from '../lib/errors.js';
import { requireRole } from '../plugins/auth-context.js';
import type { MediaService } from '../services/media.service.js';
import { errorResponses } from './schemas.js';

const SAFE_FILE_HEADERS = {
  'content-security-policy': "default-src 'none'; sandbox",
  'cache-control': 'private, max-age=300',
};

export const mediaRoutes: FastifyPluginAsyncZod<{ mediaService: MediaService }> = async (
  app,
  { mediaService },
) => {
  app.addHook('onRequest', requireRole('admin', 'editor'));
  const tags = ['media'];

  app.post(
    '/media',
    {
      schema: {
        tags,
        summary: 'Bild hochladen (multipart/form-data, Feld „file“; Typ per Magic Bytes geprüft)',
        response: { 201: MediaResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      const part = await request.file();
      if (!part) throw new AppError(400, 'bad_request', 'Datei fehlt.');
      const buffer = await part.toBuffer(); // wirft 413 bei Überschreitung des Limits
      const media = await mediaService.upload(request.auth!.user.id, part.filename, buffer);
      return reply.status(201).send({ media });
    },
  );

  app.get(
    '/media',
    {
      schema: {
        tags,
        summary: 'Medien auflisten',
        querystring: MediaListQuery,
        response: { 200: MediaListResponse, ...errorResponses },
      },
    },
    async (request) => mediaService.list(request.query.limit, request.query.offset),
  );

  app.get(
    '/media/:id',
    {
      schema: {
        tags,
        summary: 'Medium',
        params: MediaIdParams,
        response: { 200: MediaResponse, ...errorResponses },
      },
    },
    async (request) => ({ media: await mediaService.get(request.params.id) }),
  );

  app.patch(
    '/media/:id',
    {
      schema: {
        tags,
        summary: 'Alt-Texte und Fokuspunkt ändern',
        params: MediaIdParams,
        body: UpdateMediaBody,
        response: { 200: MediaResponse, ...errorResponses },
      },
    },
    async (request) => ({ media: await mediaService.update(request.params.id, request.body) }),
  );

  app.delete(
    '/media/:id',
    {
      schema: {
        tags,
        summary: 'Medium löschen (409, wenn referenziert)',
        params: MediaIdParams,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      await mediaService.remove(request.params.id);
      return { ok: true as const };
    },
  );

  app.get(
    '/media/:id/file',
    { schema: { tags, summary: 'Originaldatei (nur Admin-Vorschau)', params: MediaIdParams } },
    async (request, reply) => {
      const { buffer, mime } = await mediaService.file(request.params.id);
      return reply.headers({ ...SAFE_FILE_HEADERS, 'content-type': mime }).send(buffer);
    },
  );

  app.get(
    '/media/:id/thumb',
    {
      schema: {
        tags,
        summary: 'Vorschaubild (WebP)',
        params: MediaIdParams,
        querystring: ThumbQuery,
      },
    },
    async (request, reply) => {
      const buffer = await mediaService.thumb(request.params.id, request.query.w);
      return reply.headers({ ...SAFE_FILE_HEADERS, 'content-type': 'image/webp' }).send(buffer);
    },
  );
};
