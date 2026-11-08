import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSecretBox } from '../src/lib/secret-box.js';
import { extractTexts } from '../src/lib/translate-content.js';
import { generateToken } from '../src/lib/tokens.js';
import type { ClaudeClient } from '../src/services/translation.service.js';
import {
  as,
  createTestApp,
  editorSession,
  expectError,
  type Session,
  type TestApp,
} from './helpers.js';

const KEY = 'sk-ant-api03-GEHEIMER-TESTKEY-1234567890';

/** Attrappe: „übersetzt“ jeden Eintrag zu `EN:<text>` und merkt sich, was gesendet wurde. */
function fakeClaude(
  behavior: (items: { id: number; text: string }[]) => string[] | Error = (items) =>
    items.map((i) => `EN:${i.text}`),
) {
  const calls: { apiKey: string; model: string; items: { id: number; text: string }[] }[] = [];
  const factory = (apiKey: string): ClaudeClient => ({
    messages: {
      stream: (params) => ({
        finalMessage: async () => {
          const content = params.messages[0]!.content as string;
          const items = JSON.parse(content.slice(content.indexOf('{'))).items as {
            id: number;
            text: string;
          }[];
          calls.push({ apiKey, model: params.model, items });
          const out = behavior(items);
          if (out instanceof Error) throw out;
          return {
            stop_reason: 'end_turn',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  translations: items.map((it, n) => ({ id: it.id, text: out[n] })),
                }),
                citations: null,
              },
            ],
          } as never;
        },
      }),
    },
  });
  return { factory, calls };
}

describe('Text-Extraktion', () => {
  it('findet nur Textfelder und lässt IDs, Links und Medien unberührt', () => {
    const tree = {
      title: 'Titel',
      content: [
        { id: randomUUID(), type: 'heading', level: 2, text: 'Überschrift' },
        {
          id: randomUUID(),
          type: 'image',
          mediaId: randomUUID(),
          caption: 'Bildunterschrift',
          size: 'full',
        },
        {
          id: randomUUID(),
          type: 'richtext',
          nodes: [
            {
              kind: 'paragraph',
              runs: [
                { text: 'Wir bauen ' },
                { text: 'Marken', em: true },
                { text: ', die bleiben.' },
              ],
            },
            { kind: 'list', ordered: false, items: [[{ text: 'Eins' }], [{ text: '2024' }]] },
          ],
        },
        {
          id: randomUUID(),
          type: 'hero',
          link: { label: 'Mehr', target: { kind: 'url', url: 'https://x.de' } },
        },
      ],
    };
    const { result, slots } = extractTexts(tree);
    expect(slots.map((s) => s.text)).toEqual([
      'Titel',
      'Überschrift',
      'Bildunterschrift',
      '<r1>Wir bauen </r1><r2>Marken</r2><r3>, die bleiben.</r3>',
      'Eins', // „2024“ hat keine Buchstaben und bleibt
      'Mehr',
    ]);
    slots.forEach((s) =>
      s.apply(
        s.text.replace(
          /(<\/?r\d+>)|([A-Za-zÄÖÜäöüß]+)/g,
          (_m, tag, word) => tag ?? word.toUpperCase(),
        ),
      ),
    );
    const out = result as typeof tree;
    expect(tree.title).toBe('Titel'); // Original unverändert
    expect(out.title).toBe('TITEL');
    expect(out.content[2]).toMatchObject({
      nodes: [
        {
          runs: [{ text: 'WIR BAUEN ' }, { text: 'MARKEN', em: true }, { text: ', DIE BLEIBEN.' }],
        },
        { items: [[{ text: 'EINS' }], [{ text: '2024' }]] },
      ],
    });
    expect(out.content[3]).toMatchObject({
      link: { label: 'MEHR', target: { kind: 'url', url: 'https://x.de' } },
    });
    expect(out.content[1]).toMatchObject({
      mediaId: (tree.content[1] as { mediaId: string }).mediaId,
    });
  });

  it('erkennt fehlende Lauf-Markierungen und kann die Läufe einzeln setzen', () => {
    const { result, slots } = extractTexts({
      content: [
        {
          id: 'x',
          type: 'richtext',
          nodes: [{ kind: 'paragraph', runs: [{ text: 'a ' }, { text: 'b', em: true }] }],
        },
      ],
    });
    expect(slots[0]!.apply('ohne Markierungen')).toBe(false);
    slots[0]!.applyRuns(['A ', 'B']);
    expect(JSON.stringify(result)).toContain('"text":"A "');
    expect(JSON.stringify(result)).toContain('"text":"B","em":true');
  });
});

