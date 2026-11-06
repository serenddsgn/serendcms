import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CreateUserBody,
  OkResponse,
  ResetPasswordBody,
  UpdateUserBody,
  UserIdParams,
  UserListResponse,
  UserResponse,
} from '@serend/schema';
import { requireRole } from '../plugins/auth-context.js';
import type { UsersService } from '../services/users.service.js';
import { errorResponses } from './schemas.js';

export const usersRoutes: FastifyPluginAsyncZod<{ usersService: UsersService }> = async (
  app,
  { usersService },
) => {
  // Benutzerverwaltung nur für admin
  app.addHook('onRequest', requireRole('admin'));
  const tags = ['users'];

  app.get(
    '/users',
    {
      schema: {
        tags,
        summary: 'Benutzer auflisten',
        response: { 200: UserListResponse, ...errorResponses },
      },
    },
    async () => ({ users: await usersService.list() }),
  );

  app.post(
    '/users',
    {
      schema: {
        tags,
        summary: 'Benutzer anlegen',
        body: CreateUserBody,
        response: { 201: UserResponse, ...errorResponses },
      },
    },
    async (request, reply) => {
      const user = await usersService.create(request.body);
      return reply.status(201).send({ user });
    },
  );

  app.get(
    '/users/:id',
    {
      schema: {
        tags,
        summary: 'Benutzer',
        params: UserIdParams,
        response: { 200: UserResponse, ...errorResponses },
      },
    },
    async (request) => ({ user: await usersService.get(request.params.id) }),
  );

  app.patch(
    '/users/:id',
    {
      schema: {
        tags,
        summary: 'Name oder Rolle ändern',
        params: UserIdParams,
        body: UpdateUserBody,
        response: { 200: UserResponse, ...errorResponses },
      },
    },
    async (request) => ({
      user: await usersService.update(request.auth!.user.id, request.params.id, request.body),
    }),
  );

  app.post(
    '/users/:id/disable',
    {
      schema: {
        tags,
        summary: 'Benutzer deaktivieren (beendet seine Sessions)',
        params: UserIdParams,
        response: { 200: UserResponse, ...errorResponses },
      },
    },
    async (request) => ({
      user: await usersService.disable(request.auth!.user.id, request.params.id),
    }),
  );

  app.post(
    '/users/:id/enable',
    {
      schema: {
        tags,
        summary: 'Benutzer reaktivieren',
        params: UserIdParams,
        response: { 200: UserResponse, ...errorResponses },
      },
    },
    async (request) => ({ user: await usersService.enable(request.params.id) }),
  );

  app.post(
    '/users/:id/reset-password',
    {
      schema: {
        tags,
        summary: 'Neues Passwort setzen (beendet seine Sessions)',
        params: UserIdParams,
        body: ResetPasswordBody,
        response: { 200: OkResponse, ...errorResponses },
      },
    },
    async (request) => {
      await usersService.resetPassword(request.params.id, request.body.newPassword);
      return { ok: true as const };
    },
  );
};
