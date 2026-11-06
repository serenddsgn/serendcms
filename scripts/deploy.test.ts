import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const keys = (text: string) =>
  new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));

describe('Deploy-Dateien', () => {
  const scripts = readdirSync(join(ROOT, 'deploy')).filter((f) => f.endsWith('.sh'));

  it('hat syntaktisch gültige, ausführbare Shell-Skripte mit strengem Modus', () => {
    expect(scripts.sort()).toEqual([
      'backup.sh',
      'deploy-remote.sh',
      'deploy.sh',
      'restore.sh',
      'server-setup.sh',
    ]);
    for (const s of scripts) {
      execFileSync('bash', ['-n', join(ROOT, 'deploy', s)]);
      expect(read(`deploy/${s}`), s).toMatch(/set -E?e?u?o? ?pipefail|set -Eeuo pipefail/);
    }
  });

  it('bietet `pnpm run deploy` und `deploy:remote` (nicht den eingebauten `pnpm deploy`)', () => {
    const pkg = JSON.parse(read('package.json')).scripts;
    expect(pkg.deploy).toBe('bash deploy/deploy.sh');
    expect(pkg['deploy:remote']).toBe('bash deploy/deploy-remote.sh');
    expect(read('deploy/deploy-remote.sh')).toContain('pnpm run deploy');
  });

  it('führt die sieben Deploy-Schritte in der vorgegebenen Reihenfolge aus', () => {
    const d = read('deploy/deploy.sh');
    const order = [
      'git fetch',
      'pnpm install --frozen-lockfile',
      'pg_dump',
      'pnpm db:migrate',
      '@serend/admin build',
      'systemctl restart',
      'HEALTH_URL',
      'request-build',
    ];
    let at = -1;
    for (const marker of order) {
      const i = d.indexOf(marker, at + 1);
      expect(i, marker).toBeGreaterThan(at);
      at = i;
    }
    expect(d).toContain('trap fail ERR');
    expect(d).toContain('flock');
  });

  it('beschränkt sudo auf wenige systemctl-Befehle und ruft sie einzeln auf', () => {
    const sudoers = read('deploy/sudoers.d/serend');
    expect(sudoers).not.toMatch(/ALL=\(root\) NOPASSWD: ALL/);
    expect(sudoers).toContain('/usr/bin/systemctl reload caddy');
    expect(read('deploy/deploy.sh')).toMatch(
      /for unit in serend-api serend-worker serend-preview; do\s+sudo -n \/usr\/bin\/systemctl restart "\$unit"/,
    );
  });
});

describe('systemd-Units', () => {
  for (const unit of ['serend-api', 'serend-worker', 'serend-preview']) {
    it(`${unit}: eigener Benutzer ohne Root, EnvironmentFile und Härtung`, () => {
      const u = read(`deploy/systemd/${unit}.service`);
      expect(u).toContain('User=serend');
      expect(u).toMatch(/EnvironmentFile=\/etc\/serendportfolio\/(serendportfolio|preview)\.env/);
      for (const h of [
        'NoNewPrivileges=yes',
        'ProtectSystem=strict',
        'ProtectHome=yes',
        'PrivateTmp=yes',
      ])
        expect(u).toContain(h);
      expect(u).not.toMatch(/^User=root/m);
      expect(u).not.toMatch(/Environment=.*(SECRET|TOKEN|PASSWORD|KEY)=/);
    });
  }

  it('gibt der Vorschau eine eigene Env-Datei ohne Secrets', () => {
    expect(read('deploy/systemd/serend-preview.service')).toContain(
      'EnvironmentFile=/etc/serendportfolio/preview.env',
    );
    const preview = keys(read('deploy/preview.env.example'));
    for (const secret of [
      'SESSION_SECRET',
      'BUILD_TOKEN',
      'PREVIEW_SIGNING_KEY',
      'DATABASE_URL',
      'SMTP_PASSWORD',
    ])
      expect(preview.has(secret), secret).toBe(false);
  });
});

