/**
 * Vorschau-Modus (PREVIEW_MODE=1, SSR): signiertes Token aus `?preview=` in ein HttpOnly-Cookie tauschen und per
 * Redirect aus der URL entfernen (das Token landet so nie in Logs oder im Referrer). Jede Anfrage rendert mit dem
 * Datenpaket, das die API für dieses Token liefert. Im statischen Build ist die Middleware ohne Wirkung.
 */
import { defineMiddleware } from 'astro:middleware';
import { PREVIEW_MODE, PreviewDeniedError, loadPreviewData, runWithData } from './lib/data';

const COOKIE = 'preview_token';
const HEADERS: Record<string, string> = {
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const withHeaders = (res: Response): Response => {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
};
const denied = () =>
  withHeaders(
    new Response(
      'Dieser Vorschau-Link ist ungültig oder abgelaufen. / This preview link is invalid or has expired.',
      {
        status: 403,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        },
      },
    ),
  );

export const onRequest = defineMiddleware(async (context, next) => {
  if (!PREVIEW_MODE) return next();
  const url = new URL(context.request.url);
  const secure =
    (context.request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')) === 'https';

  const fromQuery = url.searchParams.get('preview');
  if (fromQuery) {
    url.searchParams.delete('preview');
    return withHeaders(
      new Response(null, {
        status: 302,
        headers: {
          location: `${url.pathname}${url.search}`,
          'set-cookie': `${COOKIE}=${fromQuery}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
        },
      }),
    );
  }

  const token = context.cookies.get(COOKIE)?.value;
  if (!token) return denied();
  let data;
  try {
    data = await loadPreviewData(token);
  } catch (err) {
    if (err instanceof PreviewDeniedError) return denied();
    throw err;
  }
  context.locals.preview = true;
  return withHeaders(await runWithData(data, () => next()));
});
