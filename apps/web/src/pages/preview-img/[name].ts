import type { APIRoute, GetStaticPaths } from 'astro';
import { findVariant, renderVariant } from '../../lib/images';

/** Nur für die SSR-Vorschau (endungslose Bild-URLs). Im statischen Build entstehen hier keine Dateien. */
export const getStaticPaths = (() => []) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const variant = findVariant(params.name ?? '');
  if (!variant) return new Response('not found', { status: 404 });
  const body = await renderVariant(variant.media, variant.width, variant.format);
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': variant.format === 'avif' ? 'image/avif' : 'image/webp' },
  });
};
