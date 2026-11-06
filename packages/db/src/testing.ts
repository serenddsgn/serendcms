/**
 * Test-Infrastruktur: echtes PostgreSQL für Vitest.
 *
 * Reihenfolge der Quellen:
 *   1. TEST_DATABASE_ADMIN_URL (vorhandener Server, Superuser)
 *   2. Testcontainers (Docker)
 *   3. temporärer lokaler Cluster aus einer PostgreSQL-18-Installation
 *      (initdb/pg_ctl via PG_BIN_DIR, PATH oder Homebrew/Debian-Standardpfade)
 * TEST_PG_MODE=docker|native erzwingt 2 bzw. 3.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

const TEMPLATE_DB = 'serend_template';

export interface TestCluster {
  /** Superuser-Verbindung zur Datenbank `postgres`. */
  adminUrl: string;
  stop(): Promise<void>;
}

function withDatabase(adminUrl: string, database: string): string {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  return u.toString();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function findPgBinDir(): string {
  const candidates = [
    process.env.PG_BIN_DIR,
    '/opt/homebrew/opt/postgresql@18/bin',
    '/usr/local/opt/postgresql@18/bin',
    '/usr/lib/postgresql/18/bin',
  ].filter((p): p is string => Boolean(p));
  const dir = candidates.find((d) => existsSync(join(d, 'initdb')));
  if (dir) return dir;
  try {
    const which = execFileSync('which', ['initdb'], { encoding: 'utf8' }).trim();
    if (which) return which.replace(/\/initdb$/, '');
  } catch {
    // weiter
  }
  throw new Error(
    'Kein PostgreSQL gefunden. Docker starten, PG_BIN_DIR auf ein PostgreSQL-18-bin setzen ' +
      'oder TEST_DATABASE_ADMIN_URL angeben.',
  );
}

async function startNativeCluster(): Promise<TestCluster> {
  const bin = findPgBinDir();
  const dir = mkdtempSync(join(tmpdir(), 'serend-pg-'));
  const port = await freePort();
  const pgCtl = join(bin, 'pg_ctl');
  // macOS: ohne gültiges Locale startet der Postmaster nicht (multithreaded during startup).
  const env = {
    ...process.env,
    LC_ALL: process.env.LC_ALL ?? (process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'),
  };
  execFileSync(
    join(bin, 'initdb'),
    ['-D', dir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C', '--no-sync'],
    { stdio: 'ignore', env },
  );
  execFileSync(
    pgCtl,
    [
      '-D',
      dir,
      '-w',
      '-l',
      join(dir, 'server.log'),
      '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c fsync=off ` +
        '-c synchronous_commit=off -c full_page_writes=off -c max_connections=200',
      'start',
    ],
    { stdio: 'ignore', env },
  );
  return {
    adminUrl: `postgres://postgres@127.0.0.1:${port}/postgres`,
    async stop() {
      try {
        execFileSync(pgCtl, ['-D', dir, '-m', 'immediate', 'stop'], { stdio: 'ignore', env });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

async function startDockerCluster(): Promise<TestCluster> {
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:18')
    .withUsername('postgres')
    .withPassword('postgres')
    .withDatabase('postgres')
    .withCommand(['-c', 'fsync=off', '-c', 'max_connections=200'])
    .start();
  return {
    adminUrl: container.getConnectionUri(),
    async stop() {
      await container.stop();
    },
  };
}

export async function startTestCluster(): Promise<TestCluster> {
  const external = process.env.TEST_DATABASE_ADMIN_URL;
  if (external) return { adminUrl: external, stop: async () => {} };

  const mode = process.env.TEST_PG_MODE;
  if (mode === 'native') return startNativeCluster();
  if (mode === 'docker') return startDockerCluster();
  try {
    return await startDockerCluster();
  } catch {
    return startNativeCluster();
  }
}

/** Legt die Template-Datenbank an und wendet alle Migrationen einmalig darauf an. */
export async function prepareTemplate(adminUrl: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB}`);
    await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  const handle = createDb(withDatabase(adminUrl, TEMPLATE_DB), { max: 1 });
  try {
    await runMigrations(handle.db);
  } finally {
    await handle.close();
  }
}

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/** Frische, vollständig migrierte Datenbank pro Testdatei (Kopie des Templates). */
export async function createTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  return {
    url: withDatabase(adminUrl, name),
    async drop() {
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try {
        await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await c.end();
      }
    },
  };
}

/** Für `globalSetup` in vitest.config: startet den Cluster und stellt die URL bereit. */
export async function setupTestCluster(project: TestProject): Promise<() => Promise<void>> {
  const cluster = await startTestCluster();
  await prepareTemplate(cluster.adminUrl);
  project.provide('pgAdminUrl', cluster.adminUrl);
  return () => cluster.stop();
}