describe('Secret-Box', () => {
  it('verschlüsselt, erkennt Manipulation und bindet das Chiffrat an den Namen', () => {
    const box = createSecretBox(generateToken());
    const sealed = box.seal('anthropic', KEY);
    expect(sealed).not.toContain(KEY);
    expect(box.open('anthropic', sealed)).toBe(KEY);
    expect(() => box.open('anderer-name', sealed)).toThrow();
    expect(() => box.open('anthropic', sealed.slice(0, -2) + 'AA')).toThrow();
    expect(() => createSecretBox(generateToken()).open('anthropic', sealed)).toThrow();
  });
});

describe('Anthropic-Zugang', () => {
  let t: TestApp;
  let ed: Session;
  let admin: Session;
  const fake = fakeClaude();

  beforeAll(async () => {
    t = await createTestApp({}, { claude: fake.factory });
    ed = await editorSession(t, 'editor');
    admin = await editorSession(t, 'admin');
  });
  afterAll(() => t.close());

  it('speichert den Key verschlüsselt, zeigt nie den Key und lässt nur admin ändern', async () => {
    const before = (await as(t, ed, 'GET', '/api/v1/integrations/anthropic')).json().anthropic;
    expect(before).toMatchObject({
      configured: false,
      source: null,
      last4: null,
      canStoreKey: true,
    });

    expectError(
      await as(t, ed, 'PUT', '/api/v1/integrations/anthropic', { apiKey: KEY }),
      403,
      'forbidden',
    );
    expectError(
      await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', {
        apiKey: 'kein-key-123456789012',
      }),
      400,
      'validation_error',
    );
    expectError(
      await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', {}),
      400,
      'validation_error',
    );

    const res = await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', { apiKey: KEY });
    expect(res.statusCode).toBe(200);
    expect(res.json().anthropic).toMatchObject({
      configured: true,
      source: 'admin',
      last4: '7890',
    });
    expect(res.body).not.toContain(KEY);
    // Editoren sehen den Status, aber nie den Key
    const seen = await as(t, ed, 'GET', '/api/v1/integrations/anthropic');
    expect(seen.json().anthropic.configured).toBe(true);
    expect(seen.body).not.toContain(KEY);

    const { rows } = await t.handle.pool.query('select ciphertext, last4 from integration_secrets');
    expect(rows[0].ciphertext).not.toContain(KEY);
    expect(rows[0].last4).toBe('7890');
    expect(t.logs.join('')).not.toContain(KEY);

    // Modell getrennt änderbar, Key bleibt
    const m = await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', {
      model: 'claude-haiku-5-5',
    });
    expect(m.json().anthropic).toMatchObject({
      configured: true,
      model: 'claude-haiku-5-5',
      last4: '7890',
    });
    expectError(
      await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', { model: 'gpt-5' }),
      400,
      'validation_error',
    );
  });

  it('übersetzt Seiteninhalt als Vorschlag, ohne zu speichern', async () => {
    const page = (
      await as(t, ed, 'POST', '/api/v1/pages', {
        locale: 'en',
        slug: 'kopie',
        title: 'Über uns',
        content: [
          { id: randomUUID(), type: 'page_title', title: 'Über uns', showCount: false },
          {
            id: randomUUID(),
            type: 'richtext',
            nodes: [
              { kind: 'paragraph', runs: [{ text: 'Wir bauen ' }, { text: 'Marken', em: true }] },
            ],
          },
        ],
      })
    ).json();
    fake.calls.length = 0;
    const res = await as(t, ed, 'POST', `/api/v1/pages/${page.page.id}/auto-translate`, {
      title: 'Über uns',
      seoTitle: null,
      seoDescription: 'Beschreibung',
      content: page.latest.content,
    });
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(out.model).toBe('claude-haiku-5-5');
    expect(out.title).toBe('EN:Über uns');
    expect(out.seoDescription).toBe('EN:Beschreibung');
    expect(out.seoTitle).toBeNull();
    expect(out.content[1].nodes[0].runs).toEqual([
      { text: 'Wir bauen ' },
      { text: 'Marken', em: true },
    ]);
    // Markierungen gingen mit; da die Attrappe sie als Teil des Textes zurückgibt, kommen sie als Läufe an
    expect(fake.calls[0]).toMatchObject({ apiKey: KEY, model: 'claude-haiku-5-5' });
    expect(fake.calls[0]!.items.map((i) => i.text)).toContain('<r1>Wir bauen </r1><r2>Marken</r2>');
    // gespeichert wurde nichts
    const stored = (await as(t, ed, 'GET', `/api/v1/pages/${page.page.id}`)).json();
    expect(stored.latest.title).toBe('Über uns');
    expect(stored.latest.revisionNo).toBe(1);
  });

  it('fällt bei verlorenen Markierungen auf einzelne Läufe zurück', async () => {
    const dropping = fakeClaude((items) =>
      items.map((i) => i.text.replace(/<\/?r\d+>/g, '').toUpperCase()),
    );
    const t2 = await createTestApp({}, { claude: dropping.factory });
    try {
      const a = await editorSession(t2, 'admin');
      await as(t2, a, 'PUT', '/api/v1/integrations/anthropic', { apiKey: KEY });
      const page = (
        await as(t2, a, 'POST', '/api/v1/pages', {
          locale: 'en',
          slug: 'x',
          title: 'T',
          content: [
            {
              id: randomUUID(),
              type: 'richtext',
              nodes: [{ kind: 'paragraph', runs: [{ text: 'a ' }, { text: 'b', em: true }] }],
            },
          ],
        })
      ).json();
      const res = await as(t2, a, 'POST', `/api/v1/pages/${page.page.id}/auto-translate`, {
        title: 'T',
        content: page.latest.content,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().content[0].nodes[0].runs).toEqual([
        { text: 'A ' },
        { text: 'B', em: true },
      ]);
      expect(dropping.calls).toHaveLength(2); // Gesamttext, dann die Läufe einzeln
    } finally {
      await t2.close();
    }
  });

  it('übersetzt Projekte und meldet Fehler des Dienstes verständlich', async () => {
    const project = (
      await as(t, ed, 'POST', '/api/v1/projects', {
        locale: 'en',
        slug: 'proj',
        title: 'Projekt',
        subtitle: [{ text: 'Ein ' }, { text: 'Shop', em: true }],
        year: 2024,
        categories: ['web'],
        color: '#112233',
        content: [],
      })
    ).json();
    const ok = await as(t, ed, 'POST', `/api/v1/projects/${project.project.id}/auto-translate`, {
      title: 'Projekt',
      subtitle: project.latest.subtitle,
      content: [],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().title).toBe('EN:Projekt');
    expectError(
      await as(
        t,
        ed,
        'POST',
        '/api/v1/projects/00000000-0000-4000-8000-000000000000/auto-translate',
        { title: 'x', content: [] },
      ),
      404,
      'not_found',
    );
  });

  it('verlangt Anmeldung und entfernt den Key wieder (nur admin)', async () => {
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/v1/integrations/anthropic' })).statusCode,
    ).toBe(401);
    expectError(await as(t, ed, 'DELETE', '/api/v1/integrations/anthropic'), 403, 'forbidden');
    const res = await as(t, admin, 'DELETE', '/api/v1/integrations/anthropic');
    expect(res.json().anthropic).toMatchObject({ configured: false, last4: null });
    const page = (await as(t, ed, 'GET', '/api/v1/pages?locale=en')).json().pages[0];
    expectError(
      await as(t, ed, 'POST', `/api/v1/pages/${page.id}/auto-translate`, {
        title: 'x',
        content: [],
      }),
      409,
      'conflict',
    );
  });
});

