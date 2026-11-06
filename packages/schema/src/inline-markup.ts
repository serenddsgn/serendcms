import type { Inline } from './blocks.js';

/**
 * Kleine Schreibweise für Inline-Text im Admin (ein Textfeld statt Lauf-Editor):
 *   [[Schlüsselwort]]  → Liquid-Verlauf        *betont*  → kursiv        [Text](https://…) → Link
 */
const TOKEN = /\[\[(.+?)\]\]|\*(.+?)\*|\[([^\]]+?)\]\(([^)\s]+?)\)/g;

export function parseInlineMarkup(text: string): Inline {
  const runs: Inline = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], liquid: true });
    else if (m[2] !== undefined) runs.push({ text: m[2], em: true });
    else if (m[3] !== undefined && m[4] !== undefined) runs.push({ text: m[3], href: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

export function formatInlineMarkup(runs: Inline | null | undefined): string {
  return (runs ?? [])
    .map((r) => {
      if (r.href) return `[${r.text}](${r.href})`;
      if (r.liquid) return `[[${r.text}]]`;
      if (r.em) return `*${r.text}*`;
      return r.text;
    })
    .join('');
}
