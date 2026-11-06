import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const secret = (c: string) => c.repeat(48);
const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
  ADMIN_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: secret('a'),
  BUILD_TOKEN: secret('b'),
  PREVIEW_SIGNING_KEY: secret('c'),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'noreply@localhost',
};
const prod = {
  ...valid,
  NODE_ENV: 'production',
  ADMIN_ORIGIN: 'https://admin.example.com',
  COOKIE_SECURE: 'true',
  DOCS_ENABLED: 'false',
};

function problems(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as ConfigError).message;
  }
  throw new Error('expected ConfigError');
}

describe('Env-Validierung', () => {
  it('akzeptiert eine gültige Entwicklungskonfiguration', () => {
    const c = loadConfig(valid);
    expect(c.cookieSecure).toBe(false);
    expect(c.docsEnabled).toBe(true);
    expect(c.port).toBe(4000);
  });

  it('startet nicht, wenn ein Pflichtwert fehlt', () => {
    const { SESSION_SECRET: _omit, ...rest } = valid;
    expect(problems(rest)).toContain('SESSION_SECRET');
    expect(problems({ ...valid, DATABASE_URL: '' })).toContain('DATABASE_URL');
  });

  it('verlangt mindestens 32 Byte Zufall für Secrets', () => {
    expect(problems({ ...valid, BUILD_TOKEN: 'zu-kurz' })).toContain('BUILD_TOKEN');
  });

  it('verlangt unterschiedliche Secrets', () => {
    expect(problems({ ...valid, BUILD_TOKEN: valid.SESSION_SECRET })).toContain(
      'voneinander verschieden',
    );
  });

  it('nimmt nie Secret-Werte in Fehlermeldungen auf', () => {
    const msg = problems({ ...valid, BUILD_TOKEN: 'geheim-aber-zu-kurz', SESSION_SECRET: '' });
    expect(msg).not.toContain('geheim-aber-zu-kurz');
  });

  it('erzwingt in Produktion sichere Voreinstellungen', () => {
    expect(loadConfig(prod).cookieSecure).toBe(true);
    expect(problems({ ...prod, COOKIE_SECURE: 'false' })).toContain('COOKIE_SECURE');
    expect(problems({ ...prod, DOCS_ENABLED: 'true' })).toContain('DOCS_ENABLED');
    expect(problems({ ...prod, API_HOST: '0.0.0.0' })).toContain('API_HOST');
    expect(problems({ ...prod, ADMIN_ORIGIN: 'http://admin.example.com' })).toContain(
      'ADMIN_ORIGIN',
    );
  });

  it('behandelt leere Werte wie nicht gesetzt', () => {
    const c = loadConfig({ ...valid, SMTP_USER: '', SMTP_PASSWORD: '' });
    expect(c.smtp.user).toBeUndefined();
  });
});
