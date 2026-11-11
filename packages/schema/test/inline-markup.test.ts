import { describe, expect, it } from 'vitest';
import {
  Inline,
  formatInlineMarkup,
  parseInlineMarkup,
  splitEmphasis,
  splitParagraphs,
  stripEmphasis,
} from '../src/index.js';

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

describe('Hervorhebung mit **Wort**', () => {
  it('trennt Text in normale und hervorgehobene Teile', () => {
    expect(splitEmphasis('Wir bauen **individuelle Funktionen** für **Sie**.')).toEqual([
      { text: 'Wir bauen ', strong: false },
      { text: 'individuelle Funktionen', strong: true },
      { text: ' für ', strong: false },
      { text: 'Sie', strong: true },
      { text: '.', strong: false },
    ]);
  });

  it('lässt Text ohne Markierung und einzelne Sternchen unverändert', () => {
    expect(splitEmphasis('Kein Hervorheben.')).toEqual([
      { text: 'Kein Hervorheben.', strong: false },
    ]);
    expect(splitEmphasis('Preis* ab 5 * 3')).toEqual([{ text: 'Preis* ab 5 * 3', strong: false }]);
    expect(splitEmphasis('')).toEqual([]);
  });

  it('entfernt die Markierungen für Klartext', () => {
    expect(stripEmphasis('Sie soll **arbeiten. Verkaufen.**')).toBe(
      'Sie soll arbeiten. Verkaufen.',
    );
  });
});
