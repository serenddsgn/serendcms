import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { inject } from 'vitest';
import { createDb, type DbHandle } from '@serend/db';
import { createTestDatabase, type TestDatabase } from '@serend/db/testing';
import type { Role } from '@serend/schema';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { createPasswordHasher } from '../src/lib/password.js';
import { generateToken } from '../src/lib/tokens.js';
import { usersRepo } from '../src/repositories/users.repo.js';

export const ADMIN_ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct-horse-battery';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    logLevel: 'info',
    host: '127.0.0.1',
    port: 0,
    databaseUrl: 'unused',
    adminOrigin: ADMIN_ORIGIN,
    cookieSecure: false,
    trustProxy: false,
    docsEnabled: false,
    sessionTtlHours: 24,
    sessionSecret: generateToken(),
    buildToken: generateToken(),
    previewSigningKey: generateToken(),
    smtp: {
      host: '127.0.0.1',
      port: 1025,
      user: undefined,
      password: undefined,
      from: 'test@localhost',
    },
    siteOrigin: 'https://www.example.com',
    previewUrl: 'https://preview.example.com',
    contact: { notifyTo: 'inbox@example.com', retentionDays: 180 },
    releasesDir: mkdtempSync(join(tmpdir(), 'serend-releases-')),
    caddyReloadCommand: undefined,
    media: { storageDir: mkdtempSync(join(tmpdir(), 'serend-media-')), maxBytes: 1024 * 1024 },
    argon2: { memoryCost: 1024, timeCost: 1, parallelism: 1 }, // nur für Tests billig
    rateLimit: { loginMax: 1000, loginWindowMs: 60_000, contactMax: 1000, contactWindowMs: 60_000 },
    ...overrides,
  };
}

export const cheapHasher = createPasswordHasher({ memoryCost: 1024, timeCost: 1, parallelism: 1 });

export interface TestApp {
  app: FastifyInstance;
  handle: DbHandle;
  config: AppConfig;
  logs: string[];
  close(): Promise<void>;
}

export async function createTestApp(
  overrides: Partial<AppConfig> = {},
  extra: Pick<
    Parameters<typeof buildApp>[0],
    'onPublishedChange' | 'storage' | 'queue' | 'mailer'
  > = {},
): Promise<TestApp> {
  const database: TestDatabase = await createTestDatabase(inject('pgAdminUrl'));
  const handle = createDb(database.url, { max: 4 });
  const config = testConfig({ databaseUrl: database.url, ...overrides });
  const logs: string[] = [];
  const logStream = new Writable({
    write(chunk, _enc, cb) {
      logs.push(String(chunk));
      cb();
    },
  });
  const app = await buildApp({ config, db: handle.db, logStream, ...extra });
  return {
    app,
    handle,
    config,
    logs,
    async close() {
      await app.close();
      await handle.close();
      await database.drop();
    },
  };
}

export async function createUser(
  t: Pick<TestApp, 'handle'>,
  opts: { email?: string; role?: Role; password?: string; displayName?: string } = {},
) {
  const email =
    opts.email ??
    `${generateToken(6)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, 'x')}@example.com`;
  const row = await usersRepo(t.handle.db).insert({
    email,
    displayName: opts.displayName ?? 'Test User',
    role: opts.role ?? 'editor',
    passwordHash: await cheapHasher.hash(opts.password ?? PASSWORD),
  });
  return { ...row, plainPassword: opts.password ?? PASSWORD };
}

export interface Session {
  cookie: string;
  token: string;
  csrf: string;
  userId: string;
}

export async function login(
  t: Pick<TestApp, 'app' | 'config'>,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const c = res.cookies[0];
  if (!c) throw new Error('no cookie');
  const body = res.json<{ user: { id: string }; csrfToken: string }>();
  return {
    cookie: `${c.name}=${c.value}`,
    token: c.value,
    csrf: body.csrfToken,
    userId: body.user.id,
  };
}

export function as(
  t: Pick<TestApp, 'app'>,
  session: Session | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return t.app.inject({
    method,
    url,
    ...(payload !== undefined && { payload: payload as object }),
    headers: {
      ...(session && { cookie: session.cookie, 'x-csrf-token': session.csrf }),
      ...extraHeaders,
    },
  });
}

