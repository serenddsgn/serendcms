import type { APIRoute } from 'astro';
import { loadData } from '../lib/data';
import { allEntries } from '../lib/pages';
import { abs } from '../lib/seo';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = async () => {
  await loadData();
  const urls = allEntries().map((e) => {
    const links = Object.entries(e.alternates).map(
      ([l, p]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(abs(p))}"/>`,
    );
    if (e.alternates.de)
      links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(abs(e.alternates.de))}"/>`);
    const alt = links.join('\n');
    return `  <url>\n    <loc>${esc(abs(e.url))}</loc>\n    <lastmod>${e.lastmod.slice(0, 10)}</lastmod>\n${alt}\n  </url>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
