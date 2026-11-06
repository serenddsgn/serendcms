import type { APIRoute } from 'astro';
import { loadData, setting } from '../lib/data';
import { LOCALES } from '../i18n';
import { allEntries, mdPath } from '../lib/pages';
import { abs } from '../lib/seo';

/** llms.txt nach llmstxt.org: Name, Kurzbeschreibung, Links auf die Markdown-Versionen aller Seiten. */
export const GET: APIRoute = async () => {
  await loadData();
  const seo = setting('de', 'seo.defaults');
  const sections = LOCALES.map((locale) => {
    const lines = allEntries()
      .filter((e) => e.locale === locale)
      .map((e) => {
        const title = e.kind === 'project' ? e.project.revision.title : e.page.revision.title;
        return `- [${title}](${abs(mdPath(e))})`;
      });
    return `## ${locale === 'de' ? 'Deutsch' : 'English'}\n\n${lines.join('\n')}`;
  });
  const body = `# ${seo.siteName}\n\n> ${seo.description}\n\n${sections.join('\n\n')}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
