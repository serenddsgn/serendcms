import type { Inline } from './blocks.js';

type Run = Inline[number];

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

/**
 * Teilt einen Absatz an Leerzeilen in mehrere Absätze, Formatierung (Liquid, kursiv, Links) bleibt erhalten. Einfache
 * Zeilenumbrüche bleiben im Text (die Seite zeigt sie mit `white-space: pre-line`). Der Admin speichert, was im Textfeld steht:
 * ein Textfeld mit Leerzeilen ist ein Lauf mit „\n\n“, nicht mehrere Absätze.
 */
export function splitParagraphs(runs: Inline): Inline[] {
  const out: Run[][] = [];
  let cur: Run[] = [];
  const flush = () => {
    const kept = cur
      .map((r, i) => ({
        ...r,
        // Umbrüche am Anfang und Ende eines Absatzes sind kein Inhalt
        text: i === 0 ? r.text.replace(/^\s*\n/, '') : r.text,
      }))
      .map((r, i, all) => (i === all.length - 1 ? { ...r, text: r.text.replace(/\n\s*$/, '') } : r))
      .filter((r) => r.text !== '');
    if (kept.length > 0) out.push(kept);
    cur = [];
  };
  for (const run of runs) {
    // Eine Leerzeile (auch mit Leerzeichen darin) trennt Absätze; mehrere Leerzeilen zählen wie eine
    run.text.split(/\n[ \t]*\n\s*/).forEach((part, i) => {
      if (i > 0) flush();
      if (part !== '') cur.push({ ...run, text: part });
    });
  }
  flush();
  return out.length > 0 ? (out as Inline[]) : [runs];
}
