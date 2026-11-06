import type { FastifyBaseLogger } from 'fastify';
import { pino, type DestinationStream } from 'pino';
import type { AppConfig } from '../config.js';

/**
 * Niemals Passwörter, Tokens, Cookies oder Formularinhalte loggen:
 * - Header und Body-Felder werden zusätzlich zu den Serializern geschwärzt,
 * - URLs werden ohne Query-String protokolliert (spätere Vorschau-Tokens).
 */
export function createLogger(
  config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>,
  stream?: DestinationStream,
): FastifyBaseLogger {
  return pino(
    {
      level: config.nodeEnv === 'test' && !stream ? 'silent' : config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
          '*.password',
          '*.currentPassword',
          '*.newPassword',
          '*.passwordHash',
          '*.token',
          '*.csrfToken',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req(req: { method?: string; url?: string; ip?: string; id?: string }) {
          return { method: req.method, url: req.url?.split('?')[0], remoteAddress: req.ip };
        },
        res(res: { statusCode?: number }) {
          return { statusCode: res.statusCode };
        },
      },
    },
    stream,
  ) as FastifyBaseLogger;
}
