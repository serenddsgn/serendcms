import type { APIRoute, GetStaticPaths } from 'astro';
import { loadData } from '../../lib/data';
import { markdownFor } from '../../lib/markdown';
import { allEntries } from '../../lib/pages';

export const getStaticPaths = (async () => {
  await loadData();
  return allEntries()
    .filter((e) => e.kind === 'home')
    .map((entry) => ({ params: { locale: entry.locale }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  props?.entry
    ? new Response(markdownFor(props.entry), {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      })
    : new Response('not found', { status: 404 });
