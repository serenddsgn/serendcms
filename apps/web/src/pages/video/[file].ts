import type { APIRoute, GetStaticPaths } from 'astro';
import { loadData } from '../../lib/data';
import { allVideos } from '../../lib/images';
import { videoResponse } from '../../lib/video-response';

export const getStaticPaths = (async () => {
  await loadData();
  return allVideos().map((v) => ({ params: { file: v.file }, props: v }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props, request }) => {
  const video = (props as ReturnType<typeof allVideos>[number] | undefined)?.media;
  if (!video) return new Response('not found', { status: 404 });
  return videoResponse(video, request.headers.get('range'));
};
