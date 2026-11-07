/** Alle auszuliefernden Seiten (Route, Daten) an einer Stelle; Grundlage für Seiten, Markdown, OG-Bilder, Sitemap und llms.txt. */
import {
  ROUTE_SEGMENTS,
  localePrefix,
  type BuildPage,
  type BuildProject,
  type Locale,
} from '@serend/schema';
import { LOCALES } from '../i18n';
import { data, pageUrl, projectUrl, translationOf } from './data';

export type Entry =
  | {
      kind: 'home' | 'projects' | 'content';
      locale: Locale;
      slug: string;
      key: string;
      url: string;
      page: BuildPage;
      alternates: Partial<Record<Locale, string>>;
      lastmod: string;
    }
  | {
      kind: 'project';
      locale: Locale;
      slug: string;
      key: string;
      url: string;
      project: BuildProject;
      alternates: Partial<Record<Locale, string>>;
      lastmod: string;
    };

/** `slug` ist der Pfad ohne Sprachpräfix (leer bei der Startseite); `key` benennt die OG-/Markdown-Datei. */
export function allEntries(): Entry[] {
  const d = data();
  const out: Entry[] = [];
  for (const page of d.pages) {
    const alternates = translationOf(page, 'page');
    const kind = page.systemKey ?? 'content';
    const slug =
      page.systemKey === 'home'
        ? ''
        : page.systemKey === 'projects'
          ? ROUTE_SEGMENTS[page.locale].projects
          : page.revision.slug;
    out.push({
      kind,
      locale: page.locale,
      slug,
      key: slug || 'home',
      url: pageUrl(page),
      page,
      alternates,
      lastmod: page.revision.publishedAt,
    });
  }
  for (const project of d.projects) {
    out.push({
      kind: 'project',
      locale: project.locale,
      slug: `${ROUTE_SEGMENTS[project.locale].projects}/${project.revision.slug}`,
      key: `${ROUTE_SEGMENTS[project.locale].projects}/${project.revision.slug}`,
      url: projectUrl(project),
      project,
      alternates: translationOf(project, 'project'),
      lastmod: project.revision.publishedAt,
    });
  }
  return out.filter((e) => LOCALES.includes(e.locale));
}

/** Markdown-Variante einer Seite: `/index.md` (Startseite de), `/en/index.md`, `/projekte/x.md`, `/en/work/x.md`. */
export const mdPath = (e: Pick<Entry, 'locale' | 'slug'>) =>
  `${localePrefix(e.locale)}/${e.slug ? `${e.slug}.md` : 'index.md'}`;
export const ogPath = (e: Pick<Entry, 'locale' | 'key'>) => `/og/${e.locale}/${e.key}.png`;

/** Routenparameter (`[...path]`): URL ohne führenden und abschließenden Slash; leer bei der deutschen Startseite. */
export const routeParam = (e: Pick<Entry, 'url'>): string | undefined =>
  e.url.replace(/^\/|\/$/g, '') || undefined;
/** Parameter der Markdown-Route: `mdPath` ohne führenden Slash und ohne `.md`. */
export const mdParam = (e: Pick<Entry, 'locale' | 'slug'>): string =>
  mdPath(e).slice(1, -'.md'.length);

/** Für SSR (Vorschau): Eintrag zu einer URL finden. `path` ist der Routenparameter. */
export function findEntry(path: string | undefined): Entry | undefined {
  const wanted = (path ?? '').replace(/\/$/, '');
  return allEntries().find((e) => (routeParam(e) ?? '') === wanted);
}
