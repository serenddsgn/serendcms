import { mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkHtml,
  checkJsBudget,
  checkLinks,
  currentReleaseId,
  pruneReleases,
  storeRelease,
  switchCurrent,
} from '../src/index.js';

const dirs: string[] = [];
function site(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), 'serend-site-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const page = (body: string, head = '') =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>T</title>${head}</head><body>${body}</body></html>`;

describe('Link-Prüfung', () => {
  it('akzeptiert funktionierende interne Links, Anker, srcset und absolute Links der eigenen Domain', () => {
    const dir = site({
      'de/index.html': page(
        '<a href="/de/projekte/">P</a><a href="/de/projekte/#filter">F</a><img src="/img/a.webp" srcset="/img/a.webp 480w, /img/b.webp 800w" alt=""><a href="x/">rel</a>',
        '<link rel="canonical" href="https://example.com/de/">',
      ),
      'de/x/index.html': page('<p>x</p>'),
      'de/projekte/index.html': page('<h2 id="filter">F</h2>'),
      'img/a.webp': 'a',
      'img/b.webp': 'b',
    });
    const r = checkLinks(dir, { siteUrl: 'https://example.com' });
    expect(r.broken).toEqual([]);
    expect(r.pages).toBe(3);
  });

  it('meldet kaputte Seiten-, Bild- und Ankerlinks', () => {
    const dir = site({
      'de/index.html': page(
        '<a href="/de/gibt-es-nicht/">A</a><img src="/img/fehlt.webp" alt=""><a href="/de/projekte/#fehlt">B</a><link rel="alternate" href="https://example.com/en/weg/">',
      ),
      'de/projekte/index.html': page('<h2 id="da">x</h2>'),
    });
    const r = checkLinks(dir, { siteUrl: 'https://example.com' });
    expect(r.broken.map((b) => b.reason).sort()).toEqual(
      [
        'Anker #fehlt fehlt',
        'Ziel existiert nicht',
        'Ziel existiert nicht',
        'Ziel existiert nicht',
      ].sort(),
    );
  });

  it('nennt bei einem kaputten Link den sichtbaren Linktext, damit er im Admin zu finden ist', () => {
    const dir = site({
      'de/index.html': page(
        '<a class="biglink" href="/de/praeambel/#praeambel"><span class="ring">→</span>Unsere Design-Philosophie</a>',
      ),
      'de/praeambel/index.html': page('<h1>Präambel</h1>'),
    });
    expect(checkLinks(dir).broken).toEqual([
      {
        page: '/de/',
        url: '/de/praeambel/#praeambel',
        reason: 'Anker #praeambel fehlt',
        label: '→ Unsere Design-Philosophie',
      },
    ]);
  });

  it('ignoriert externe Links, mailto und reine Anker auf derselben Seite', () => {
    const dir = site({
      'index.html': page(
        '<a href="https://other.example/x">e</a><a href="mailto:a@b.de">m</a><a href="#top">t</a><h1 id="top">x</h1>',
      ),
    });
    expect(checkLinks(dir).broken).toEqual([]);
  });
});

describe('HTML-Validität', () => {
  it('akzeptiert gültiges HTML', async () => {
    const dir = site({
      'index.html': page(
        '<main><h1>Hallo</h1><p>Text</p><img src="/a.png" alt="x" width="1" height="1"></main>',
      ),
    });
    expect((await checkHtml(dir)).errors).toEqual([]);
  });

  it('meldet Strukturfehler (doppelte IDs, Block in Inline-Element, fehlendes alt)', async () => {
    const dir = site({
      'index.html': page(
        '<p id="a">x</p><p id="a">y</p><span><div>b</div></span><img src="/a.png">',
      ),
    });
    const rules = (await checkHtml(dir)).errors.map((e) => e.rule);
    expect(rules).toEqual(
      expect.arrayContaining(['no-dup-id', 'element-permitted-content', 'wcag/h37']),
    );
  });
});

describe('JS-Budget', () => {
  it('zählt Module samt Abhängigkeiten und Inline-Skripte (gzip)', () => {
    const big = Buffer.from(
      Array.from({ length: 4000 }, (_, i) => `export const v${i}=${Math.random()};`).join('\n'),
    );
    const dir = site({
      'ok/index.html': page('<script type="module">console.log(1)</script>'),
      'big/index.html': page('<script type="module" src="/_assets/a.js"></script>'),
      '_assets/a.js': `import{x}from"./b.js";${big.toString()}`,
      '_assets/b.js': 'export const x=1;',
    });
    const r = checkJsBudget(dir, 10 * 1024);
    expect(r.over.map((o) => o.page)).toEqual(['/big/']);
    expect(r.pages.find((p) => p.page === '/ok/')!.bytes).toBeLessThan(200);
  });

  it('ignoriert JSON-LD als Skript', () => {
    const dir = site({
      'index.html': page('<script type="application/ld+json">{"@type":"Organization"}</script>'),
    });
    expect(checkJsBudget(dir).pages[0]!.bytes).toBe(0);
  });
});

describe('Release-Dateioperationen', () => {
  it('schaltet den Symlink atomar um und kennt das aktuelle Release', async () => {
    const releases = mkdtempSync(join(tmpdir(), 'serend-rel-'));
    dirs.push(releases);
    const a = site({ 'index.html': 'A' });
    const b = site({ 'index.html': 'B' });
    await storeRelease(releases, 'rel-a', a);
    await storeRelease(releases, 'rel-b', b);
    expect(await currentReleaseId(releases)).toBeUndefined();
    await switchCurrent(releases, 'rel-a');
    expect(await currentReleaseId(releases)).toBe('rel-a');
    await switchCurrent(releases, 'rel-b');
    expect(readlinkSync(join(releases, 'current'))).toBe('rel-b');
    await expect(switchCurrent(releases, 'gibt-es-nicht')).rejects.toThrow();
    expect(await currentReleaseId(releases)).toBe('rel-b'); // unverändert
  });

  it('räumt nur nicht benötigte Releases auf', async () => {
    const releases = mkdtempSync(join(tmpdir(), 'serend-rel-'));
    dirs.push(releases);
    for (const id of ['r1', 'r2', 'r3'])
      await storeRelease(releases, id, site({ 'index.html': id }));
    await switchCurrent(releases, 'r3');
    const removed = await pruneReleases(releases, new Set(['r2', 'r3']));
    expect(removed).toEqual(['r1']);
    expect(existsSync(join(releases, 'r1'))).toBe(false);
    expect(existsSync(join(releases, 'r2'))).toBe(true);
    expect(await currentReleaseId(releases)).toBe('r3');
  });
});
