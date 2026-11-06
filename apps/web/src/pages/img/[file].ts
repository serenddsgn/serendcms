import type { APIRoute, GetStaticPaths } from 'astro';
import { loadData } from '../../lib/data';
import { allVariants, renderVariant } from '../../lib/images';

export const getStaticPaths = (async () => {
  await loadData();
  return allVariants().map((v) => ({ params: { file: v.file }, props: v }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { media, width, format } = props as ReturnType<typeof allVariants>[number];
  const body = await renderVariant(media, width, format);
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': format === 'avif' ? 'image/avif' : 'image/webp' },
  });
};
