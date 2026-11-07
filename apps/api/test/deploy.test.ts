import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitRunner } from '../src/services/deploy.service.js';
import {
  as,
  createTestApp,
  editorSession,
  expectError,
  type Session,
  type TestApp,
} from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'serend-deploy-test-'));
const calls: string[][] = [];
let behind = 2;
let failFetch = false;
let localSha = 'aaaaaaa';

const git: GitRunner = async (args) => {
  calls.push(args);
  const [cmd] = args;
  if (cmd === 'fetch') {
    if (failFetch)
      throw Object.assign(new Error('x'), {
        stderr: 'git@github.com: Permission denied (publickey).\nfatal: weg\n',
      });
    return '';
  }
  if (cmd === 'rev-parse') return args.includes('HEAD') ? `${localSha}\n` : 'bbbbbbb\n';
  if (cmd === 'rev-list') return `${behind}\n`;
  if (cmd === 'log')
    return behind > 0
      ? 'bbbbbbb\t2026-11-06T10:00:00+01:00\tfeat: Modal\ncccccc1\t2026-11-05T09:00:00+01:00\tfix: Tab\there\n'
      : '';
  throw new Error(`unerwartet: ${args.join(' ')}`);
};

let t: TestApp;
let admin: Session;
let editor: Session;

beforeAll(async () => {
  t = await createTestApp({ deploy: { dir, repoDir: process.cwd(), branch: 'main' } }, { git });
  admin = await editorSession(t, 'admin');
  editor = await editorSession(t, 'editor');
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  calls.length = 0;
  behind = 2;
  failFetch = false;
  localSha = 'aaaaaaa';
  for (const f of ['request', 'status.json', 'deploy.log']) rmSync(join(dir, f), { force: true });
});

const check = () => as(t, admin, 'POST', '/api/v1/code/check');

describe('Code-Stand', () => {
  it('ist nur für Administratoren', async () => {
    for (const [m, u] of [
      ['GET', '/api/v1/code'],
      ['POST', '/api/v1/code/check'],
      ['POST', '/api/v1/code/deploy'],
    ] as const) {
      expectError(await as(t, null, m, u), 401, 'unauthenticated');
      expectError(await as(t, editor, m, u), 403, 'forbidden');
    }
    expect(existsSync(join(dir, 'request'))).toBe(false);
  });

  it('meldet neue Commits auf origin/main mit Betreff und Datum', async () => {
    const res = await check();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      branch: 'main',
      localSha: 'aaaaaaa',
      remoteSha: 'bbbbbbb',
      behind: 2,
      checkError: null,
      deploy: { state: 'idle', logTail: null },
    });
    expect(body.commits).toEqual([
      { sha: 'bbbbbbb', date: '2026-11-06T09:00:00.000Z', subject: 'feat: Modal' },
      { sha: 'cccccc1', date: '2026-11-05T08:00:00.000Z', subject: 'fix: Tab\there' },
    ]);
    expect(calls.find((c) => c[0] === 'fetch')).toEqual(['fetch', '--quiet', 'origin', 'main']);
  });

  it('meldet „aktuell“, wenn der Server nichts verpasst hat', async () => {
    behind = 0;
    expect((await check()).json()).toMatchObject({ behind: 0, commits: [] });
  });

  it('meldet einen fehlgeschlagenen Abruf mit der ersten Fehlerzeile statt abzubrechen', async () => {
    failFetch = true;
    const body = (await check()).json();
    expect(body.checkError).toBe(
      'origin/main konnte nicht abgerufen werden: git@github.com: Permission denied (publickey).',
    );
    expect(body).toMatchObject({ localSha: 'aaaaaaa', remoteSha: null, behind: 0 });
  });

  it('GET liefert das Ergebnis aus dem Zwischenspeicher, ohne bei jedem Aufruf zu fetchen', async () => {
    await check();
    calls.length = 0;
    const res = await as(t, admin, 'GET', '/api/v1/code');
    expect(res.json()).toMatchObject({ behind: 2, checkedAt: expect.any(String) });
    expect(calls.some((c) => c[0] === 'fetch')).toBe(false);
  });

  it('prüft neu, sobald der Checkout einen anderen Stand hat (nach einem Deployment)', async () => {
    await check();
    localSha = 'bbbbbbb';
    behind = 0;
    calls.length = 0;
    const first = (await as(t, admin, 'GET', '/api/v1/code')).json();
    expect(first.checkedAt).toBeNull(); // altes Ergebnis passt nicht mehr zum Checkout
    await vi.waitFor(() => expect(calls.some((c) => c[0] === 'fetch')).toBe(true));
    await vi.waitFor(async () =>
      expect((await as(t, admin, 'GET', '/api/v1/code')).json()).toMatchObject({
        localSha: 'bbbbbbb',
        behind: 0,
      }),
    );
  });
});

