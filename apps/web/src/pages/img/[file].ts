import type { APIRoute, GetStaticPaths } from 'astro';
import { loadData } from '../../lib/data';
import { allVariants, findVariant, renderVariant } from '../../lib/images';

export const getStaticPaths = (async () => {
  await loadData();
  return allVariants().map((v) => ({ params: { file: v.file }, props: v }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props, params }) => {
  // Statischer Build: Variante kommt aus getStaticPaths; Vorschau (SSR): aus dem Dateinamen.
  const variant =
    (props as ReturnType<typeof allVariants>[number] | undefined) ?? findVariant(params.file ?? '');
  if (!variant) return new Response('not found', { status: 404 });
  const { media, width, format } = variant;
  const body = await renderVariant(media, width, format);
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': format === 'avif' ? 'image/avif' : 'image/webp' },
  });
};
