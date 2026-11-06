import { describe, expect, it } from 'vitest';
import { Inline, formatInlineMarkup, parseInlineMarkup, splitParagraphs } from '../src/index.js';

describe('Inline-Schreibweise', () => {
  it('liest Liquid, kursiv und Links', () => {
    expect(
      parseInlineMarkup(
        'Die digitale [[Gebäcktheke]]: ein *Shop*, siehe [hier](https://example.com).',
      ),
    ).toEqual([
      { text: 'Die digitale ' },
      { text: 'Gebäcktheke', liquid: true },
      { text: ': ein ' },
      { text: 'Shop', em: true },
      { text: ', siehe ' },
      { text: 'hier', href: 'https://example.com' },
      { text: '.' },
    ]);
  });

  it('formatiert zurück und bleibt dabei stabil (Round-Trip)', () => {
    for (const s of [
      'Nur Text',
      'Wir gestalten [[Oberflächen]] zu füllen.',
      'a *b* c [d](/de/) e',
      '',
    ]) {
      expect(formatInlineMarkup(parseInlineMarkup(s))).toBe(s);
    }
  });

  it('erzeugt gültige Inline-Läufe (leerer Text bleibt leer und wird vom Schema abgelehnt)', () => {
    expect(Inline.safeParse(parseInlineMarkup('Hallo [[Welt]]')).success).toBe(true);
    expect(Inline.safeParse(parseInlineMarkup('')).success).toBe(false);
  });
});

describe('Absätze aus dem Textfeld', () => {
  const text = (...t: string[]) => t.map((x) => ({ text: x }));

  it('teilt an Leerzeilen in Absätze und lässt einfache Zeilenumbrüche stehen', () => {
    expect(splitParagraphs(text('Eins.\n\nZwei.\nmit Umbruch.\n\n\n  \nDrei.'))).toEqual([
      text('Eins.'),
      text('Zwei.\nmit Umbruch.'),
      text('Drei.'),
    ]);
  });

  it('behält Formatierung über Absatzgrenzen hinweg und trennt mitten in einem Lauf', () => {
    const runs = [
      { text: 'Ein ' },
      { text: 'Wort', liquid: true },
      { text: ' endet.\n\nNeu ' },
      { text: 'kursiv', em: true },
      { text: '.' },
    ];
    expect(splitParagraphs(runs)).toEqual([
      [{ text: 'Ein ' }, { text: 'Wort', liquid: true }, { text: ' endet.' }],
      [{ text: 'Neu ' }, { text: 'kursiv', em: true }, { text: '.' }],
    ]);
  });

  it('entfernt Umbrüche am Anfang und Ende und lässt normalen Text unverändert', () => {
    expect(splitParagraphs(text('\n\nA\n\n'))).toEqual([text('A')]);
    expect(splitParagraphs(text('Nur ein Absatz.'))).toEqual([text('Nur ein Absatz.')]);
  });
});
