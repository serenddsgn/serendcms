import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AnthropicStatusResponse,
  AutoTranslatePageBody,
  AutoTranslatePageResponse,
  AutoTranslateProjectBody,
  AutoTranslateProjectResponse,
  PageIdParams,
  ProjectIdParams,
  SaveAnthropicBody,
} from '@serend/schema';
import { errors } from '../lib/errors.js';
import { requireRole } from '../plugins/auth-context.js';
import { pagesRepo } from '../repositories/pages.repo.js';
import { projectsRepo } from '../repositories/projects.repo.js';
import type { Database } from '@serend/db';
import type { IntegrationsService } from '../services/integrations.service.js';
import type { TranslationService } from '../services/translation.service.js';
import { errorResponses } from './schemas.js';

/** Zugang zur automatischen Übersetzung (nur admin ändert) und die Übersetzungs-Endpunkte der Editoren. */
export const integrationsRoutes: FastifyPluginAsyncZod<{
  integrationsService: IntegrationsService;
  translationService: TranslationService;
  db: Database;
}> = async (app, { integrationsService, translationService, db }) => {
  const tags = ['integrations'];
  const editor = requireRole('admin', 'editor');
  const status = { 200: AnthropicStatusResponse, ...errorResponses };

  app.get(
    '/integrations/anthropic',
    {
      onRequest: [editor],
      schema: {
        tags,
        summary: 'Status der automatischen Übersetzung (nie der Key)',
        response: status,
      },
    },
    async () => ({ anthropic: await integrationsService.status() }),
  );

  app.put(
    '/integrations/anthropic',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary: 'Anthropic-Key (verschlüsselt gespeichert) und/oder Modell setzen (nur admin)',
        body: SaveAnthropicBody,
        response: status,
      },
    },
    async (request) => ({
      anthropic: await integrationsService.saveAnthropic(request.auth!.user.id, request.body),
    }),
  );

  app.delete(
    '/integrations/anthropic',
    {
      onRequest: [requireRole('admin')],
      schema: {
        tags,
        summary: 'Gespeicherten Anthropic-Key entfernen (nur admin)',
        response: status,
      },
    },
    async (request) => ({
      anthropic: await integrationsService.removeAnthropicKey(request.auth!.user.id),
    }),
  );

  // Zielsprache = Sprache der Seite bzw. des Projekts, Quellsprache = die andere
  const other = (locale: string) => (locale === 'de' ? 'en' : 'de') as 'de' | 'en';

  app.post(
    '/pages/:id/auto-translate',
    {
      onRequest: [editor],
      schema: {
        tags: ['pages'],
        summary:
          'Inhalt maschinell in die Sprache der Seite übersetzen (Vorschlag, wird nicht gespeichert)',
        params: PageIdParams,
        body: AutoTranslatePageBody,
        response: { 200: AutoTranslatePageResponse, ...errorResponses },
      },
    },
    async (request) => {
      const page = await pagesRepo(db).findPage(request.params.id);
      if (!page) throw errors.notFound('Seite nicht gefunden.');
      const to = page.locale as 'de' | 'en';
      const { result, model } = await translationService.translate(request.body, other(to), to);
      return { ...result, model };
    },
  );

  app.post(
    '/projects/:id/auto-translate',
    {
      onRequest: [editor],
      schema: {
        tags: ['projects'],
        summary:
          'Inhalt maschinell in die Sprache des Projekts übersetzen (Vorschlag, wird nicht gespeichert)',
        params: ProjectIdParams,
        body: AutoTranslateProjectBody,
        response: { 200: AutoTranslateProjectResponse, ...errorResponses },
      },
    },
    async (request) => {
      const project = await projectsRepo(db).findProject(request.params.id);
      if (!project) throw errors.notFound('Projekt nicht gefunden.');
      const to = project.locale as 'de' | 'en';
      const { result, model } = await translationService.translate(request.body, other(to), to);
      return { ...result, model };
    },
  );
};