describe('Caddyfile', () => {
  const caddy = read('deploy/Caddyfile');

  it('setzt die geforderten Security-Header', () => {
    for (const h of [
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(caddy, h).toContain(h);
    }
    expect(caddy).not.toMatch(/script-src[^;"]*'unsafe-inline'/);
  });

  it('liefert nichts Internes aus und leitet nur lokal weiter', () => {
    expect(caddy).toMatch(
      /@internal path \/build-meta\/\* \/internal\/\* \/api\/v1\/\*\s+respond @internal 404/,
    );
    expect(caddy).toMatch(/@internal path \/internal\/\*\s+respond @internal 404/);
    const upstreams = [...caddy.matchAll(/reverse_proxy (\S+)/g)].map((m) => m[1]);
    expect(upstreams.length).toBeGreaterThan(0);
    for (const u of upstreams) expect(u).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(caddy).toContain('rewrite * /api/v1/public/contact');
  });

  it('schreibt das Vorschau-Token nie ins Log und sendet noindex', () => {
    const preview = caddy.slice(caddy.indexOf('preview.{$DOMAIN}'));
    expect(preview).toMatch(/query \{\s+delete preview\s+\}/);
    expect(preview).toContain('X-Robots-Tag "noindex, nofollow"');
    expect(preview).toContain('Referrer-Policy "no-referrer"');
  });
});

describe('Server-Einrichtung', () => {
  const setup = read('deploy/server-setup.sh');

  it('öffnet nur 22, 80 und 443 und härtet SSH', () => {
    const allowed = [...setup.matchAll(/ufw allow (\d+)\/tcp/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual(['22', '443', '80']);
    expect(setup).toContain('ufw default deny incoming');
    for (const s of ['PermitRootLogin no', 'PasswordAuthentication no']) expect(setup).toContain(s);
    // nie härten, ohne dass ein Schlüssel vorhanden ist
    expect(setup.indexOf('Kein SSH-Schlüssel')).toBeLessThan(setup.indexOf('sshd_config.d'));
  });

  it('bindet PostgreSQL nur an localhost, legt die Env-Datei mit Rechten 600 an und erzeugt Secrets zufällig', () => {
    expect(setup).toContain("listen_addresses = 'localhost'");
    expect(setup).toMatch(/chmod 600 "\$CONF_DIR\/serendportfolio\.env"/);
    expect(setup).toContain('openssl rand -base64 48');
    expect(setup).toContain('Write access NICHT ankreuzen');
  });

  it('enthält keine echten Secrets, Schlüssel oder Passwörter', () => {
    for (const f of readdirSync(join(ROOT, 'deploy'), { recursive: true }).map(String)) {
      if (!/\.(sh|service|timer|example)$|Caddyfile|serend$/.test(f)) continue;
      const text = read(`deploy/${f}`);
      expect(text, f).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(text, f).not.toMatch(/(?:SECRET|TOKEN|PASSWORD|SIGNING_KEY)=[A-Za-z0-9+/_-]{24,}/);
    }
  });
});

describe('Konfigurationsvorlagen', () => {
  const prod = keys(read('deploy/env.production.example'));
  const dev = keys(read('.env.example'));

  it('decken alle Pflichtvariablen von API und Worker ab', () => {
    const required = [
      'DATABASE_URL',
      'ADMIN_ORIGIN',
      'SESSION_SECRET',
      'BUILD_TOKEN',
      'PREVIEW_SIGNING_KEY',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_FROM',
      'SITE_URL',
      'RELEASES_DIR',
    ];
    for (const k of required) {
      expect(prod.has(k), `prod ${k}`).toBe(true);
      expect(dev.has(k), `dev ${k}`).toBe(true);
    }
  });

  it('setzen in Produktion sichere Voreinstellungen und enthalten keine echten Secrets', () => {
    const p = read('deploy/env.production.example');
    expect(p).toMatch(/^COOKIE_SECURE=true$/m);
    expect(p).toMatch(/^DOCS_ENABLED=false$/m);
    expect(p).toMatch(/^API_HOST=127\.0\.0\.1$/m);
    expect(p).toMatch(/^SESSION_SECRET=__GENERATE__$/m);
    expect(read('.env.example')).toMatch(/^SESSION_SECRET=\s*(#.*)?$/m);
  });

  it('halten .env-Dateien aus dem Repository', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
    expect(
      tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')),
    ).toEqual([]);
    expect(read('.gitignore')).toMatch(/^\.env$/m);
  });
});