describe('Anthropic-Zugang: Umgebung und Fehler', () => {
  it('bevorzugt ANTHROPIC_API_KEY aus der Umgebung und sperrt die Eingabe ohne SECRETS_ENCRYPTION_KEY', async () => {
    const fake = fakeClaude();
    const t = await createTestApp(
      { anthropicApiKey: 'sk-ant-env-key-0000000000000000', secretsKey: undefined },
      { claude: fake.factory },
    );
    try {
      const admin = await editorSession(t, 'admin');
      const st = (await as(t, admin, 'GET', '/api/v1/integrations/anthropic')).json().anthropic;
      expect(st).toMatchObject({
        configured: true,
        source: 'env',
        canStoreKey: false,
        model: 'claude-opus-5-5',
      });
      expectError(
        await as(t, admin, 'PUT', '/api/v1/integrations/anthropic', { apiKey: KEY }),
        409,
        'conflict',
      );
      const page = (
        await as(t, admin, 'POST', '/api/v1/pages', {
          locale: 'en',
          slug: 'e',
          title: 'T',
          content: [],
        })
      ).json();
      await as(t, admin, 'POST', `/api/v1/pages/${page.page.id}/auto-translate`, {
        title: 'Hallo',
        content: [],
      });
      expect(fake.calls[0]).toMatchObject({
        apiKey: 'sk-ant-env-key-0000000000000000',
        model: 'claude-opus-5-5',
      });
    } finally {
      await t.close();
    }
  });

  it('gibt eine verständliche Meldung, wenn der Dienst ausfällt', async () => {
    const broken = fakeClaude(() => new Error('connect ECONNREFUSED sk-ant-geheim'));
    const t = await createTestApp(
      { anthropicApiKey: 'sk-ant-env-key-0000000000000000' },
      { claude: broken.factory },
    );
    try {
      const admin = await editorSession(t, 'admin');
      const page = (
        await as(t, admin, 'POST', '/api/v1/pages', {
          locale: 'en',
          slug: 'e',
          title: 'T',
          content: [],
        })
      ).json();
      const res = await as(t, admin, 'POST', `/api/v1/pages/${page.page.id}/auto-translate`, {
        title: 'Hallo',
        content: [],
      });
      expectError(res, 502, 'internal_error');
      expect(res.body).not.toContain('sk-ant');
    } finally {
      await t.close();
    }
  });
});
