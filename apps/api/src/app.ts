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
import { buildRoutes } from './routes/build.routes.js';
import { buildsRoutes } from './routes/builds.routes.js';
import { maintenanceInternalRoutes, maintenanceRoutes } from './routes/maintenance.routes.js';
import { pagesRoutes } from './routes/pages.routes.js';
import { previewRoutes } from './routes/preview.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { siteRoutes } from './routes/site.routes.js';
import { mediaRoutes } from './routes/media.routes.js';
import { projectsRoutes } from './routes/projects.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { createAuthService } from './services/auth.service.js';
import { createLocalStorage } from './storage/local.js';
import type { Storage } from './storage/storage.js';
import { createMaintenanceService } from './services/maintenance.service.js';
import { createContactService } from './services/contact.service.js';
import { createPreviewService } from './services/preview.service.js';
import { createSiteService } from './services/site.service.js';
import { createSmtpMailer, type Mailer } from './lib/mailer.js';
import { createBuildsService, type BuildQueue } from './services/builds.service.js';
import { createBuildService } from './services/build.service.js';
import { createMediaService } from './services/media.service.js';
import { createPagesService } from './services/pages.service.js';
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
  /** Warteschlange für Build-Jobs (pg-boss im Betrieb). Ohne Angabe wird nur der Build-Datensatz angelegt. */
  queue?: BuildQueue;
  /** Versand der Kontakt-Benachrichtigung (SMTP im Betrieb, Attrappe in Tests). */
  mailer?: Mailer;
}

export const API_PREFIX = '/api/v1';

export async function buildApp({
  config,
  db,
  logStream,
  storage,
  onPublishedChange,
  queue,
  mailer,
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
  const storageImpl = storage ?? createLocalStorage(config.media.storageDir);
  const mediaService = createMediaService({ db, storage: storageImpl });
  const buildsService = createBuildsService({
    db,
    queue: queue ?? { enqueue: async () => {} },
    config,
    log: app.log,
  });
  // Veröffentlichungsänderungen legen einen Build an; ein zusätzlicher Hook (Tests) wird mit aufgerufen.
  const publishedChanged = async () => {
    await buildsService.onPublishedChange();
    await onPublishedChange?.();
  };
  const projectsService = createProjectsService({ db, onPublishedChange: publishedChanged });
  const pagesService = createPagesService({ db, onPublishedChange: publishedChanged });
  const buildService = createBuildService({ db, storage: storageImpl });
  const siteService = createSiteService({
    db,
    onSiteChange: () => buildsService.onPublishedChange(),
  });
  const contactService = createContactService({
    db,
    mailer: mailer ?? createSmtpMailer(config.smtp),
    config,
    log: app.log,
  });
  const maintenanceService = createMaintenanceService({
    db,
    storage: storageImpl,
    config,
    log: app.log,
  });
  const previewService = createPreviewService({ db, config, buildService });

  registerAuthContext(app, { config, authService });

  await app.register(internalRoutes, { db });
  await app.register(buildRoutes, { buildService, buildToken: config.buildToken });
  await app.register(previewRoutes, { previewService, buildService });
  await app.register(maintenanceInternalRoutes, { maintenanceService, config });
  await app.register(
    async (api) => {
      await api.register(authRoutes, { authService, config });
      await api.register(usersRoutes, { usersService });
      await api.register(mediaRoutes, { mediaService });
      await api.register(projectsRoutes, { projectsService, previewService });
      await api.register(pagesRoutes, { pagesService, previewService });
      await api.register(siteRoutes, { siteService, contactService });
      await api.register(publicRoutes, { contactService, config });
      await api.register(maintenanceRoutes, { maintenanceService, config });
      await api.register(buildsRoutes, { buildsService });
    },
    { prefix: API_PREFIX },
  );

  // Dateien passend zum gespeicherten Zustand schreiben (z. B. nach einer Wiederherstellung); schlägt nie den Start fehl
  void maintenanceService
    .apply()
    .catch((err) =>
      app.log.error(
        { errName: err instanceof Error ? err.name : 'Error' },
        'Wartungsmodus konnte nicht angewendet werden',
      ),
    );

  return app;
}
