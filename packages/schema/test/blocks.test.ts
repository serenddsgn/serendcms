import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SCHEMA_VERSION,
  ContentPageContent,
  HomeContent,
  ProjectContent,
  ProjectRevisionInput,
  collectMediaIds,
  pageContentSchema,
  projectPath,
  upgradeContent,
} from '../src/index.js';

const id = () => randomUUID();
const link = {
  label: 'Was wir machen',
  target: { kind: 'url' as const, url: 'https://example.com' },
};

describe('Block-Schemas', () => {
  it('akzeptiert das Kapitel/Zitat/Demo-Muster des Prototyps', () => {
    const ok = ProjectContent.safeParse([
      {
        id: id(),
        type: 'chapter',
        title: 'Die Aufgabe',
        lead: [{ text: 'Lead' }],
        body: [[{ text: 'Text' }]],
      },
      { id: id(), type: 'quote', lines: [[{ text: 'Erste' }], [{ text: 'Zweite', liquid: true }]] },
    ]);
    expect(ok.success).toBe(true);
  });

  it('lehnt unbekannte Typen, fehlende Felder und doppelte IDs ab', () => {
    const same = id();
    expect(ProjectContent.safeParse([{ id: id(), type: 'hero' }]).success).toBe(false);
    expect(ProjectContent.safeParse([{ id: id(), type: 'quote', lines: [] }]).success).toBe(false);
    const c = { type: 'chapter', title: 'x', lead: [{ text: 'l' }], body: [] };
    expect(
      ProjectContent.safeParse([
        { id: same, ...c },
        { id: same, ...c },
      ]).success,
    ).toBe(false);
  });

  it('lehnt gefährliche Link-Schemata in Inline-Läufen ab', () => {
    const run = (href: string) =>
      ProjectContent.safeParse([
        { id: id(), type: 'chapter', title: 't', lead: [{ text: 'a', href }], body: [] },
      ]).success;
    expect(run('https://example.com')).toBe(true);
    expect(run('/de/projekte/x')).toBe(true);
    expect(run('javascript:alert(1)')).toBe(false);
  });

  it('prüft Pick&Mix-Konsistenz (defaultSize muss in sizes liegen)', () => {
    const demo = (defaultSize: number) => ({
      id: id(),
      type: 'interactive_demo',
      navLabel: 'Ausprobieren',
      demo: {
        component: 'pick-and-mix',
        eyebrow: 'e',
        title: 't',
        sizes: [12, 18],
        defaultSize,
        flavors: [
          { key: 'a', name: 'A', priceCents: 100, color: '#e0a98f' },
          { key: 'b', name: 'B', priceCents: 100, color: '#b06bb4' },
        ],
      },
    });
    expect(ProjectContent.safeParse([demo(12)]).success).toBe(true);
    expect(ProjectContent.safeParse([demo(13)]).success).toBe(false);
  });

  it('akzeptiert Bildblöcke auf Inhaltsseiten mit Größe und Bildunterschrift', () => {
    const m = id();
    for (const size of ['small', 'medium', 'large', 'full'] as const) {
      expect(
        ContentPageContent.safeParse([{ id: id(), type: 'image', mediaId: m, size }]).success,
      ).toBe(true);
    }
    // Größe ist optional (Standard: mittel), ohne Bild oder mit unbekannter Größe ist der Block ungültig
    const parsed = ContentPageContent.parse([{ id: id(), type: 'image', mediaId: m }]);
    expect(parsed[0]).toMatchObject({ size: 'medium' });
    expect(ContentPageContent.safeParse([{ id: id(), type: 'image', mediaId: '' }]).success).toBe(
      false,
    );
    expect(
      ContentPageContent.safeParse([{ id: id(), type: 'image', mediaId: m, size: 'riesig' }])
        .success,
    ).toBe(false);
    expect(
      ContentPageContent.safeParse([
        { id: id(), type: 'image', mediaId: m, caption: 'x'.repeat(201) },
      ]).success,
    ).toBe(false);
  });

  it('erzwingt die feste Struktur der Startseite', () => {
    const hero = {
      id: id(),
      type: 'hero',
      eyebrow: 'e',
      headline: [[{ text: 'h' }]],
      intro: 'i',
      link,
    };
    expect(HomeContent.safeParse([hero]).success).toBe(false);
    expect(pageContentSchema('home')).toBe(HomeContent);
    expect(pageContentSchema(null)).toBe(ContentPageContent);
  });

  it('sammelt Medienverweise aus Blöcken', () => {
    const m = id();
    expect(collectMediaIds([{ type: 'media_text_card', mediaId: m }, { type: 'quote' }])).toEqual([
      m,
    ]);
  });
});

describe('Revisions-Eingabe', () => {
  const base = {
    slug: 'dolce-falcone',
    title: 'Dolce & Falcone',
    year: 2026,
    categories: ['shop'],
    color: '#66a903',
  };
  it('füllt Standardwerte', () => {
    const r = ProjectRevisionInput.parse(base);
    expect(r).toMatchObject({
      subtitle: null,
      tileColor: null,
      content: [],
      gallery: [],
      coverMediaId: null,
    });
  });
  it('lehnt doppelte Kategorien und schlechte URLs ab', () => {
    expect(ProjectRevisionInput.safeParse({ ...base, categories: ['shop', 'shop'] }).success).toBe(
      false,
    );
    expect(ProjectRevisionInput.safeParse({ ...base, liveUrl: 'ftp://x' }).success).toBe(false);
  });
});

describe('Schema-Migration und Routen', () => {
  it('lässt aktuelle Inhalte unverändert und weist unbekannte Versionen ab', () => {
    const c = [{ x: 1 }];
    expect(upgradeContent(c, CONTENT_SCHEMA_VERSION)).toBe(c);
    expect(() => upgradeContent(c, CONTENT_SCHEMA_VERSION + 1)).toThrow();
    expect(() => upgradeContent(c, 0)).toThrow();
  });
  it('baut die sprachabhängigen Projektpfade', () => {
    expect(projectPath('de', 'dolce-falcone')).toBe('/de/projekte/dolce-falcone');
    expect(projectPath('en', 'dolce-falcone')).toBe('/en/work/dolce-falcone');
  });
});
