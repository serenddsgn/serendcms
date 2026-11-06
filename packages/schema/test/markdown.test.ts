import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  blocksToMarkdown,
  inlineToMarkdown,
  parseSetting,
  type MarkdownContext,
} from '../src/index.js';

const ctx: MarkdownContext = {
  projects: [
    {
      title: 'Dolce & Falcone',
      url: '/de/projekte/dolce-falcone',
      year: 2026,
      categories: ['E-Commerce'],
    },
  ],
  services: [{ name: 'Webdesign', description: 'Individuelle Funktionen.' }],
  resolveLink: () => null,
  mediaAlt: () => 'Porträt',
  email: 'hallo@serend.design',
};

describe('Markdown-Serialisierung', () => {
  it('serialisiert Inline-Marken', () => {
    const md = inlineToMarkdown([
      { text: 'Die digitale ' },
      { text: 'Gebäcktheke', liquid: true },
      { text: ' Link', em: true, href: '/a' },
    ]);
    expect(md).toBe('Die digitale Gebäcktheke[* Link*](/a)');
  });

  it('gibt Leerzeilen im Textfeld als getrennte Absätze aus', () => {
    const md = blocksToMarkdown(
      [
        {
          id: randomUUID(),
          type: 'richtext',
          nodes: [{ kind: 'paragraph', runs: [{ text: 'Erster.\n\nZweiter.' }] }],
        },
      ],
      ctx,
    );
    expect(md).toContain('Erster.\n\nZweiter.');
    expect(md).not.toContain('Erster.\n\n\n');
  });

  it('nummeriert Kapitel und überspringt Demos nicht', () => {
    const md = blocksToMarkdown(
      [
        {
          id: randomUUID(),
          type: 'chapter',
          title: 'Um wen es geht',
          lead: [{ text: 'Lead' }],
          body: [[{ text: 'Text' }]],
        },
        {
          id: randomUUID(),
          type: 'quote',
          lines: [[{ text: 'A' }], [{ text: 'B', liquid: true }]],
        },
        {
          id: randomUUID(),
          type: 'interactive_demo',
          navLabel: 'x',
          demo: { component: 'pick-and-mix', title: 'Box', eyebrow: 'Ausprobieren' },
        },
        {
          id: randomUUID(),
          type: 'chapter',
          title: 'Was sich ändert',
          lead: [{ text: 'L2' }],
          body: [],
        },
      ],
      ctx,
    );
    expect(md).toContain('## 01 · Um wen es geht');
    expect(md).toContain('## 02 · Was sich ändert');
    expect(md).toContain('> A\n>\n> B');
    expect(md).toContain('interaktive Demo');
  });

  it('rendert datengetriebene Blöcke aus dem Kontext', () => {
    const md = blocksToMarkdown(
      [
        { type: 'featured_projects', label: 'Ausgewählte Arbeiten', limit: 5 },
        { type: 'services_overview', title: [{ text: 'Titel' }] },
      ],
      ctx,
    );
    expect(md).toContain('- [Dolce & Falcone](/de/projekte/dolce-falcone) (2026, E-Commerce)');
    expect(md).toContain('- **Webdesign**: Individuelle Funktionen.');
  });
});

describe('Einstellungen', () => {
  it('validiert jeden Key mit seinem Schema', () => {
    expect(
      parseSetting('site.identity', {
        name: 'serend.design',
        city: 'Wuppertal',
        email: 'hallo@serend.design',
      }).city,
    ).toBe('Wuppertal');
    expect(() =>
      parseSetting('site.identity', { name: 'x', city: 'y', email: 'kaputt' }),
    ).toThrow();
    expect(() => parseSetting('site.footer', {})).toThrow();
  });
});
