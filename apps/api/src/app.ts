import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { DestinationStream } from 'pino';
import type { Database } from '@serend/db';
import type { AppConfig } from './config.js';
import { sessionCookieName } from './lib/cookies.js';
import { errors } from './lib/errors.js';
import { createLogger } from './lib/logger.js';
import { createPasswordHasher } from './lib/password.js';
import { registerAuthContext } from './plugins/auth-context.js';
import { registerErrorHandling } from './plugins/error-handler.js';
import { authRoutes } from './routes/auth.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import { mediaRoutes } from './routes/media.routes.js';
import { projectsRoutes } from './routes/projects.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { createAuthService } from './services/auth.service.js';
import { createLocalStorage } from './storage/local.js';
import type { Storage } from './storage/storage.js';
import { createMediaService } from './services/media.service.js';
import { createProjectsService } from './services/projects.service.js';
import { createUsersService } from './services/users.service.js';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  /** Nur für Tests: Log-Ausgabe abfangen. */
  logStream?: DestinationStream;
  /** Standard: lokales Dateisystem unter config.media.storageDir. */
  storage?: Storage;
  /** Wird nach Änderungen am veröffentlichten Stand aufgerufen (Phase 4: Build-Job). */
  onPublishedChange?: () => Promise<void>;
}

export const API_PREFIX = '/api/v1';

export async function buildApp({
  config,
  db,
  logStream,
  storage,
  onPublishedChange,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: createLogger(config, logStream),
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  // Basis-Header für alle Antworten; API-Antworten werden nie gecacht.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    if (request.url.startsWith('/api/') || request.url.startsWith('/internal/')) {
      reply.header('cache-control', 'no-store');
    }
  });

  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: config.media.maxBytes, files: 1, fields: 5, parts: 6 },
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => errors.rateLimited(),
  });

  if (config.docsEnabled) {
    await app.register(swagger, {
      openapi: {
        info: { title: 'serendCMS API', version: '0.1.0' },
        components: {
          securitySchemes: {
            session: { type: 'apiKey', in: 'cookie', name: sessionCookieName(config) },
            csrf: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/internal/docs' });
  }

  const hasher = createPasswordHasher(config.argon2);
  const authService = createAuthService({ db, config, hasher });
  const usersService = createUsersService({ db, hasher });
  const mediaService = createMediaService({
    db,
    storage: storage ?? createLocalStorage(config.media.storageDir),
  });
  const projectsService = createProjectsService({
    db,
    ...(onPublishedChange && { onPublishedChange }),
  });

  registerAuthContext(app, { config, authService });

  await app.register(internalRoutes, { db });
  await app.register(
    async (api) => {
      await api.register(authRoutes, { authService, config });
      await api.register(usersRoutes, { usersService });
      await api.register(mediaRoutes, { mediaService });
      await api.register(projectsRoutes, { projectsService });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
