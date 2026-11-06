import { lt, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { contactMessages } from './schema.js';

/** Datenschutz: Kontaktnachrichten werden nach `days` Tagen endgültig gelöscht. Gibt die Anzahl zurück. */
export async function purgeContactMessages(db: Database, days: number): Promise<number> {
  const rows = await db
    .delete(contactMessages)
    .where(lt(contactMessages.createdAt, sql`now() - make_interval(days => ${days})`))
    .returning({ id: contactMessages.id });
  return rows.length;
}
