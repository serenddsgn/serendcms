import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Secret = z.string().min(43, 'mindestens 43 Zeichen (32 Byte Zufall)');
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  DATABASE_URL: z.string().min(1),
  BUILD_TOKEN: Secret,
  API_URL: z.url().default('http://127.0.0.1:4000'),
  SITE_URL: z.url(),
  RELEASES_DIR: z.string().min(1),
  ASSET_CACHE_DIR: z.string().min(1).optional(),
  REPO_DIR: z.string().min(1).optional(),
  BUILD_TMP_DIR: z.string().min(1).optional(),
  KEEP_RELEASES: z.coerce.number().int().min(2).max(100).default(10),
  BUILD_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .default(15 * 60 * 1000),
  BUILD_CHECK_LIGHTHOUSE: z.stringbool().default(true),
  LIGHTHOUSE_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(95),
  CADDY_RELOAD_COMMAND: z.string().optional(),
});

export interface WorkerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  buildToken: string;
  apiUrl: string;
  siteUrl: string;
  releasesDir: string;
  assetCacheDir: string;
  repoDir: string;
  /** Arbeitsverzeichnis des Astro-Builds; muss auf demselben Dateisystem wie apps/web/.astro liegen (Astro verschiebt Dateien per rename). */
  buildTmpDir: string;
  keepReleases: number;
  buildTimeoutMs: number;
  lighthouse: { enabled: boolean; minScore: number };
  caddyReloadCommand: string | undefined;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Ungültige Worker-Konfiguration:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadWorkerConfig(env: Record<string, string | undefined>): WorkerConfig {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = Env.safeParse(cleaned);
  if (!parsed.success)
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const e = parsed.data;
  const releasesDir = resolve(e.RELEASES_DIR);
  const repoDir = resolve(e.REPO_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../../..'));
  return {
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    buildToken: e.BUILD_TOKEN,
    apiUrl: e.API_URL.replace(/\/$/, ''),
    siteUrl: e.SITE_URL.replace(/\/$/, ''),
    releasesDir,
    assetCacheDir: resolve(e.ASSET_CACHE_DIR ?? join(releasesDir, '.cache')),
    repoDir,
    buildTmpDir: resolve(e.BUILD_TMP_DIR ?? join(repoDir, 'apps/web/.build-tmp')),
    keepReleases: e.KEEP_RELEASES,
    buildTimeoutMs: e.BUILD_TIMEOUT_MS,
    lighthouse: { enabled: e.BUILD_CHECK_LIGHTHOUSE, minScore: e.LIGHTHOUSE_MIN_SCORE },
    caddyReloadCommand: e.CADDY_RELOAD_COMMAND,
  };
}
