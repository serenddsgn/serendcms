/** Alle auszuliefernden Seiten (Route, Daten) an einer Stelle; Grundlage für Seiten, Markdown, OG-Bilder, Sitemap und llms.txt. */
import { ROUTE_SEGMENTS, type BuildPage, type BuildProject, type Locale } from '@serend/schema';
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

/** `slug` ist der Pfad ohne Sprache (leer bei der Startseite); `key` benennt die OG-/Markdown-Datei. */
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

export const mdPath = (e: Pick<Entry, 'locale' | 'slug'>) =>
  `/${e.locale}/${e.slug ? `${e.slug}.md` : 'index.md'}`;
export const ogPath = (e: Pick<Entry, 'locale' | 'key'>) => `/og/${e.locale}/${e.key}.png`;
