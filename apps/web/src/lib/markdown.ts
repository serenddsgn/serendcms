import { blocksToMarkdown, type Locale, type MarkdownContext } from '@serend/schema';
import {
  altOf,
  categoryName,
  data,
  projectUrl,
  projectsFor,
  resolveTarget,
  servicesFor,
  setting,
} from './data';
import { plainText, abs } from './seo';
import type { Entry } from './pages';
import { t } from '../i18n';

function context(locale: Locale): MarkdownContext {
  return {
    projects: projectsFor(locale).map((p) => ({
      title: p.revision.title,
      url: abs(projectUrl(p)),
      year: p.revision.year,
      categories: p.revision.categories.map((c) => categoryName(locale, c)),
    })),
    services: servicesFor(locale).map((s) => ({ name: s.name, description: s.description })),
    resolveLink: (target) => {
      try {
        return resolveTarget(target as never);
      } catch {
        return null;
      }
    },
    mediaAlt: (id) => altOf(id, locale) || null,
    email: setting(locale, 'site.identity').email,
  };
}

/** Markdown-Version einer Seite, aus denselben Blöcken wie das HTML. */
export function markdownFor(e: Entry): string {
  const ctx = context(e.locale);
  const ui = t(e.locale);
  if (e.kind === 'project') {
    const r = e.project.revision;
    const head = [`# ${r.title}`];
    if (r.subtitle) head.push(`> ${plainText(r.subtitle)}`);
    const meta = [
      r.client ? `- ${ui.client}: ${r.client}` : null,
      `- ${ui.area}: ${r.categories.map((c) => categoryName(e.locale, c)).join(', ')}`,
      `- ${ui.year}: ${r.year}`,
      r.liveUrl ? `- ${ui.live}: ${r.liveUrl}` : null,
      `- URL: ${abs(e.url)}`,
    ].filter(Boolean);
    const gallery = r.gallery.map(
      (g) =>
        `![${altOf(g.mediaId, e.locale, g.altOverride)}](${abs(`/img/${(data().mediaById.get(g.mediaId)?.sha256 ?? '').slice(0, 12)}-1200.webp`)})`,
    );
    return [
      head.join('\n\n'),
      meta.join('\n'),
      ...(gallery.length ? [gallery.join('\n')] : []),
      blocksToMarkdown(r.content, ctx),
    ].join('\n\n');
  }
  const body = blocksToMarkdown(e.page.revision.content, ctx);
  const hasH1 = /^# /m.test(body);
  return `${hasH1 ? '' : `# ${e.page.revision.title}\n\n`}${body}\n---\nURL: ${abs(e.url)}\n`;
}
