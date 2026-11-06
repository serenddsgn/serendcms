import type { FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import type { ErrorCode, ErrorResponse } from '@serend/schema';
import { AppError } from '../lib/errors.js';

function body(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

/**
 * Einheitliches Fehlerformat `{ error: { code, message } }`.
 * Interne Fehler werden geloggt, aber nie an Clients ausgegeben.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message));
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      // Nur Feldnamen, nie eingegebene Werte.
      const fields = [
        ...new Set(
          err.validation.map(
            (v) => v.instancePath.replace(/^\//, '').replaceAll('/', '.') || 'Body',
          ),
        ),
      ];
      return reply
        .status(400)
        .send(body('validation_error', `Ungültige Eingabe: ${fields.join(', ')}`));
    }

    if (!isResponseSerializationError(err)) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== undefined && status >= 400 && status < 500) {
        if (status === 413)
          return reply.status(413).send(body('payload_too_large', 'Anfrage zu groß.'));
        if (status === 415) {
          return reply
            .status(415)
            .send(body('unsupported_media_type', 'Nicht unterstützter Inhaltstyp.'));
        }
        if (status === 429)
          return reply.status(429).send(body('rate_limited', 'Zu viele Anfragen.'));
        return reply.status(status).send(body('bad_request', 'Ungültige Anfrage.'));
      }
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('internal_error', 'Interner Fehler.'));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(body('not_found', 'Nicht gefunden.'));
  });
}
