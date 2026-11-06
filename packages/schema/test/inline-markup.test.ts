import { describe, expect, it } from 'vitest';
import { Inline, formatInlineMarkup, parseInlineMarkup } from '../src/index.js';

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
