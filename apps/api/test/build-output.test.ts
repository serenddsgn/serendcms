/**
 * Pflichttest: Entwürfe erscheinen nie im Build-Output.
 * Startet die echte API (Testdatenbank), seedet die Design-Inhalte mit winzigen Bildern, legt
 * Entwürfe mit einem Marker an, baut die Astro-Seite und durchsucht den gesamten Output.
 */
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { runChecks } from '@serend/builder';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '../src/seed/content.js';
import { createMediaService } from '../src/services/media.service.js';
import { createPagesService } from '../src/services/pages.service.js';
import { createProjectsService } from '../src/services/projects.service.js';
import { createLocalStorage } from '../src/storage/local.js';
import { as, createTestApp, createUser, draftBody, login, type TestApp } from './helpers.js';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DESIGN_IMAGES = join(REPO, 'design/images');
const SECRET = 'GEHEIMER-ENTWURF-7c1e';

let t: TestApp;
let out: string;
let baseUrl: string;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const text = (file: string) => readFileSync(file, 'utf8');
const textFiles = () =>
  [...walk(out)].filter((f) => /\.(html|xml|txt|md|json|js|css|caddy)$/.test(f));

beforeAll(async () => {
  t = await createTestApp({ docsEnabled: false });
  const admin = await createUser(t, { role: 'admin' });
  const session = await login(t, admin.email);

  // winzige Bilder unter den Dateinamen der Design-Bilder
  const tiny = mkdtempSync(join(tmpdir(), 'serend-tiny-'));
  for (const name of readdirSync(DESIGN_IMAGES).filter((n) => n.endsWith('.jpg'))) {
    writeFileSync(
      join(tiny, name),
      await sharp({ create: { width: 96, height: 64, channels: 3, background: '#c07050' } })
        .jpeg()
        .toBuffer(),
    );
  }
  const storage = createLocalStorage(t.config.media.storageDir);
  const media = createMediaService({ db: t.handle.db, storage });
  const projects = createProjectsService({ db: t.handle.db });
  const pages = createPagesService({ db: t.handle.db });
  await seedContent({
    db: t.handle.db,
    media,
    projects,
    pages,
    actorId: admin.id,
    imagesDir: tiny,
  });

  // Entwürfe: (1) neue Revision eines veröffentlichten Projekts, (2) Projekt nur als Entwurf,
  // (3) Seite nur als Entwurf, (4) Leistung als Entwurf
  const list = (await as(t, session, 'GET', '/api/v1/projects?locale=de')).json().projects as {
    id: string;
    slug: string;
    title: string;
  }[];
  const live = list.find((p) => p.slug === 'cista')!;
  const detail = (await as(t, session, 'GET', `/api/v1/projects/${live.id}`)).json();
  await as(
    t,
    session,
    'PUT',
    `/api/v1/projects/${live.id}/draft`,
    draftBody(detail, { title: `Cista ${SECRET}`, slug: 'cista-entwurf-slug' }),
  );
  const cover = detail.latest.coverMediaId;
  await as(t, session, 'POST', '/api/v1/projects', {
    slug: 'nur-entwurf',
    title: `Nur Entwurf ${SECRET}`,
    year: 2026,
    categories: ['web'],
    color: '#112233',
    coverMediaId: cover,
  });
  await pages.create(admin.id, {
    locale: 'de',
    systemKey: null,
    slug: 'geheime-seite',
    title: `Seite ${SECRET}`,
    content: [
      { id: crypto.randomUUID(), type: 'page_title', title: `Seite ${SECRET}`, showCount: false },
    ],
    seoTitle: null,
    seoDescription: null,
    ogMediaId: null,
  });

  // echte HTTP-Verbindung für den Astro-Build
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = t.app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  out = join(mkdtempSync(join(tmpdir(), 'serend-out-')), 'dist');
  mkdirSync(out, { recursive: true });
  const cache = mkdtempSync(join(tmpdir(), 'serend-cache-'));
  try {
    await run('pnpm', ['--filter', '@serend/web', 'build'], {
      cwd: REPO,
      env: {
        ...process.env,
        API_URL: baseUrl,
        BUILD_TOKEN: t.config.buildToken,
        SITE_URL: 'https://www.example.com',
        BUILD_OUT_DIR: out,
        ASSET_CACHE_DIR: cache,
      },
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(`Astro-Build fehlgeschlagen:\n${e.stdout ?? ''}\n${e.stderr ?? ''}`, {
      cause: err,
    });
  }
}, 240_000);
afterAll(() => t.close());

describe('Build-Output', () => {
  it('enthält nirgends Entwurfsinhalt (HTML, Markdown, Sitemap, llms.txt, JSON, JS, CSS)', () => {
    const hits = textFiles().filter((f) => {
      const c = text(f);
      return (
        c.includes(SECRET) ||
        c.includes('cista-entwurf-slug') ||
        c.includes('geheime-seite') ||
        c.includes('nur-entwurf')
      );
    });
    expect(hits.map((f) => relative(out, f))).toEqual([]);
  });

  it('erzeugt keine Seiten für Entwürfe', () => {
    for (const p of [
      'projekte/nur-entwurf',
      'projekte/cista-entwurf-slug',
      'geheime-seite',
      'projekte/nur-entwurf.md',
      'og/de/projekte/nur-entwurf.png',
    ]) {
      expect(existsSync(join(out, p)), p).toBe(false);
    }
  });

  it('baut die veröffentlichte Revision (alter Titel, alter Slug)', () => {
    const html = text(join(out, 'projekte/cista/index.html'));
    expect(html).toContain('<title>Cista · serend.design</title>');
  });

  it('erzeugt alle Seiten beider Sprachen', () => {
    for (const p of [
      'index.html',
      'en/index.html',
      'projekte/index.html',
      'en/work/index.html',
      'projekte/dolce-falcone/index.html',
      'en/work/dolce-falcone/index.html',
      '404.html',
    ]) {
      expect(existsSync(join(out, p)), p).toBe(true);
    }
    expect(existsSync(join(out, 'de')), 'kein /de-Verzeichnis mehr').toBe(false);
    expect(existsSync(join(out, 'en/index.md'))).toBe(true);
    expect(
      readdirSync(join(out, 'projekte')).filter((n) => !n.endsWith('.md') && n !== 'index.html'),
    ).toHaveLength(12);
  });

  it('liefert das SEO-Paket: Canonical, hreflang, JSON-LD, OG-Bild, robots, Sitemap, llms.txt, Markdown', () => {
    const html = text(join(out, 'projekte/dolce-falcone/index.html'));
    expect(html).toContain('<html lang="de"');
    expect(html).toContain(
      'rel="canonical" href="https://www.example.com/projekte/dolce-falcone/"',
    );
    expect(html).toContain('hreflang="en" href="https://www.example.com/en/work/dolce-falcone/"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain(
      'property="og:image" content="https://www.example.com/og/de/projekte/dolce-falcone.png"',
    );
    expect(html).toContain('"@type":"CreativeWork"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(text(join(out, 'index.html'))).toContain('"@type":"Organization"');
    expect(existsSync(join(out, 'og/de/projekte/dolce-falcone.png'))).toBe(true);
    expect(text(join(out, 'robots.txt'))).toContain('Sitemap: https://www.example.com/sitemap.xml');
    const sitemap = text(join(out, 'sitemap.xml'));
    expect(sitemap).toContain('<loc>https://www.example.com/projekte/dolce-falcone/</loc>');
    expect(sitemap).toContain('hreflang="en"');
    expect(text(join(out, 'llms.txt'))).toContain('/projekte/dolce-falcone.md');
    const md = text(join(out, 'projekte/dolce-falcone.md'));
    expect(md).toContain('# Dolce & Falcone');
    expect(md).toContain('## 01 · Um wen es geht');
    expect(existsSync(join(out, 'index.md'))).toBe(true);
  });

  it('liefert Bilder als AVIF/WebP mit width, height, srcset und sizes', () => {
    const html = text(join(out, 'index.html'));
    expect(html).toMatch(/<source type="?image\/avif"? srcset="[^"]+" sizes="[^"]+"/);
    expect(html).toMatch(
      /<img src="\/img\/[0-9a-f]{12}-\d+\.webp" width="\d+" height="\d+" alt="[^"]+"/,
    );
    expect([...walk(join(out, 'img'))].some((f) => f.endsWith('.avif'))).toBe(true);
  });

  it('enthält keine Secrets (Build-Token, Session-Secret, Datenbank-Passwort)', () => {
    const secrets = [t.config.buildToken, t.config.sessionSecret, t.config.previewSigningKey];
    for (const f of textFiles()) {
      const c = text(f);
      for (const s of secrets) expect(c.includes(s), relative(out, f)).toBe(false);
    }
  });

  it('besteht die Build-Prüfungen: keine kaputten Links, gültiges HTML, JS-Budget ≤ 50 KB pro Seite', async () => {
    const result = await runChecks(out, { siteUrl: 'https://www.example.com', lighthouse: false });
    expect(result.problems).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.links.links).toBeGreaterThan(100);
    expect(Math.max(...result.budget.pages.map((p) => p.bytes))).toBeLessThan(50 * 1024);
  });
});
