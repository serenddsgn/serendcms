import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lighthouse.js', () => ({ checkLighthouse: vi.fn() }));
import { checkLighthouse } from '../src/lighthouse.js';
import { runChecks } from '../src/run-checks.js';

const dirs: string[] = [];
function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'serend-checks-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
beforeEach(() => {
  // Block statt Ausdruck: eine von beforeEach zurückgegebene Funktion würde Vitest als Aufräumfunktion aufrufen
  vi.mocked(checkLighthouse).mockReset();
});

const page = (body: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>T</title></head><body>${body}</body></html>`;
const opts = { lighthousePaths: ['/de/projekte/dolce-falcone/'], lighthouseMinScore: 95 };

describe('Lighthouse ist eine Warnung, nie ein Grund, nicht zu bauen', () => {
  it('ein Wert unter dem Ziel bleibt „bestanden“ und wird als Warnung mit Pfad gemeldet', async () => {
    vi.mocked(checkLighthouse).mockResolvedValue({
      minScore: 95,
      pages: [{ url: '/de/projekte/dolce-falcone/', performance: 91 }],
      failed: [{ url: '/de/projekte/dolce-falcone/', performance: 91 }],
    });
    const dir = site({ 'de/index.html': page('<p>ok</p>') });
    const r = await runChecks(dir, opts);
    expect(r.passed).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([
      {
        code: 'lighthouse',
        path: '/de/projekte/dolce-falcone/',
        message: 'Performance 91 (Ziel 95) auf /de/projekte/dolce-falcone/',
      },
    ]);
  });

  it('stürzt Lighthouse selbst ab (z. B. kein Browser), bleibt der Build möglich', async () => {
    vi.mocked(checkLighthouse).mockImplementation(async () => {
      throw new Error('browserType.launch: kein Chromium\nCall log: …');
    });
    const dir = site({ 'de/index.html': page('<p>ok</p>') });
    const r = await runChecks(dir, opts);
    expect(r.passed).toBe(true);
    expect(r.warnings).toEqual([
      {
        code: 'lighthouse_error',
        path: null,
        message: 'Lighthouse konnte nicht ausgeführt werden: browserType.launch: kein Chromium',
      },
    ]);
  });

  it('echte Fehler (kaputter Link) blockieren weiterhin, auch neben einer Warnung', async () => {
    vi.mocked(checkLighthouse).mockResolvedValue({
      minScore: 95,
      pages: [],
      failed: [{ url: '/de/', performance: 80 }],
    });
    const dir = site({ 'de/index.html': page('<a href="/de/gibt-es-nicht/">x</a>') });
    const r = await runChecks(dir, opts);
    expect(r.passed).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toContain('Kaputter Link');
    expect(r.warnings).toHaveLength(1);
  });

  it('überspringt Lighthouse, wenn es ausgeschaltet ist', async () => {
    const dir = site({ 'de/index.html': page('<p>ok</p>') });
    const r = await runChecks(dir, { ...opts, lighthouse: false });
    expect(checkLighthouse).not.toHaveBeenCalled();
    expect(r).toMatchObject({ passed: true, warnings: [], lighthouse: { skipped: true } });
  });
});
