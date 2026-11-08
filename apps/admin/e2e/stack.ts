/**
 * Wegwerf-Umgebung für die Playwright-Tests: eigener PostgreSQL-Cluster, migrierte Datenbank, API (Fastify) und
 * Admin (Vite mit Proxy auf die API, also gleiche Origin wie in Produktion). Wird beendet, sobald Playwright den Prozess stoppt.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, prepareTemplate, startTestCluster } from '@serend/db/testing';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
export const ADMIN_PORT = 5199;
export const API_PORT = 4199;
export const E2E_USER = { email: 'e2e-admin@example.com', password: 'e2e-passwort-12345' };

const secret = () => randomBytes(48).toString('base64url');
const cluster = await startTestCluster();
await prepareTemplate(cluster.adminUrl);
const database = await createTestDatabase(cluster.adminUrl);
const dir = mkdtempSync(join(tmpdir(), 'serend-e2e-'));

const env = {
  ...process.env,
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  DATABASE_URL: database.url,
  API_HOST: '127.0.0.1',
  API_PORT: String(API_PORT),
  ADMIN_ORIGIN: `http://127.0.0.1:${ADMIN_PORT}`,
  COOKIE_SECURE: 'false',
  SESSION_SECRET: secret(),
  BUILD_TOKEN: secret(),
  PREVIEW_SIGNING_KEY: secret(),
  SECRETS_ENCRYPTION_KEY: secret(),
  LOGIN_RATE_LIMIT_MAX: '1000', // mehrere Tests melden sich an
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'e2e@localhost',
  STORAGE_DIR: join(dir, 'media'),
  RELEASES_DIR: join(dir, 'releases'),
  MAINTENANCE_DIR: join(dir, 'maintenance'),
  SEED_ADMIN_EMAIL: E2E_USER.email,
  SEED_ADMIN_PASSWORD: E2E_USER.password,
  SEED_CONTENT: 'false',
};

const seed = spawnSync('pnpm', ['--filter', '@serend/api', 'seed'], {
  cwd: REPO,
  env,
  stdio: 'inherit',
});
if (seed.status !== 0) throw new Error('Seed fehlgeschlagen');

const children: ChildProcess[] = [
  spawn('pnpm', ['--filter', '@serend/api', 'exec', 'tsx', 'src/main.ts'], {
    cwd: REPO,
    env,
    stdio: 'inherit',
  }),
  spawn('pnpm', ['--filter', '@serend/admin', 'exec', 'vite'], {
    cwd: REPO,
    env: { ...env, ADMIN_PORT: String(ADMIN_PORT), ADMIN_API_URL: `http://127.0.0.1:${API_PORT}` },
    stdio: 'inherit',
  }),
];

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  await cluster.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
for (const c of children) c.on('exit', () => void shutdown());
