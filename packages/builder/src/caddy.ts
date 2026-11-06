import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { htmlFiles } from './files.js';

/**
 * Inline-Skripte (ohne JSON-LD und ohne `src`) aller Seiten als CSP-Hashes. So bleibt `script-src` strikt
 * (`'self'` plus genau diese Hashes), obwohl Astro kleine Skripte inline einbettet.
 */
export function collectInlineScriptHashes(dir: string): string[] {
  const hashes = new Set<string>();
  for (const file of htmlFiles(dir)) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(
      /<script(?![^>]*\bsrc=)(?![^>]*\btype="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g,
    )) {
      if (m[1]!.trim())
        hashes.add(`'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

/** Baseline-CSP der öffentlichen Seite. Bilder, Schriften und Skripte nur von der eigenen Domain. */
export function publicCsp(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'", // Inline-Styles des Designs (Prototyp-Werte, Animationsverzögerungen)
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/** Schreibt `build-meta/csp.caddy` (wird im Caddyfile importiert) und liefert die Hashes. */
export async function writeCspSnippet(dir: string): Promise<string[]> {
  const hashes = collectInlineScriptHashes(dir);
  await mkdir(join(dir, 'build-meta'), { recursive: true });
  await writeFile(
    join(dir, 'build-meta', 'csp.caddy'),
    `header Content-Security-Policy "${publicCsp(hashes)}"\n`,
  );
  return hashes;
}

/** Inhalt aller Caddy-Schnipsel eines Releases (Redirects und CSP), um Änderungen zu erkennen. */
export async function readCaddySnippets(releaseDir: string): Promise<string> {
  const read = (f: string) => readFile(join(releaseDir, 'build-meta', f), 'utf8').catch(() => '');
  return `${await read('redirects.caddy')}\n---\n${await read('csp.caddy')}`;
}
