/**
 * Datenzugriff beim Build: holt alle freigegebenen Inhalte über /internal/build/* (Build-Token),
 * validiert sie mit den Zod-Schemas aus packages/schema und baut Indizes.
 * Nach dem Deployment gibt es keine Abhängigkeit mehr von der API.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  BuildManifest,
  BuildMedia,
  BuildNavItem,
  BuildPage,
  BuildProject,
  BuildRedirect,
  BuildService,
  BuildSetting,
  homePath,
  pagePath,
  parseSetting,
  projectIndexPath,
  projectPath,
  pageContentSchema,
  type Locale,
  type SettingKey,
  type SettingValue,
} from '@serend/schema';
import { LOCALES } from '../i18n';

export const CACHE_DIR = process.env.ASSET_CACHE_DIR ?? join(process.cwd(), '.cache');

export interface SiteData {
  manifest: z.infer<typeof BuildManifest>;
  projects: BuildProject[];
  pages: BuildPage[];
  services: BuildService[];
  navigation: BuildNavItem[];
  media: BuildMedia[];
  redirects: z.infer<typeof BuildRedirect>[];
  settings: BuildSetting[];
  mediaById: Map<string, BuildMedia>;
  projectById: Map<string, BuildProject>;
  pageById: Map<string, BuildPage>;
}

let loading: Promise<SiteData> | undefined;
let loaded: SiteData | undefined;
/** Vorschau (SSR): Daten gelten je Anfrage, nicht global. */
const requestData = new AsyncLocalStorage<SiteData>();
export const runWithData = <T>(d: SiteData, fn: () => T): T => requestData.run(d, fn);
export const PREVIEW_MODE = process.env.PREVIEW_MODE === '1';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt (wird vom Build-Job gesetzt).`);
  return v;
}

async function fetchJson<S extends z.ZodType>(
  base: string,
  token: string,
  path: string,
  schema: S,
): Promise<z.infer<S>> {
  const res = await fetch(`${base}/internal/build/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`/internal/build/${path} antwortet mit ${res.status}`);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `/internal/build/${path}: ungültige Antwort (${parsed.error.issues[0]?.path.join('.')})`,
    );
  }
  return parsed.data;
}

