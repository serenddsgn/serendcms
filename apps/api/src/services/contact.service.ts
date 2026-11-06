import { desc, eq } from 'drizzle-orm';
import { contactMessages, type ContactMessageRow, type Database } from '@serend/db';
import type { Locale } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';
import type { Mailer } from '../lib/mailer.js';

const dto = (m: ContactMessageRow) => ({
  id: m.id,
  locale: m.locale as Locale,
  name: m.name,
  email: m.email,
  message: m.message,
  status: m.status as 'new' | 'read' | 'spam' | 'archived',
  createdAt: m.createdAt.toISOString(),
});

/** Kontaktformular: Inhalte werden gespeichert, aber nie geloggt (weder hier noch im Fehlerfall). */
export function createContactService({
  db,
  mailer,
  config,
  log,
}: {
  db: Database;
  mailer: Mailer | undefined;
  config: Pick<AppConfig, 'contact'>;
  log?: { error: (obj: unknown, msg: string) => void };
}) {
  return {
    async submit(input: {
      name: string;
      email: string;
      message: string;
      locale: Locale;
      website?: string | undefined;
    }): Promise<void> {
      // Honeypot: Bots füllen das versteckte Feld. Die Antwort sieht wie Erfolg aus, es wird nichts gespeichert.
      if (input.website) return;
      await db.insert(contactMessages).values({
        locale: input.locale,
        name: input.name,
        email: input.email,
        message: input.message,
        consentAt: new Date(),
      });
      if (mailer && config.contact.notifyTo) {
        try {
          await mailer.send({
            to: config.contact.notifyTo,
            subject: `Neue Anfrage von ${input.name.replace(/[\r\n]+/g, ' ').slice(0, 80)}`,
            text: `${input.message}\n\n— ${input.name} <${input.email}> (${input.locale})`,
            replyTo: input.email,
          });
        } catch (err) {
          // Nur die Fehlerart, nie Nachrichteninhalt oder Absender
          log?.error(
            { errName: err instanceof Error ? err.name : 'Error' },
            'Benachrichtigung konnte nicht gesendet werden',
          );
        }
      }
    },
    async list() {
      return (await db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt))).map(
        dto,
      );
    },
    async setStatus(id: string, status: 'new' | 'read' | 'spam' | 'archived') {
      const [row] = await db
        .update(contactMessages)
        .set({ status })
        .where(eq(contactMessages.id, id))
        .returning();
      if (!row) throw errors.notFound('Nachricht nicht gefunden.');
      return dto(row);
    },
    async remove(id: string) {
      const rows = await db
        .delete(contactMessages)
        .where(eq(contactMessages.id, id))
        .returning({ id: contactMessages.id });
      if (rows.length === 0) throw errors.notFound('Nachricht nicht gefunden.');
    },
  };
}
export type ContactService = ReturnType<typeof createContactService>;
