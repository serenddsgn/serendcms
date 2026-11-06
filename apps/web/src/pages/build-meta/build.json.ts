import type { APIRoute } from 'astro';
import { data, loadData } from '../../lib/data';

export const GET: APIRoute = async () => {
  await loadData();
  return new Response(
    JSON.stringify({ builtAt: new Date().toISOString(), manifest: data().manifest }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
};
