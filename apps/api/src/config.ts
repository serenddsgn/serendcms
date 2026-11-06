import { resolve } from 'node:path';
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
  smtp: {
    host: string;
    port: number;
    user: string | undefined;
    password: string | undefined;
    from: string;
  };
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  media: { storageDir: string; maxBytes: number };
  releasesDir: string;
  caddyReloadCommand: string | undefined;
  rateLimit: { loginMax: number; loginWindowMs: number };
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
  SESSION_SECRET: Secret,
  BUILD_TOKEN: Secret,
  PREVIEW_SIGNING_KEY: Secret,
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(3),
  STORAGE_DIR: z.string().min(1).default('.data/media'),
  RELEASES_DIR: z.string().min(1).default('.data/releases'),
  CADDY_RELOAD_COMMAND: z.string().optional(),
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .default(15 * 1024 * 1024),
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
  const secrets = [e.SESSION_SECRET, e.BUILD_TOKEN, e.PREVIEW_SIGNING_KEY];
  if (new Set(secrets).size !== secrets.length) {
    problems.push(
      'SESSION_SECRET, BUILD_TOKEN und PREVIEW_SIGNING_KEY müssen voneinander verschieden sein',
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
    smtp: {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
      from: e.SMTP_FROM,
    },
    // OWASP-Empfehlung für argon2id: 19 MiB, t=2, p=1
    releasesDir: resolve(e.RELEASES_DIR),
    caddyReloadCommand: e.CADDY_RELOAD_COMMAND,
    media: { storageDir: resolve(e.STORAGE_DIR), maxBytes: e.MEDIA_MAX_BYTES },
    argon2: { memoryCost: 19456, timeCost: 2, parallelism: 1 },
    rateLimit: { loginMax: 5, loginWindowMs: 15 * 60 * 1000 },
  };
}
