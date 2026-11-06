import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeContactMessages } from '@serend/db';
import type { Mailer } from '../src/lib/mailer.js';
import {
  as,
  createTestApp,
  editorSession,
  expectError,
  type Session,
  type TestApp,
} from './helpers.js';

const SITE = 'https://www.example.com';
const sent: Parameters<Mailer['send']>[0][] = [];
let failMail = false;
const mailer: Mailer = {
  async send(m) {
    if (failMail) throw new Error(`SMTP down (${m.text})`);
    sent.push(m);
  },
};

let t: TestApp;
let ed: Session;
let admin: Session;

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Erika Mustermann',
  email: 'erika@example.com',
  message: 'Wir brauchen einen Konfigurator für unseren Shop.',
  locale: 'de',
  consent: true,
  ...over,
});
const post = (payload: unknown, headers: Record<string, string> = { origin: SITE }) =>
  t.app.inject({
    method: 'POST',
    url: '/api/v1/public/contact',
    payload: payload as object,
    headers,
  });

beforeAll(async () => {
  t = await createTestApp({}, { mailer });
  ed = await editorSession(t, 'editor');
  admin = await editorSession(t, 'admin');
});
afterAll(() => t.close());

describe('Kontaktformular', () => {
  it('speichert die Nachricht, benachrichtigt per E-Mail und braucht weder Session noch CSRF', async () => {
    sent.length = 0;
    const res = await post(form());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'inbox@example.com',
      replyTo: 'erika@example.com',
      subject: 'Neue Anfrage von Erika Mustermann',
    });
    const list = (await as(t, ed, 'GET', '/api/v1/contact-messages')).json().messages;
    expect(list[0]).toMatchObject({ name: 'Erika Mustermann', status: 'new', locale: 'de' });
  });

  it('akzeptiert nur Anfragen von der Website-Domain (Origin Pflicht)', async () => {
    expectError(await post(form(), {}), 403, 'origin_invalid');
    expectError(await post(form(), { origin: 'https://evil.example' }), 403, 'origin_invalid');
    expectError(await post(form(), { origin: t.config.adminOrigin }), 403, 'origin_invalid'); // nicht die Admin-Domain
  });

  it('verwirft Honeypot-Treffer still (Erfolgsantwort, nichts gespeichert, keine Mail)', async () => {
    sent.length = 0;
    const before = (await t.handle.pool.query('select count(*)::int as n from contact_messages'))
      .rows[0].n;
    const res = await post(form({ website: 'https://spam.example', message: 'SPAMTEXT' }));
    expect(res.statusCode).toBe(201);
    expect(
      (await t.handle.pool.query('select count(*)::int as n from contact_messages')).rows[0].n,
    ).toBe(before);
    expect(sent).toHaveLength(0);
  });

  it('validiert Eingaben (Einwilligung Pflicht, E-Mail, Länge, Sprache)', async () => {
    for (const over of [
      { consent: false },
      { consent: undefined },
      { email: 'kaputt' },
      { name: '' },
      { message: '' },
      { message: 'x'.repeat(5001) },
      { locale: 'fr' },
    ]) {
      expectError(await post(form(over)), 400, 'validation_error');
    }
  });

  it('begrenzt die Anfragen pro Zeitfenster (Rate-Limit)', async () => {
    const limited = await createTestApp(
      {
        rateLimit: {
          loginMax: 1000,
          loginWindowMs: 60_000,
          contactMax: 3,
          contactWindowMs: 60_000,
        },
      },
      { mailer },
    );
    try {
      const send = () =>
        limited.app.inject({
          method: 'POST',
          url: '/api/v1/public/contact',
          payload: form() as object,
          headers: { origin: SITE },
        });
      for (let i = 0; i < 3; i++) expect((await send()).statusCode).toBe(201);
      const blocked = await send();
      expectError(blocked, 429, 'rate_limited');
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });

  it('schreibt Formularinhalte nie ins Log, auch nicht bei Fehlern', async () => {
    failMail = true;
    const secretText = 'GEHEIME-FORMULAR-NACHRICHT-8812';
    const res = await post(
      form({
        message: secretText,
        name: 'Geheimer Absender',
        email: 'absender-geheim@example.com',
      }),
    );
    failMail = false;
    expect(res.statusCode).toBe(201); // Mailfehler verhindert die Speicherung nicht
    const logs = t.logs.join('');
    expect(logs).toContain('Benachrichtigung konnte nicht gesendet werden');
    for (const s of [secretText, 'Geheimer Absender', 'absender-geheim@example.com'])
      expect(logs).not.toContain(s);
  });

  it('entfernt Zeilenumbrüche aus dem Betreff (Header-Injection)', async () => {
    sent.length = 0;
    await post(form({ name: 'Eve\r\nBcc: opfer@example.com' }));
    expect(sent[0]!.subject).not.toMatch(/[\r\n]/);
  });

  it('hat keine öffentlichen Lese-Endpunkte', async () => {
    expectError(await as(t, null, 'GET', '/api/v1/public/contact'), 404, 'not_found');
    expectError(await as(t, null, 'GET', '/api/v1/contact-messages'), 401, 'unauthenticated');
  });
});

describe('Posteingang', () => {
  it('lässt editor lesen und Status ändern, löschen nur admin', async () => {
    await post(form({ message: 'Eine weitere Anfrage' }));
    const msg = (await as(t, ed, 'GET', '/api/v1/contact-messages')).json().messages[0];
    expect(
      (await as(t, ed, 'PATCH', `/api/v1/contact-messages/${msg.id}`, { status: 'read' })).json()
        .message.status,
    ).toBe('read');
    expectError(
      await as(t, ed, 'PATCH', `/api/v1/contact-messages/${msg.id}`, { status: 'geloescht' }),
      400,
      'validation_error',
    );
    expectError(await as(t, ed, 'DELETE', `/api/v1/contact-messages/${msg.id}`), 403, 'forbidden');
    expect((await as(t, admin, 'DELETE', `/api/v1/contact-messages/${msg.id}`)).statusCode).toBe(
      200,
    );
    expectError(
      await as(t, admin, 'DELETE', `/api/v1/contact-messages/${msg.id}`),
      404,
      'not_found',
    );
  });

  it('löscht Nachrichten nach der Aufbewahrungsfrist', async () => {
    await post(form({ message: 'alt' }));
    await t.handle.pool.query(
      "update contact_messages set created_at = now() - interval '200 days' where message = 'alt'",
    );
    const removed = await purgeContactMessages(t.handle.db, 180);
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = (await as(t, ed, 'GET', '/api/v1/contact-messages')).json().messages as {
      message: string;
    }[];
    expect(left.some((m) => m.message === 'alt')).toBe(false);
    expect(left.length).toBeGreaterThan(0); // neuere bleiben
  });
});
