import type { APIRoute } from 'astro';
import { data, loadData } from '../../lib/data';

/**
 * Deutsch liegt ohne Präfix im Wurzelverzeichnis. Redirects, die vor der Umstellung als `/de/…` gespeichert wurden,
 * zeigen direkt auf die neue Adresse (keine Kette über die allgemeine 301 von `/de/…`).
 */
const noDePrefix = (p: string) => (p === '/de' ? '/' : p.startsWith('/de/') ? p.slice(3) : p);

/** Redirect-Datei für Caddy (`import`); wird nicht öffentlich ausgeliefert. Beide Schreibweisen (mit/ohne Slash). */
export const GET: APIRoute = async () => {
  await loadData();
  const slash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  const lines = data().redirects.flatMap((r) => {
    const from = noDePrefix(r.fromPath);
    const to = slash(noDePrefix(r.toPath));
    // Die Quelle `/de/…` fängt ohnehin die allgemeine 301 ab; nur Quellen mit eigenem Ziel brauchen eine Zeile.
    if (r.fromPath.startsWith('/de/') && from === to) return [];
    return [`redir ${from} ${to} 301`, `redir ${slash(from)} ${to} 301`];
  });
  return new Response(`${lines.join('\n')}${lines.length ? '\n' : ''}`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
