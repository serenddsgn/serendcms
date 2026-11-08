/** Schmaler API-Client: gleiche Domain (kein CORS), Session-Cookie, CSRF-Header bei schreibenden Requests. */
let csrfToken = '';
export const setCsrf = (t: string) => void (csrfToken = t);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  form?: FormData,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Fehler ${res.status}`);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: File) => {
    const f = new FormData();
    f.append('file', file);
    return request<T>('POST', path, undefined, f);
  },
};

export const fileUrl = (id: string) => `${BASE}/media/${id}/file`;
export const thumbUrl = (id: string, w = 320) => `${BASE}/media/${id}/thumb?w=${w}`;
