import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error reines JS-Modul ohne Typen
import { collectSecretValues, scanDirs } from './check-no-secrets.mjs';

const dirs: string[] = [];
function outputWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'secretscan-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const env = {
  SESSION_SECRET: 'sehr-geheimer-session-wert-12345',
  DATABASE_URL: 'postgres://u:dbpasswort99@127.0.0.1/x',
};

describe('check-no-secrets', () => {
  it('findet Secret-Werte im Build-Output, ohne sie auszugeben', () => {
    const dir = outputWith({ 'assets/app.js': 'const k="sehr-geheimer-session-wert-12345";' });
    const f = scanDirs([dir], collectSecretValues(env));
    expect(f).toHaveLength(1);
    expect(JSON.stringify(f)).not.toContain('sehr-geheimer-session-wert-12345');
  });

  it('findet das Datenbank-Passwort aus DATABASE_URL', () => {
    const dir = outputWith({ 'a.html': 'x dbpasswort99 y' });
    expect(scanDirs([dir], collectSecretValues(env))).toHaveLength(1);
  });

  it('erkennt typische Muster auch ohne bekannte Werte', () => {
    const dir = outputWith({ 'a.js': 'fetch("postgres://admin:hunter2hunter2@db/x")' });
    expect(scanDirs([dir], [])).toHaveLength(1);
  });

  it('meldet nichts bei sauberem Output', () => {
    const dir = outputWith({ 'index.html': '<h1>Hallo</h1>', 'assets/a.js': 'console.log(1)' });
    expect(scanDirs([dir], collectSecretValues(env))).toEqual([]);
  });
});
