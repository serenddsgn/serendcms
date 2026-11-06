import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { htmlFiles, urlOf } from './files.js';

export const JS_BUDGET_BYTES = 50 * 1024;

export interface BudgetEntry {
  page: string;
  bytes: number;
}
export interface BudgetResult {
  limit: number;
  pages: BudgetEntry[];
  over: BudgetEntry[];
}

const imports = (dir: string, file: string): string[] => {
  const text = readFileSync(join(dir, file), 'utf8');
  return [...text.matchAll(/(?:from|import\()\s*"\.\/([^"]+\.js)"/g)].map(
    (m) => `/_assets/${m[1]}`,
  );
};

/**
 * JavaScript pro Seite (gzip): eingebundene Module, Insel-Module (client:visible) samt Abhängigkeiten
 * und Inline-Skripte. Ein Insel-Modul zählt, auch wenn es erst beim Sichtbarwerden lädt.
 */
export function checkJsBudget(dir: string, limit = JS_BUDGET_BYTES): BudgetResult {
  const pages: BudgetEntry[] = [];
  for (const file of htmlFiles(dir)) {
    const html = readFileSync(file, 'utf8');
    const seen = new Set<string>();
    const visit = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      imports(dir, f).forEach(visit);
    };
    for (const m of html.matchAll(
      /(?:src|href|component-url|renderer-url)="(\/_assets\/[^"]+\.js)"/g,
    ))
      visit(m[1]!);
    let bytes = [...seen].reduce((s, f) => s + gzipSync(readFileSync(join(dir, f))).length, 0);
    for (const m of html.matchAll(
      /<script(?![^>]*\btype="application\/ld\+json")(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      bytes += gzipSync(Buffer.from(m[1]!)).length;
    }
    pages.push({ page: urlOf(dir, file), bytes });
  }
  return { limit, pages, over: pages.filter((p) => p.bytes > limit) };
}
