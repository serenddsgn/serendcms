import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectInlineScriptHashes,
  publicCsp,
  readCaddySnippets,
  writeCspSnippet,
} from '../src/index.js';

const dirs: string[] = [];
function site(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'serend-csp-'));
  dirs.push(dir);
  for (const [n, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, n)), { recursive: true });
    writeFileSync(join(dir, n), c);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const hash = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

describe('CSP aus dem Build-Output', () => {
  it('hasht Inline-Skripte, überspringt JSON-LD, externe Skripte und leere Skripte', () => {
    const dir = site({
      'a/index.html':
        '<script>var a=1</script><script type="application/ld+json">{"@type":"X"}</script><script src="/x.js"></script><script> </script>',
      'b/index.html':
        '<script type="module">import "/_assets/x.js"</script><script>var a=1</script>',
    });
    expect(collectInlineScriptHashes(dir).sort()).toEqual(
      [hash('var a=1'), hash('import "/_assets/x.js"')].sort(),
    );
  });

  it('erzeugt eine strikte CSP: Skripte nur self und Hashes, keine fremden Quellen, kein Einbetten', () => {
    const csp = publicCsp([hash('x')]);
    expect(csp).toContain(`script-src 'self' ${hash('x')}`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    for (const d of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "img-src 'self' data:",
    ])
      expect(csp).toContain(d);
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('schreibt das Caddy-Schnipsel und erkennt Änderungen', async () => {
    const dir = site({
      'index.html': '<script>var a=1</script>',
      'build-meta/redirects.caddy': 'redir /a /b 301\n',
    });
    await writeCspSnippet(dir);
    expect(readFileSync(join(dir, 'build-meta/csp.caddy'), 'utf8')).toMatch(
      /^header Content-Security-Policy ".*sha256-/,
    );
    const before = await readCaddySnippets(dir);
    writeFileSync(join(dir, 'build-meta/redirects.caddy'), 'redir /a /c 301\n');
    expect(await readCaddySnippets(dir)).not.toBe(before);
  });
});