export function expectError(res: LightMyRequestResponse, status: number, code: string) {
  const body = res.json<{ error: { code: string; message: string } }>();
  if (res.statusCode !== status || body.error?.code !== code) {
    throw new Error(`expected ${status}/${code}, got ${res.statusCode} ${res.body}`);
  }
  if (
    Object.keys(body).join() !== 'error' ||
    Object.keys(body.error).sort().join() !== 'code,message'
  ) {
    throw new Error(`error format violated: ${res.body}`);
  }
}

// ── Medien- und Projekt-Helfer ───────────────────────────────────────
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export async function imageBuffer(
  format: 'jpeg' | 'png' | 'webp' | 'avif' = 'png',
  size = 64,
): Promise<Buffer> {
  const img = sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 120, b: 90 } },
  });
  return img[format]().toBuffer();
}

export function multipart(
  filename: string,
  contentType: string,
  data: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----serend${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export async function uploadImage(
  t: Pick<TestApp, 'app'>,
  session: Session,
  opts: { filename?: string; contentType?: string; data?: Buffer } = {},
) {
  const data = opts.data ?? (await imageBuffer('png'));
  const mp = multipart(opts.filename ?? 'bild.png', opts.contentType ?? 'image/png', data);
  return t.app.inject({
    method: 'POST',
    url: '/api/v1/media',
    payload: mp.payload,
    headers: { ...mp.headers, cookie: session.cookie, 'x-csrf-token': session.csrf },
  });
}

/** Lädt ein Bild hoch und setzt optional Alt-Texte; liefert die Media-ID. */
export async function createMedia(
  t: Pick<TestApp, 'app'>,
  session: Session,
  altText: Record<string, string> = { de: 'Alt DE', en: 'Alt EN' },
): Promise<string> {
  const res = await uploadImage(t, session);
  if (res.statusCode !== 201) throw new Error(`upload failed ${res.body}`);
  const id = res.json().media.id as string;
  if (Object.keys(altText).length > 0) {
    const p = await as(t, session, 'PATCH', `/api/v1/media/${id}`, { altText });
    if (p.statusCode !== 200) throw new Error(`alt patch failed ${p.body}`);
  }
  return id;
}

export function projectPayload(over: Record<string, unknown> = {}) {
  return {
    slug: `projekt-${randomUUID().slice(0, 8)}`,
    title: 'Testprojekt',
    year: 2026,
    categories: ['web'],
    color: '#ba1f2a',
    ...over,
  };
}

export async function createProject(
  t: Pick<TestApp, 'app'>,
  session: Session,
  over: Record<string, unknown> = {},
) {
  const res = await as(t, session, 'POST', '/api/v1/projects', projectPayload(over));
  if (res.statusCode !== 201)
    throw new Error(`create project failed ${res.statusCode} ${res.body}`);
  return res.json() as {
    project: {
      id: string;
      status: string;
      publishedRevisionId: string | null;
      translationGroupId: string;
    };
    latest: {
      id: string;
      revisionNo: number;
      slug: string;
      title: string;
      publishedAt: string | null;
    };
    published: { id: string; slug: string; title: string } | null;
    hasUnpublishedChanges: boolean;
  };
}

export function draftBody(
  detail: { latest: Record<string, unknown> },
  over: Record<string, unknown> = {},
) {
  const l = detail.latest;
  return {
    slug: l.slug,
    title: l.title,
    subtitle: l.subtitle,
    year: l.year,
    categories: l.categories,
    color: l.color,
    tileColor: l.tileColor,
    client: l.client,
    liveUrl: l.liveUrl,
    coverMediaId: l.coverMediaId,
    nextProjectId: l.nextProjectId,
    content: l.content,
    gallery: l.gallery,
    seoTitle: l.seoTitle,
    seoDescription: l.seoDescription,
    ogMediaId: l.ogMediaId,
    ...over,
  };
}

export async function editorSession(
  t: Pick<TestApp, 'app' | 'config' | 'handle'>,
  role: 'admin' | 'editor' = 'editor',
) {
  return login(t, (await createUser(t, { role })).email);
}
