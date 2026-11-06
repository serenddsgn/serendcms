import type { APIRoute } from 'astro';
import { data, loadData } from '../../lib/data';

/** Redirect-Datei für Caddy (`import`); wird nicht öffentlich ausgeliefert. Beide Schreibweisen (mit/ohne Slash). */
export const GET: APIRoute = async () => {
  await loadData();
  const slash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  const lines = data().redirects.flatMap((r) => [
    `redir ${r.fromPath} ${slash(r.toPath)} 301`,
    `redir ${slash(r.fromPath)} ${slash(r.toPath)} 301`,
  ]);
  return new Response(`${lines.join('\n')}${lines.length ? '\n' : ''}`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
