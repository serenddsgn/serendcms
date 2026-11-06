import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

/** Die Produktionsvorlage muss durch die echte Konfigurationsvalidierung von API (und Worker) kommen, wie server-setup.sh sie füllt. */
const template = readFileSync(
  new URL('../../../deploy/env.production.example', import.meta.url),
  'utf8',
);
const fill = () =>
  template
    .replaceAll('__GENERATE__', '@@')
    .split('\n')
    .map((l) =>
      l.endsWith('=@@') ? `${l.slice(0, -2)}${randomBytes(48).toString('base64url')}` : l,
    )
    .join('\n');
const parse = (text: string) =>
  Object.fromEntries(
    text
      .split('\n')
      .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );

describe('deploy/env.production.example', () => {
  it('besteht die Konfigurationsvalidierung der API in Produktion', () => {
    const cfg = loadConfig(parse(fill()));
    expect(cfg.nodeEnv).toBe('production');
    expect(cfg.cookieSecure).toBe(true);
    expect(cfg.docsEnabled).toBe(false);
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.maintenance.dir).toBe('/var/lib/serendportfolio/maintenance');
    expect(cfg.caddyReloadCommand).toMatch(/^\/usr\/bin\/caddy reload/);
  });

  it('legt den Deploy-Ordner ohne DEPLOY_DIR neben den Releases ab (dort wartet serend-deploy.path)', () => {
    const env = parse(fill());
    delete env.DEPLOY_DIR;
    expect(loadConfig(env).deploy.dir).toBe('/var/lib/serendportfolio/deploy');
    expect(loadConfig({ ...env, DEPLOY_DIR: '/tmp/x' }).deploy.dir).toBe('/tmp/x');
  });

  it('verwendet für die Datenbank den Unix-Socket und enthält kein Passwort', () => {
    expect(parse(fill()).DATABASE_URL).toBe('postgres:///serendportfolio?host=/var/run/postgresql');
  });
});
