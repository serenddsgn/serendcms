import type { APIRoute } from 'astro';
import { abs } from '../lib/seo';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /build-meta/\n\nSitemap: ${abs('/sitemap.xml')}\n`,
    {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    },
  );
