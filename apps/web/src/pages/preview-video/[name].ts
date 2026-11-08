import type { APIRoute, GetStaticPaths } from 'astro';
import { findVideo } from '../../lib/images';
import { videoResponse } from '../../lib/video-response';

/** Nur für die SSR-Vorschau (endungslose Video-URLs). Im statischen Build entstehen hier keine Dateien. */
export const getStaticPaths = (() => []) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params, request }) => {
  const video = findVideo(params.name ?? '');
  if (!video) return new Response('not found', { status: 404 });
  return videoResponse(video, request.headers.get('range'));
};
