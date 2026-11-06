import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export const htmlFiles = (dir: string): string[] =>
  [...walk(dir)].filter((f) => f.endsWith('.html'));

/** URL-Pfad einer HTML-Datei: /de/projekte/x/index.html → /de/projekte/x/ */
export function urlOf(dir: string, file: string): string {
  const rel = file.slice(dir.length).split('\\').join('/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
}