export function loadData(): Promise<SiteData> {
  const scoped = requestData.getStore();
  if (scoped) return Promise.resolve(scoped);
  loading ??= (async () => {
    const base = process.env.API_URL ?? 'http://127.0.0.1:4000';
    const token = requireEnv('BUILD_TOKEN');
    const get = <S extends z.ZodType>(p: string, s: S) => fetchJson(base, token, p, s);
    const [manifest, projects, pages, services, navigation, media, redirects, settings] =
      await Promise.all([
        get('manifest', BuildManifest),
        get('projects', z.array(BuildProject)),
        get('pages', z.array(BuildPage)),
        get('services', z.array(BuildService)),
        get('navigation', z.array(BuildNavItem)),
        get('media', z.array(BuildMedia)),
        get('redirects', z.array(BuildRedirect)),
        get('settings', z.array(BuildSetting)),
      ]);

    // Seiteninhalt je Seitentyp validieren (bricht den Build bei ungültigen Daten ab)
    for (const p of pages) {
      const r = pageContentSchema(p.systemKey).safeParse(p.revision.content);
      if (!r.success) throw new Error(`Seite ${p.revision.slug} (${p.locale}): ungültiger Inhalt`);
    }

    // Originaldateien lokal zwischenspeichern (Schlüssel = sha256, bleibt zwischen Builds erhalten)
    await Promise.all(
      media.map(async (m) => {
        const file = originalPath(m);
        if (existsSync(file)) return;
        const res = await fetch(`${base}/internal/build/media/${m.id}/file`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Medium ${m.id} konnte nicht geladen werden (${res.status})`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
      }),
    );

    loaded = indexData({
      manifest,
      projects,
      pages,
      services,
      navigation,
      media,
      redirects,
      settings,
    });
    validate(loaded);
    return loaded;
  })();
  return loading;
}

type RawData = Pick<
  SiteData,
  'manifest' | 'projects' | 'pages' | 'services' | 'navigation' | 'media' | 'redirects' | 'settings'
>;
function indexData(raw: RawData): SiteData {
  return {
    ...raw,
    mediaById: new Map(raw.media.map((m) => [m.id, m])),
    projectById: new Map(raw.projects.map((p) => [p.id, p])),
    pageById: new Map(raw.pages.map((p) => [p.id, p])),
  };
}

// ── Vorschau: Datenpaket mit der neuesten Revision des betrachteten Inhalts ──────────────
const PreviewBundle = z.object({
  target: z.object({ kind: z.enum(['project', 'page']), id: z.string() }),
  projects: z.array(BuildProject),
  pages: z.array(BuildPage),
  services: z.array(BuildService),
  navigation: z.array(BuildNavItem),
  settings: z.array(BuildSetting),
  media: z.array(BuildMedia),
  redirects: z.array(BuildRedirect),
});
const previewCache = new Map<string, { until: number; data: Promise<SiteData> }>();

/** Wird geworfen, wenn die API das Token ablehnt (ungültig oder abgelaufen). */
export class PreviewDeniedError extends Error {}

export function loadPreviewData(token: string): Promise<SiteData> {
  const now = Date.now();
  for (const [k, v] of previewCache) if (v.until < now) previewCache.delete(k);
  const hit = previewCache.get(token);
  if (hit) return hit.data;
  const result = (async () => {
    const base = process.env.API_URL ?? 'http://127.0.0.1:4000';
    const headers = { authorization: `Bearer ${token}` };
    const res = await fetch(`${base}/internal/preview/bundle`, { headers });
    if (res.status === 401 || res.status === 403 || res.status === 404)
      throw new PreviewDeniedError();
    if (!res.ok) throw new Error(`Vorschau-Paket: API antwortet mit ${res.status}`);
    const b = PreviewBundle.parse(await res.json());
    await Promise.all(
      b.media.map(async (m) => {
        const file = originalPath(m);
        if (existsSync(file)) return;
        const r = await fetch(`${base}/internal/preview/media/${m.id}/file`, { headers });
        if (!r.ok) throw new Error(`Vorschau-Medium ${m.id}: ${r.status}`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(await r.arrayBuffer()));
      }),
    );
    const d = indexData({
      ...b,
      manifest: {
        counts: {
          projects: b.projects.length,
          pages: b.pages.length,
          services: b.services.length,
          navigation: b.navigation.length,
          settings: b.settings.length,
          media: b.media.length,
          redirects: b.redirects.length,
        },
        projectRevisionIds: [],
        pageRevisionIds: [],
      },
    });
    validate(d);
    return d;
  })();
  previewCache.set(token, { until: now + 60_000, data: result });
  result.catch(() => previewCache.delete(token));
  return result;
}

export function data(): SiteData {
  const scoped = requestData.getStore();
  if (scoped) return scoped;
  if (!loaded) throw new Error('Daten nicht geladen: zuerst `await loadData()` aufrufen.');
  return loaded;
}

export function originalPath(m: Pick<BuildMedia, 'sha256' | 'storageKey'>): string {
  const ext = m.storageKey.split('.').pop() ?? 'bin';
  return join(CACHE_DIR, 'originals', `${m.sha256}.${ext}`);
}

export async function readOriginal(m: BuildMedia): Promise<Buffer> {
  return readFile(originalPath(m));
}

// ── Validierung: ein fehlerhafter Datenstand soll den Build abbrechen, nicht kaputte Seiten erzeugen ──
function validate(d: SiteData): void {
  for (const locale of LOCALES) {
    for (const key of ['home', 'projects'] as const) {
      if (!d.pages.some((p) => p.locale === locale && p.systemKey === key)) {
        throw new Error(
          `Pflichtseite „${key}“ fehlt in der Sprache ${locale} (nicht veröffentlicht?).`,
        );
      }
    }
    for (const key of [
      'site.identity',
      'site.cta',
      'site.footer',
      'seo.defaults',
      'organization',
    ] as const) {
      if (!d.settings.some((s) => s.locale === locale && s.key === key)) {
        throw new Error(`Einstellung „${key}“ fehlt in der Sprache ${locale}.`);
      }
    }
  }
  for (const p of d.projects) {
    if (!p.revision.coverMediaId || !d.mediaById.has(p.revision.coverMediaId)) {
      throw new Error(`Projekt ${p.revision.slug}: Cover fehlt.`);
    }
  }
}

// ── Zugriffshelfer ────────────────────────────────────────────────────
export function setting<K extends SettingKey>(locale: Locale, key: K): SettingValue<K> {
  const s = data().settings.find((x) => x.locale === locale && x.key === key);
  if (!s) throw new Error(`Einstellung ${key} (${locale}) fehlt`);
  return parseSetting(key, s.value);
}

/** Wie `setting`, aber für optionale Einstellungen: fehlt der Eintrag, kommt `undefined`. */
export function optionalSetting<K extends SettingKey>(
  locale: Locale,
  key: K,
): SettingValue<K> | undefined {
  const s = data().settings.find((x) => x.locale === locale && x.key === key);
  return s ? parseSetting(key, s.value) : undefined;
}

export const projectsFor = (locale: Locale) =>
  data()
    .projects.filter((p) => p.locale === locale)
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** Neuestes Projekt (höchstes Jahr, bei Gleichstand das weiter vorn einsortierte). */
export const newestProject = (locale: Locale): BuildProject | undefined =>
  projectsFor(locale).reduce<BuildProject | undefined>(
    (best, p) => (!best || p.revision.year > best.revision.year ? p : best),
    undefined,
  );

/** Projekt im Hero: das im Admin gewählte (ID in beliebiger Sprache), sonst das neueste. */
export function heroProject(locale: Locale, projectId?: string): BuildProject | undefined {
  if (projectId) {
    const d = data();
    const chosen = d.projectById.get(projectId);
    const own =
      chosen && chosen.locale !== locale
        ? d.projects.find(
            (p) => p.translationGroupId === chosen.translationGroupId && p.locale === locale,
          )
        : chosen;
    if (own) return own;
  }
  return newestProject(locale);
}

/** Erstes Bild des Streifens, den die Projektseite zeigt: Galerie des Projekts, sonst der erste Streifen-Block. */
export function firstStripMedia(p: BuildProject): string | undefined {
  const blocks = p.revision.content as {
    type?: string;
    layout?: string;
    items?: { mediaId: string }[];
  }[];
  const id =
    p.revision.gallery[0]?.mediaId ??
    blocks.find((b) => b.type === 'gallery' && b.layout !== 'grid')?.items?.[0]?.mediaId;
  const m = id ? data().mediaById.get(id) : undefined;
  return id && m && !m.mime.startsWith('video/') ? id : undefined;
}

/** Studio-Porträt aus dem Bild-mit-Text-Block der Startseite (Header-Button und Projektende). */
export function studioPortraitId(locale: Locale): string | undefined {
  const home = data().pages.find((p) => p.locale === locale && p.systemKey === 'home');
  const blocks = (home?.revision.content ?? []) as { type?: string; mediaId?: string }[];
  const id = blocks.find((b) => b.type === 'media_text_card')?.mediaId;
  return id && data().mediaById.has(id) ? id : undefined;
}

export const featuredFor = (locale: Locale) =>
  projectsFor(locale)
    .filter((p) => p.featured)
    .sort((a, b) => (a.featuredSortOrder ?? 999) - (b.featuredSortOrder ?? 999));

export const servicesFor = (locale: Locale) =>
  data()
    .services.filter((s) => s.locale === locale)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const navFor = (locale: Locale, location: 'header' | 'footer' | 'legal') =>
  data()
    .navigation.filter((n) => n.locale === locale && n.location === location)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export const pageFor = (locale: Locale, key: 'home' | 'projects') => {
  const p = data().pages.find((x) => x.locale === locale && x.systemKey === key);
  if (!p) throw new Error(`Seite ${key} (${locale}) fehlt`);
  return p;
};

// ── URLs ──────────────────────────────────────────────────────────────
const slash = (p: string) => (p.endsWith('/') ? p : `${p}/`);

export function pageUrl(p: BuildPage): string {
  if (p.systemKey === 'home') return homePath(p.locale);
  if (p.systemKey === 'projects') return projectIndexPath(p.locale);
  return `${pagePath(p.locale, p.revision.slug)}/`;
}
export const projectUrl = (p: BuildProject) => `${projectPath(p.locale, p.revision.slug)}/`;
export const withSlash = slash;

export type Target =
  | { kind: 'page'; pageId: string; fragment?: string | null | undefined }
  | { kind: 'project'; projectId: string }
  | { kind: 'url'; url: string };

/** Löst ein Link-Ziel auf; unauflösbare Ziele brechen den Build ab (kaputter Link). */
export function resolveTarget(target: Target): string {
  const d = data();
  if (target.kind === 'url') return target.url;
  if (target.kind === 'project') {
    const p = d.projectById.get(target.projectId);
    if (!p) throw new Error(`Kaputter Link: Projekt ${target.projectId} ist nicht veröffentlicht.`);
    return projectUrl(p);
  }
  const page = d.pageById.get(target.pageId);
  if (!page) throw new Error(`Kaputter Link: Seite ${target.pageId} ist nicht veröffentlicht.`);
  return pageUrl(page) + (target.fragment ? `#${target.fragment}` : '');
}

/** Gegenstück in anderer Sprache (nur wenn veröffentlicht). */
export function translationOf(
  entity: { translationGroupId: string; locale: Locale },
  kind: 'project' | 'page',
): Partial<Record<Locale, string>> {
  const d = data();
  const out: Partial<Record<Locale, string>> = {};
  for (const locale of LOCALES) {
    if (kind === 'project') {
      const p = d.projects.find(
        (x) => x.translationGroupId === entity.translationGroupId && x.locale === locale,
      );
      if (p) out[locale] = projectUrl(p);
    } else {
      const p = d.pages.find(
        (x) => x.translationGroupId === entity.translationGroupId && x.locale === locale,
      );
      if (p) out[locale] = pageUrl(p);
    }
  }
  return out;
}

export const altOf = (mediaId: string, locale: Locale, override?: string | null): string =>
  (override?.trim() || data().mediaById.get(mediaId)?.altText[locale]?.trim()) ?? '';

export const categoryName = (locale: Locale, key: string): string =>
  servicesFor(locale).find((s) => s.key === key)?.name ?? key;
