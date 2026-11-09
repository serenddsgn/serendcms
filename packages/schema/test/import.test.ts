import { describe, expect, it } from 'vitest';
import {
  IMPORT_EXAMPLE,
  buildImport,
  buildImportGuide,
  createMediaResolver,
  slugify,
  textToNodes,
} from '../src/index.js';

const media = [
  { id: '11111111-1111-4111-8111-111111111111', filename: 'beispiel-werkstatt-cover.jpg' },
  { id: '22222222-2222-4222-8222-222222222222', filename: 'beispiel-werkstatt-1.jpg' },
  { id: '33333333-3333-4333-8333-333333333333', filename: 'Beispiel-Werkstatt-2.JPG' },
];
let n = 0;
const makeId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

describe('Import', () => {
  it('das Beispiel der Anleitung ist gültig; fehlende Medien sind nur Warnungen', () => {
    const plan = buildImport(IMPORT_EXAMPLE, { media, makeId });
    expect(plan.errors).toEqual([]);
    expect(plan.items.map((i) => [i.kind, i.locale, i.slug])).toEqual([
      ['project', 'de', 'beispiel-werkstatt'],
      ['project', 'en', 'beispiel-werkstatt'],
      ['page', 'de', 'beispielseite'],
    ]);
    const de = plan.items[0]!;
    // beispiel-werkstatt-3.jpg gibt es nicht → eine Warnung, das zweite Galeriebild bleibt (Endung/Groß-Kleinschreibung egal)
    expect(de.warnings).toHaveLength(1);
    expect(de.warnings[0]).toContain('beispiel-werkstatt-3.jpg');
    const gallery = (de.body as { content: { type: string; items?: unknown[] }[] }).content.find(
      (b) => b.type === 'gallery',
    );
    expect(gallery?.items).toHaveLength(1);
  });

  it('wandelt Inline-Schreibweise und Absätze um', () => {
    const plan = buildImport(IMPORT_EXAMPLE, { media, makeId });
    type Ch = { type: string; body: unknown[][] };
    const content = (plan.items[0]!.body as { content: Ch[] }).content;
    const chapters = content.filter((b) => b.type === 'chapter');
    // Leerzeile im body-Eintrag → zwei Absätze
    expect(chapters[0]!.body).toHaveLength(2);
    expect(chapters[1]!.body[0]).toContainEqual({ text: 'Zeit', liquid: true });
  });

  it('erkennt Listen in Seitentexten', () => {
    expect(textToNodes('Absatz\n\n- a\n- b\n\n1. eins\n2. zwei')).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Absatz' }] },
      { kind: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] },
      { kind: 'list', ordered: true, items: [[{ text: 'eins' }], [{ text: 'zwei' }]] },
    ]);
  });

  it('meldet Schemafehler mit Pfad und lehnt Unfug ab', () => {
    const bad = {
      format: 'serend-import',
      version: 1,
      items: [{ kind: 'project', title: 'X', year: 2026, categories: ['foo'], content: [] }],
    };
    const plan = buildImport(bad, { media });
    expect(plan.items).toEqual([]);
    expect(plan.errors.join('\n')).toContain('categories');
    expect(buildImport({ hello: 1 }, { media }).errors.length).toBeGreaterThan(0);
    expect(buildImport('kein json objekt', { media }).errors.length).toBeGreaterThan(0);
  });

  it('prüft Grenzen des echten Schemas (Kapiteltitel, doppelte Slugs, Gruppen)', () => {
    const base = { kind: 'project', year: 2026, categories: ['web'], title: 'A' };
    const plan = buildImport(
      {
        format: 'serend-import',
        version: 1,
        items: [
          { ...base, content: [{ type: 'chapter', title: 'x'.repeat(61), lead: 'l' }] },
          { ...base, group: 'g' },
          { ...base, title: 'A', group: 'g' },
        ],
      },
      { media },
    );
    const text = plan.errors.join('\n');
    expect(text).toContain('title');
    expect(text).toContain('doppelt');
    expect(text).toContain('Gruppe');
  });

  it('findet Medien tolerant, aber nie mehrdeutig', () => {
    const r = createMediaResolver([
      ...media,
      { id: '44444444-4444-4444-8444-444444444444', filename: 'doppelt.png' },
      { id: '55555555-5555-4555-8555-555555555555', filename: 'doppelt.jpg' },
    ]);
    expect(r('beispiel-werkstatt-2.jpg')).toBe(media[2]!.id);
    expect(r('beispiel-werkstatt-1')).toBe(media[1]!.id);
    expect(r('doppelt')).toBeUndefined();
    expect(r('doppelt.png')).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('bildet Slugs mit Umlauten', () => {
    expect(slugify('Schramowski Getränke – Größe!')).toBe('schramowski-getraenke-groesse');
  });

  it('Anleitung enthält Beispiel und optional die Medienliste', () => {
    const g = buildImportGuide([{ filename: 'a.jpg', altText: 'Ein Bild' }]);
    expect(g).toContain('"format": "serend-import"');
    expect(g).toContain('`a.jpg` – Ein Bild');
    expect(buildImportGuide()).toContain('## Medien');
  });
});
