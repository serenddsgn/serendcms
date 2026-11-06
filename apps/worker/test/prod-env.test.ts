import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';

describe('deploy/env.production.example für den Worker', () => {
  it('besteht die Worker-Validierung', () => {
    const text = readFileSync(
      new URL('../../../deploy/env.production.example', import.meta.url),
      'utf8',
    );
    const env = Object.fromEntries(
      text
        .split('\n')
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    for (const k of ['SESSION_SECRET', 'BUILD_TOKEN', 'PREVIEW_SIGNING_KEY'])
      env[k] = randomBytes(48).toString('base64url');
    const cfg = loadWorkerConfig(env);
    expect(cfg.releasesDir).toBe('/var/lib/serendportfolio/releases');
    expect(cfg.siteUrl).toBe('https://example.com');
    expect(cfg.lighthouse.enabled).toBe(true);
    // gleiches Dateisystem wie das Repository (Astro verschiebt Dateien per rename)
    expect(cfg.buildTmpDir.startsWith(cfg.repoDir)).toBe(true);
    expect(cfg.caddyReloadCommand).toMatch(/caddy reload/);
  });
});
