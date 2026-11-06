import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContactMessageDto,
  ContactStatusBody,
  IdParams,
  LocaleQuery,
  NavItemBody,
  NavItemDto,
  NavItemUpdateBody,
  OkResponse,
  OrderIdsBody,
  ServiceBody,
  ServiceDto,
  ServiceUpdateBody,
  SettingBody,
  SettingDto,
  SettingParams,
  SettingQuery,
  TeamMemberBody,
  TeamMemberDto,
  TeamMemberUpdateBody,
} from '@serend/schema';
import { requireRole } from '../plugins/auth-context.js';
import type { ContactService } from '../services/contact.service.js';
import type { SiteService } from '../services/site.service.js';
import { errorResponses } from './schemas.js';

export const siteRoutes: FastifyPluginAsyncZod<{
  siteService: SiteService;
  contactService: ContactService;
}> = async (app, { siteService, contactService }) => {
  const editor = requireRole('admin', 'editor');
  const adminOnly = requireRole('admin');
  const ok = { 200: OkResponse, ...errorResponses };

  // Einheitliche CRUD-Form für Leistungen, Navigation und Team
  function crud(
    path: string,
    tag: string,
    dto: z.ZodType,
    createBody: z.ZodType,
    updateBody: z.ZodType,
    svc: {
      list: (locale?: string) => Promise<unknown[]>;
      create: (b: never) => Promise<unknown>;
      update: (id: string, b: never) => Promise<unknown>;
      remove: (id: string) => Promise<void>;
      order: (ids: string[]) => Promise<void>;
    },
  ) {
    const tags = [tag];
    app.get(
      `/${path}`,
      {
        onRequest: [editor],
        schema: {
          tags,
          querystring: LocaleQuery,
          response: { 200: z.object({ items: z.array(dto) }), ...errorResponses },
        },
      },
      async (request) => ({ items: await svc.list(request.query.locale) }) as never,
    );
    app.post(
      `/${path}`,
      {
        onRequest: [editor],
        schema: {
          tags,
          body: createBody,
          response: { 201: z.object({ item: dto }), ...errorResponses },
        },
      },
      async (request, reply) => {
        const item = await svc.create(request.body as never);
        void reply.status(201);
        return { item } as never;
      },
    );
    app.put(
      `/${path}/order`,
      {
        onRequest: [editor],
        schema: {
          tags,
          summary: 'Reihenfolge (Drag & Drop, eine Sprache)',
          body: OrderIdsBody,
          response: ok,
        },
      },
      async (request) => {
        await svc.order(request.body.ids);
        return { ok: true as const };
      },
    );
    app.patch(
      `/${path}/:id`,
      {
        onRequest: [editor],
        schema: {
          tags,
          params: IdParams,
          body: updateBody,
          response: { 200: z.object({ item: dto }), ...errorResponses },
        },
      },
      async (request) =>
        ({ item: await svc.update(request.params.id, request.body as never) }) as never,
    );
    app.delete(
      `/${path}/:id`,
      { onRequest: [editor], schema: { tags, params: IdParams, response: ok } },
      async (request) => {
        await svc.remove(request.params.id);
        return { ok: true as const };
      },
    );
  }

  crud(
    'services',
    'services',
    ServiceDto,
    ServiceBody,
    ServiceUpdateBody,
    siteService.services as never,
  );
  crud(
    'navigation',
    'navigation',
    NavItemDto,
    NavItemBody,
    NavItemUpdateBody,
    siteService.navigation as never,
  );
  crud(
    'team',
    'team',
    TeamMemberDto,
    TeamMemberBody,
    TeamMemberUpdateBody,
    siteService.team as never,
  );

  // Einstellungen: lesen editor+, ändern nur admin
  app.get(
    '/settings',
    {
      onRequest: [editor],
      schema: {
        tags: ['settings'],
        response: { 200: z.object({ settings: z.array(SettingDto) }), ...errorResponses },
      },
    },
    async () => ({
      settings: await siteService.settings.list(),
    }),
  );
  app.put(
    '/settings/:key',
    {
      onRequest: [adminOnly],
      schema: {
        tags: ['settings'],
        summary: 'Einstellung setzen (pro Key per Zod validiert, löst einen Build aus)',
        params: SettingParams,
        querystring: SettingQuery,
        body: SettingBody,
        response: { 200: z.object({ setting: SettingDto }), ...errorResponses },
      },
    },
    async (request) => ({
      setting: await siteService.settings.put(
        request.params.key,
        request.query.locale,
        request.body.value,
      ),
    }),
  );

  // Kontaktnachrichten
  app.get(
    '/contact-messages',
    {
      onRequest: [editor],
      schema: {
        tags: ['contact'],
        response: { 200: z.object({ messages: z.array(ContactMessageDto) }), ...errorResponses },
      },
    },
    async () => ({
      messages: await contactService.list(),
    }),
  );
  app.patch(
    '/contact-messages/:id',
    {
      onRequest: [editor],
      schema: {
        tags: ['contact'],
        params: IdParams,
        body: ContactStatusBody,
        response: { 200: z.object({ message: ContactMessageDto }), ...errorResponses },
      },
    },
    async (request) => ({
      message: await contactService.setStatus(request.params.id, request.body.status),
    }),
  );
  app.delete(
    '/contact-messages/:id',
    { onRequest: [adminOnly], schema: { tags: ['contact'], params: IdParams, response: ok } },
    async (request) => {
      await contactService.remove(request.params.id);
      return { ok: true as const };
    },
  );
};
