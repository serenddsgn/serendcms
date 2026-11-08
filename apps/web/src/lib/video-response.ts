import type { BuildMedia } from '@serend/schema';
import { readOriginal } from './data';

/** Liefert eine Videodatei, mit Range-Unterstützung (Safari lädt Videos nur so). */
export async function videoResponse(
  media: BuildMedia,
  rangeHeader: string | null,
): Promise<Response> {
  const body = await readOriginal(media);
  const headers: Record<string, string> = {
    'content-type': media.mime,
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
  if (range && (range[1] || range[2])) {
    const total = body.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start > end || start >= total) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
    }
    return new Response(new Uint8Array(body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${start}-${end}/${total}` },
    });
  }
  return new Response(new Uint8Array(body), { headers });
}
