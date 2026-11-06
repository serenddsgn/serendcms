import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '@serend/db';
import { AppError } from '../lib/errors.js';

/**
 * /internal/*: nur lokal erreichbar, Caddy reicht diesen Pfad nie durch.
 * Die Build-Endpunkte (Phase 3) kommen hierher und verlangen das Build-Token.
 */
export const internalRoutes: FastifyPluginAsyncZod<{ db: Database }> = async (app, { db }) => {
  app.get(
    '/internal/health',
    { schema: { hide: true, response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => {
      try {
        await db.execute(sql`select 1`);
      } catch {
        throw new AppError(503, 'internal_error', 'Datenbank nicht erreichbar.');
      }
      return { status: 'ok' as const };
    },
  );
};
