import type { APIRoute, GetStaticPaths } from 'astro';
import { data, loadData, setting } from '../../../lib/data';
import { renderOg } from '../../../lib/og';
import { allEntries } from '../../../lib/pages';

export const getStaticPaths = (async () => {
  await loadData();
  return allEntries().map((entry) => ({
    params: { locale: entry.locale, key: entry.key },
    props: { entry },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { entry } = props as { entry: ReturnType<typeof allEntries>[number] };
  const siteName = setting(entry.locale, 'seo.defaults').siteName;
  const project = entry.kind === 'project' ? entry.project : undefined;
  const cover = project?.revision.coverMediaId
    ? data().mediaById.get(project.revision.coverMediaId)
    : undefined;
  const title =
    entry.kind === 'project'
      ? entry.project.revision.title
      : entry.kind === 'home'
        ? siteName
        : entry.page.revision.title;
  const png = await renderOg({ title, siteName, cover, color: project?.revision.color });
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
