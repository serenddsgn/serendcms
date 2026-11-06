import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ContactBody, OkResponse } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';
import type { ContactService } from '../services/contact.service.js';
import { errorResponses } from './schemas.js';

/**
 * Einziger öffentlicher Schreib-Endpunkt (Ausnahme von „keine öffentliche API“): das Kontaktformular.
 * Caddy leitet `POST /api/contact` der Website hierher, daher ist kein CORS nötig. Es gibt keine öffentlichen Lese-Endpunkte.
 */
export const publicRoutes: FastifyPluginAsyncZod<{
  contactService: ContactService;
  config: Pick<AppConfig, 'rateLimit'>;
}> = async (app, { contactService, config }) => {
  app.post(
    '/public/contact',
    {
      config: {
        publicForm: true,
        rateLimit: {
          max: config.rateLimit.contactMax,
          timeWindow: config.rateLimit.contactWindowMs,
        },
      },
      schema: {
        tags: ['public'],
        summary: 'Kontaktformular (rate-limitiert, Honeypot)',
        body: ContactBody,
        response: { 201: OkResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      await contactService.submit(request.body);
      return reply.status(201).send({ ok: true as const });
    },
  );
  void errors;
};
