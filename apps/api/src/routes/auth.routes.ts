import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ChangePasswordBody, LoginBody, MeResponse, OkResponse } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { sessionCookieName, sessionCookieOptions } from '../lib/cookies.js';
import { requireAuth } from '../plugins/auth-context.js';
import type { AuthService } from '../services/auth.service.js';
import { errorResponses } from './schemas.js';

interface Options {
  authService: AuthService;
  config: Pick<AppConfig, 'cookieSecure' | 'rateLimit'>;
}

export const authRoutes: FastifyPluginAsyncZod<Options> = async (app, { authService, config }) => {
  const cookieName = sessionCookieName(config);
  const cookieOpts = sessionCookieOptions(config);

  app.post(
    '/auth/login',
    {
      config: {
        skipCsrf: true,
        rateLimit: { max: config.rateLimit.loginMax, timeWindow: config.rateLimit.loginWindowMs },
      },
      schema: {
        tags: ['auth'],
        summary: 'Anmelden (rate-limitiert)',
        body: LoginBody,
        response: { 200: MeResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      const result = await authService.login(request.body.email, request.body.password);
      reply.setCookie(cookieName, result.token, { ...cookieOpts, expires: result.expiresAt });
      return { user: result.user, csrfToken: result.csrfToken };
    },
  );

  app.post(
    '/auth/logout',
    {
      onRequest: [requireAuth],
      schema: {
        tags: ['auth'],
        summary: 'Abmelden',
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      await authService.logout(request.auth!.sessionId);
      reply.clearCookie(cookieName, cookieOpts);
      return { ok: true as const };
    },
  );

  app.get(
    '/auth/me',
    {
      onRequest: [requireAuth],
      schema: {
        tags: ['auth'],
        summary: 'Aktueller Benutzer und CSRF-Token',
        response: { 200: MeResponse, ...errorResponses },
      },
    },
    async (request) => ({ user: request.auth!.user, csrfToken: request.auth!.csrfToken }),
  );

  app.post(
    '/auth/password',
    {
      onRequest: [requireAuth],
      schema: {
        tags: ['auth'],
        summary: 'Eigenes Passwort ändern (beendet alle anderen Sessions)',
        body: ChangePasswordBody,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      const { user, sessionId } = request.auth!;
      await authService.changePassword(
        user.id,
        sessionId,
        request.body.currentPassword,
        request.body.newPassword,
      );
      return { ok: true as const };
    },
  );
};
