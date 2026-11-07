/**
 * Vorschau-SSR end-to-end: dieselbe Astro-App als Node-Server, echte API, echtes signiertes Token.
 * Prüft Token-Tausch (Cookie statt URL), Entwurfsinhalt, noindex/nofollow, Ablehnung und Abgrenzung.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPreviewToken } from '../src/lib/preview-token.js';
import { seedContent } from '../src/seed/content.js';
import { createMediaService } from '../src/services/media.service.js';
import { createPagesService } from '../src/services/pages.service.js';
import { createProjectsService } from '../src/services/projects.service.js';
import { createLocalStorage } from '../src/storage/local.js';
import {
  as,
  createTestApp,
  createUser,
  draftBody,
  login,
  type Session,
  type TestApp,
} from './helpers.js';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const DRAFT = 'ENTWURF-NUR-IN-DER-VORSCHAU-5521';

let t: TestApp;
let admin: Session;
let server: ChildProcess;
let base: string;
let out: string;
let cistaId: string;
let draftOnlyId: string;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
const previewUrl = async (projectId: string) => {
  const url = (await as(t, admin, 'POST', `/api/v1/projects/${projectId}/preview-link`)).json()
    .url as string;
  const u = new URL(url);
  return { path: u.pathname, token: u.searchParams.get('preview')!, search: u.search };
};
const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { redirect: 'manual', headers });
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;

beforeAll(async () => {
  t = await createTestApp({ docsEnabled: false });
  const user = await createUser(t, { role: 'admin' });
  admin = await login(t, user.email);

  const tiny = mkdtempSync(join(tmpdir(), 'serend-tiny-'));
  for (const name of readdirSync(join(REPO, 'design/images')).filter((n) => n.endsWith('.jpg'))) {
    writeFileSync(
      join(tiny, name),
      await sharp({ create: { width: 96, height: 64, channels: 3, background: '#7080c0' } })
        .jpeg()
        .toBuffer(),
    );
  }
  const storage = createLocalStorage(t.config.media.storageDir);
  await seedContent({
    db: t.handle.db,
    media: createMediaService({ db: t.handle.db, storage }),
    projects: createProjectsService({ db: t.handle.db }),
    pages: createPagesService({ db: t.handle.db }),
    actorId: user.id,
    imagesDir: tiny,
  });

  const list = (await as(t, admin, 'GET', '/api/v1/projects?locale=de')).json().projects as {
    id: string;
    slug: string;
  }[];
  cistaId = list.find((p) => p.slug === 'cista')!.id;
  const detail = (await as(t, admin, 'GET', `/api/v1/projects/${cistaId}`)).json();
  await as(
    t,
    admin,
    'PUT',
    `/api/v1/projects/${cistaId}/draft`,
    draftBody(detail, { title: DRAFT }),
  );
  draftOnlyId = (
    await as(t, admin, 'POST', '/api/v1/projects', {
      slug: 'nur-entwurf',
      title: `${DRAFT} 2`,
      year: 2026,
      categories: ['web'],
      color: '#112233',
      coverMediaId: detail.latest.coverMediaId,
    })
  ).json().project.id;

  await t.app.listen({ port: 0, host: '127.0.0.1' });
  const apiPort = (t.app.server.address() as { port: number }).port;
  // Der Server löst seine Pakete relativ zur Datei auf: Ausgabe deshalb innerhalb von apps/web (node_modules erreichbar).
  out = join(REPO, 'apps/web', `dist-test-${process.pid}-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const cache = mkdtempSync(join(tmpdir(), 'serend-prevcache-'));
  const env: Record<string, string | undefined> = {
    ...process.env,
    PREVIEW_MODE: '1',
    API_URL: `http://127.0.0.1:${apiPort}`,
    BUILD_OUT_DIR: out,
    ASSET_CACHE_DIR: cache,
    SITE_URL: 'https://www.example.com',
  };
  delete env.BUILD_TOKEN; // der Vorschau-Server braucht kein dauerhaftes Secret
  await run('pnpm', ['--filter', '@serend/web', 'build'], {
    cwd: REPO,
    env,
    maxBuffer: 20 * 1024 * 1024,
  });

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', [join(out, 'server/entry.mjs')], {
    env: { ...env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}, 240_000);
afterAll(async () => {
  server?.kill();
  if (out) rmSync(out, { recursive: true, force: true });
  await t.close();
});

describe('Vorschau-Server (SSR)', () => {
  it('tauscht das Token gegen ein HttpOnly-Cookie und entfernt es per Redirect aus der URL', async () => {
    const { path, token } = await previewUrl(cistaId);
    const res = await get(`${path}?preview=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(path); // Token nicht mehr in der URL
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('zeigt mit gültigem Cookie den Entwurf, noindex, ohne das Token im HTML', async () => {
    const { path, token } = await previewUrl(cistaId);
    const cookie = cookieOf(await get(`${path}?preview=${token}`));
    const res = await get(path, { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(DRAFT);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('Vorschau · nicht öffentlich');
    expect(html).not.toContain(token);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rendert auch Projekte, die noch nie veröffentlicht wurden, nur mit ihrem eigenen Token', async () => {
    const { path, token } = await previewUrl(draftOnlyId);
    const cookie = cookieOf(await get(`${path}?preview=${token}`));
    expect(await (await get(path, { cookie })).text()).toContain(`${DRAFT} 2`);
    // das Cista-Token zeigt dieses Projekt nicht (404), und umgekehrt bleibt der Cista-Entwurf verborgen
    const other = await previewUrl(cistaId);
    const otherCookie = cookieOf(await get(`${other.path}?preview=${other.token}`));
    expect((await get(path, { cookie: otherCookie })).status).toBe(404);
    const home = await (await get('/', { cookie: otherCookie })).text();
    expect(home).not.toContain(`${DRAFT} 2`);
  });

  it('liefert die übrige Seite im veröffentlichten Stand (Navigation, Startseite, Bilder)', async () => {
    const { path, token } = await previewUrl(cistaId);
    const cookie = cookieOf(await get(`${path}?preview=${token}`));
    const home = await get('/', { cookie });
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('Wir gestalten nicht nur,');
    const img = html.match(/<img src="?(\/preview-img\/[^"\s>]+)/)![1]!;
    const asset = await get(img, { cookie });
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toBe('image/webp');
    expect((await get(img)).status).toBe(403); // ohne Cookie nicht
  });

  it('lehnt fehlende, ungültige, fremd signierte und abgelaufene Token ab', async () => {
    expect((await get('/projekte/cista/')).status).toBe(403);
    const { path } = await previewUrl(cistaId);
    const forged = [
      'murks',
      signPreviewToken('fremder-schluessel'.padEnd(50, 'f'), { k: 'project', id: cistaId }).token,
      signPreviewToken(
        t.config.previewSigningKey,
        { k: 'project', id: cistaId },
        Date.now() - 16 * 60 * 1000,
      ).token,
    ];
    for (const token of forged) {
      const cookie = cookieOf(await get(`${path}?preview=${token}`)); // Redirect setzt das Cookie …
      const res = await get(path, { cookie }); // … die Anfrage wird aber abgelehnt
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(DRAFT);
    }
  });

  it('läuft ohne Build-Token und kennt keine Secrets', async () => {
    const { path, token } = await previewUrl(cistaId);
    const cookie = cookieOf(await get(`${path}?preview=${token}`));
    const html = await (await get(path, { cookie })).text();
    for (const s of [t.config.buildToken, t.config.sessionSecret, t.config.previewSigningKey])
      expect(html).not.toContain(s);
  });
});
