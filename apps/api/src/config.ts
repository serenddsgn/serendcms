import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  host: string;
  port: number;
  databaseUrl: string;
  adminOrigin: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  docsEnabled: boolean;
  sessionTtlHours: number;
  sessionSecret: string;
  buildToken: string;
  previewSigningKey: string;
  /** Schlüssel, mit dem Zugangsdaten externer Dienste in der Datenbank verschlüsselt werden (fehlt: Eingabe im Admin gesperrt). */
  secretsKey: string | undefined;
  /** Anthropic-Key aus der Umgebung; hat Vorrang vor dem im Admin hinterlegten. */
  anthropicApiKey: string | undefined;
  smtp: {
    host: string;
    port: number;
    user: string | undefined;
    password: string | undefined;
    from: string;
  };
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  media: { storageDir: string; maxBytes: number; videoMaxBytes: number };
  siteOrigin: string;
  previewUrl: string;
  contact: { notifyTo: string | undefined; retentionDays: number };
  maintenance: { dir: string; fontsDir: string };
  releasesDir: string;
  /** Code-Deployment aus dem Admin: Anfrage-/Status-Dateien und der git-Checkout des Servers. */
  deploy: { dir: string; repoDir: string; branch: string };
  caddyReloadCommand: string | undefined;
  rateLimit: {
    loginMax: number;
    loginWindowMs: number;
    contactMax: number;
    contactWindowMs: number;
  };
}

/** Mindestens 32 Byte Zufall, base64url/hex-kodiert ≥ 43 Zeichen. */
const Secret = z
  .string()
  .min(43, 'mindestens 43 Zeichen (32 Byte Zufall, z. B. openssl rand -base64 48)');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  ADMIN_ORIGIN: z.url(),
  COOKIE_SECURE: z.stringbool().optional(),
  TRUST_PROXY: z.stringbool().default(false),
  DOCS_ENABLED: z.stringbool().optional(),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(168),
  /** Fehlversuche/Anmeldungen je IP und 15 Minuten; nur die E2E-Umgebung setzt das höher. */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(5),
  SESSION_SECRET: Secret,
  BUILD_TOKEN: Secret,
  PREVIEW_SIGNING_KEY: Secret,
  SECRETS_ENCRYPTION_KEY: Secret.optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(3),
  STORAGE_DIR: z.string().min(1).default('.data/media'),
  SITE_URL: z.url().default('http://localhost:4321'),
  PREVIEW_URL: z.url().default('http://localhost:4323'),
  CONTACT_NOTIFY_TO: z.email().optional(),
  CONTACT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  MAINTENANCE_DIR: z.string().min(1).default('.data/maintenance'),
  RELEASES_DIR: z.string().min(1).default('.data/releases'),
  DEPLOY_DIR: z.string().min(1).optional(),
  DEPLOY_REPO_DIR: z.string().min(1).optional(),
  DEPLOY_BRANCH: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/)
    .default('main'),
  CADDY_RELOAD_COMMAND: z.string().optional(),
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .default(15 * 1024 * 1024),
  MEDIA_VIDEO_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(500 * 1024 * 1024)
    .default(60 * 1024 * 1024),
});

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Ungültige Konfiguration:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Validiert die Umgebung beim Start. Fehlt etwas oder ist es ungültig, wird eine
 * ConfigError mit Variablennamen geworfen. Werte werden nie in Meldungen aufgenommen.
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  // Leere Strings (z. B. `SMTP_USER=` in .env) gelten als nicht gesetzt.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      problems.push(`${issue.path.join('.') || '(env)'}: ${issue.message}`);
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  const cookieSecure = e.COOKIE_SECURE ?? production;
  const docsEnabled = e.DOCS_ENABLED ?? !production;

  if (production) {
    if (!cookieSecure) problems.push('COOKIE_SECURE: in Produktion muss true gesetzt sein');
    if (docsEnabled) problems.push('DOCS_ENABLED: in Produktion muss false gesetzt sein');
    if (!LOOPBACK.has(e.API_HOST)) problems.push('API_HOST: in Produktion nur localhost erlaubt');
    if (!e.ADMIN_ORIGIN.startsWith('https://'))
      problems.push('ADMIN_ORIGIN: in Produktion muss https:// sein');
  }
  const secrets = [
    e.SESSION_SECRET,
    e.BUILD_TOKEN,
    e.PREVIEW_SIGNING_KEY,
    ...(e.SECRETS_ENCRYPTION_KEY ? [e.SECRETS_ENCRYPTION_KEY] : []),
  ];
  if (new Set(secrets).size !== secrets.length) {
    problems.push(
      'SESSION_SECRET, BUILD_TOKEN, PREVIEW_SIGNING_KEY und SECRETS_ENCRYPTION_KEY müssen voneinander verschieden sein',
    );
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    host: e.API_HOST,
    port: e.API_PORT,
    databaseUrl: e.DATABASE_URL,
    adminOrigin: new URL(e.ADMIN_ORIGIN).origin,
    cookieSecure,
    trustProxy: e.TRUST_PROXY,
    docsEnabled,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    sessionSecret: e.SESSION_SECRET,
    buildToken: e.BUILD_TOKEN,
    previewSigningKey: e.PREVIEW_SIGNING_KEY,
    secretsKey: e.SECRETS_ENCRYPTION_KEY,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.SMTP_FROM,
    },
    // OWASP-Empfehlung für argon2id: 19 MiB, t=2, p=1
    siteOrigin: new URL(e.SITE_URL).origin,
    previewUrl: e.PREVIEW_URL.replace(/\/$/, ''),
    contact: { notifyTo: e.CONTACT_NOTIFY_TO, retentionDays: e.CONTACT_RETENTION_DAYS },
    maintenance: {
      dir: resolve(e.MAINTENANCE_DIR),
      fontsDir: fileURLToPath(new URL('../../web/public/fonts', import.meta.url)),
    },
    releasesDir: resolve(e.RELEASES_DIR),
    deploy: {
      // Ohne Angabe neben dem Releases-Ordner (Produktion: /var/lib/serendportfolio/deploy, dort wartet serend-deploy.path;
      // lokal: .data/deploy). So braucht der Server keine zusätzliche Zeile in der Env-Datei.
      dir: resolve(e.DEPLOY_DIR ?? join(dirname(resolve(e.RELEASES_DIR)), 'deploy')),
      // Standard: das Repository, in dem diese API liegt (apps/api/src/config.ts → drei Ebenen hoch)
      repoDir: resolve(e.DEPLOY_REPO_DIR ?? fileURLToPath(new URL('../../..', import.meta.url))),
      branch: e.DEPLOY_BRANCH,
    },
    caddyReloadCommand: e.CADDY_RELOAD_COMMAND,
    media: {
      storageDir: resolve(e.STORAGE_DIR),
      maxBytes: e.MEDIA_MAX_BYTES,
      videoMaxBytes: e.MEDIA_VIDEO_MAX_BYTES,
    },
    argon2: { memoryCost: 19456, timeCost: 2, parallelism: 1 },
    rateLimit: {
      loginMax: e.LOGIN_RATE_LIMIT_MAX,
      loginWindowMs: 15 * 60 * 1000,
      contactMax: 5,
      contactWindowMs: 60 * 60 * 1000,
    },
  };
}