describe('Code-Deployment anfordern', () => {
  it('legt die Anfrage-Datei an und meldet „requested“', async () => {
    const res = await as(t, admin, 'POST', '/api/v1/code/deploy');
    expect(res.statusCode).toBe(202);
    expect(readFileSync(join(dir, 'request'), 'utf8')).toBe('ref=main\n');
    expect((await as(t, admin, 'GET', '/api/v1/code')).json().deploy).toMatchObject({
      state: 'requested',
      requestedAt: expect.any(String),
    });
  });

  it('lehnt eine zweite Anfrage ab, solange die erste wartet oder läuft', async () => {
    await as(t, admin, 'POST', '/api/v1/code/deploy');
    expectError(await as(t, admin, 'POST', '/api/v1/code/deploy'), 409, 'conflict');
    rmSync(join(dir, 'request'));
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({
        state: 'running',
        sha: '',
        startedAt: new Date().toISOString(),
        finishedAt: '',
      }),
    );
    expectError(await as(t, admin, 'POST', '/api/v1/code/deploy'), 409, 'conflict');
  });

  it('prüft während eines Deployments nicht per git fetch', async () => {
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({
        state: 'running',
        sha: '',
        startedAt: new Date().toISOString(),
        finishedAt: '',
      }),
    );
    writeFileSync(join(dir, 'deploy.log'), '→ Deployment gestartet\n→ 2/7 pnpm install\n');
    const res = await check();
    expect(res.json().deploy).toMatchObject({
      state: 'running',
      logTail: '→ Deployment gestartet\n→ 2/7 pnpm install',
    });
    expect(calls.some((c) => c[0] === 'fetch')).toBe(false);
  });

  it('zeigt Erfolg und Misserfolg des letzten Laufs; bei Misserfolg mit Log, und erlaubt ein neues Deployment', async () => {
    const base = {
      sha: 'bbbbbbb',
      startedAt: '2026-11-06T10:00:00Z',
      finishedAt: '2026-11-06T10:05:00Z',
    };
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ ...base, state: 'success' }));
    expect((await as(t, admin, 'GET', '/api/v1/code')).json().deploy).toMatchObject({
      state: 'success',
      sha: 'bbbbbbb',
      finishedAt: '2026-11-06T10:05:00.000Z',
      logTail: null,
    });
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ ...base, state: 'failed' }));
    writeFileSync(join(dir, 'deploy.log'), '✗ deploy.sh endete mit Code 3\n');
    expect((await as(t, admin, 'GET', '/api/v1/code')).json().deploy).toMatchObject({
      state: 'failed',
      logTail: '✗ deploy.sh endete mit Code 3',
    });
    expect((await as(t, admin, 'POST', '/api/v1/code/deploy')).statusCode).toBe(202);
  });

  it('wertet einen Lauf, der ewig „running“ meldet, als abgebrochen', async () => {
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({
        state: 'running',
        sha: '',
        startedAt: '2020-01-01T00:00:00Z',
        finishedAt: '',
      }),
    );
    expect((await as(t, admin, 'GET', '/api/v1/code')).json().deploy.state).toBe('failed');
    expect((await as(t, admin, 'POST', '/api/v1/code/deploy')).statusCode).toBe(202);
  });

  it('kürzt ein langes Log auf das Ende und schneidet keine halbe Zeile an', async () => {
    const lines = Array.from({ length: 800 }, (_, i) => `Zeile ${String(i).padStart(4, '0')}`);
    writeFileSync(join(dir, 'deploy.log'), `${lines.join('\n')}\n`);
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({
        state: 'failed',
        sha: '',
        startedAt: '2026-11-06T10:00:00Z',
        finishedAt: '2026-11-06T10:01:00Z',
      }),
    );
    const tail = (await as(t, admin, 'GET', '/api/v1/code')).json().deploy.logTail as string;
    expect(tail.length).toBeLessThanOrEqual(6000);
    expect(tail.endsWith('Zeile 0799')).toBe(true);
    expect(tail.split('\n')[0]).toMatch(/^Zeile \d{4}$/);
  });
});
