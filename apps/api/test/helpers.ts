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
    argon2: { memoryCost: 1024, timeCost: 1, parallelism: 1 }, // nur für Tests billig
    rateLimit: { loginMax: 1000, loginWindowMs: 60_000 },
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

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
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
  const app = await buildApp({ config, db: handle.db, logStream });
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
