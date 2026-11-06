import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CodeStatusResponse } from '@serend/schema';
import type { AppConfig } from '../config.js';
import { errors } from '../lib/errors.js';

const execFileP = promisify(execFile);

/** Führt `git <args>` im Repository des Servers aus und gibt stdout zurück. */
export type GitRunner = (args: string[]) => Promise<string>;

/** Ein Lauf des Deploy-Dienstes, der länger als das hier läuft, gilt als abgebrochen (systemd TimeoutStartSec ist 30 min). */
const STALE_RUN_MS = 40 * 60 * 1000;
/** Wie lange ein Prüfergebnis (git fetch) gilt, bevor die Statusabfrage im Hintergrund neu prüft. */
const CHECK_TTL_MS = 5 * 60 * 1000;
const LOG_TAIL_BYTES = 6000;
const MAX_COMMITS = 20;

const FILES = {
  request: 'request', // vom Admin geschrieben; löst serend-deploy.path aus
  status: 'status.json', // vom Deploy-Dienst geschrieben
  log: 'deploy.log',
} as const;

type DeployInfo = CodeStatusResponse['deploy'];
type Commit = CodeStatusResponse['commits'][number];

interface Check {
  at: Date;
  localSha: string | null;
  remoteSha: string | null;
  behind: number;
  commits: Commit[];
  error: string | null;
}

export function defaultGit(repoDir: string): GitRunner {
  return async (args) => {
    const { stdout } = await execFileP('git', args, {
      cwd: repoDir,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10',
      },
    });
    return stdout;
  };
}

const iso = (d: Date) => d.toISOString();
const asIso = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : iso(d);
};
const asSha = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-f]{7,40}$/.test(v) ? v : null;
/** Erste Zeile, gekürzt: reicht für die Fehlersuche, ohne Pfade oder Schlüssel auszugeben. */
const firstLine = (s: string) =>
  s
    .split('\n')
    .find((l) => l.trim())
    ?.trim()
    .slice(0, 200) ?? '';

/**
 * Code-Deployment aus dem Admin. Die API darf weder `sudo` noch sich selbst neu starten (systemd-Härtung); deshalb schreibt sie
 * nur eine Anfrage-Datei. `serend-deploy.path` startet daraufhin `serend-deploy.service`, das `deploy/deploy.sh` ausführt und
 * Status und Log in dasselbe Verzeichnis schreibt. Die API liest nur `git` (Stand, Fetch) und diese Dateien.
 */
export function createDeployService({
  config,
  git,
  now = () => new Date(),
  log,
}: {
  config: Pick<AppConfig, 'deploy'>;
  git?: GitRunner | undefined;
  now?: () => Date;
  log?: { error: (obj: unknown, msg: string) => void };
}) {
  const { dir, repoDir, branch } = config.deploy;
  const run = git ?? defaultGit(repoDir);
  const remoteRef = `origin/${branch}`;
  let cache: Check | undefined;
  let inflight: Promise<Check> | undefined;

  async function localSha(): Promise<string | null> {
    try {
      return (await run(['rev-parse', '--short', 'HEAD'])).trim() || null;
    } catch {
      return null;
    }
  }

  async function refresh(): Promise<Check> {
    const at = now();
    try {
      await run(['fetch', '--quiet', 'origin', branch]);
      const [local, remote, behind, list] = await Promise.all([
        run(['rev-parse', '--short', 'HEAD']),
        run(['rev-parse', '--short', remoteRef]),
        run(['rev-list', '--count', `HEAD..${remoteRef}`]),
        run(['log', `-n${MAX_COMMITS}`, '--format=%h%x09%cI%x09%s', `HEAD..${remoteRef}`]),
      ]);
      const commits = list
        .split('\n')
        .filter(Boolean)
        .flatMap((line): Commit[] => {
          const [sha, date, ...subject] = line.split('\t');
          const d = asIso(date);
          return sha && d ? [{ sha, date: d, subject: subject.join('\t') }] : [];
        });
      return {
        at,
        localSha: local.trim() || null,
        remoteSha: remote.trim() || null,
        behind: Number.parseInt(behind.trim(), 10) || 0,
        commits,
        error: null,
      };
    } catch (err) {
      // stderr kann Pfade oder Hostnamen enthalten: ins Log nur die Fehlerart, an den Admin nur die erste Zeile
      log?.error(
        { errName: err instanceof Error ? err.name : 'Error' },
        'git fetch für den Code-Stand fehlgeschlagen',
      );
      const stderr = (err as { stderr?: unknown }).stderr;
      const detail = firstLine(typeof stderr === 'string' ? stderr : '');
      return {
        at,
        localSha: await localSha(),
        remoteSha: null,
        behind: 0,
        commits: [],
        error: `origin/${branch} konnte nicht abgerufen werden${detail ? `: ${detail}` : '.'}`,
      };
    }
  }

  /** Gleichzeitige Prüfungen teilen sich einen git fetch. */
  function check(): Promise<Check> {
    inflight ??= refresh()
      .then((c) => (cache = c))
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  }

  async function tail(): Promise<string | null> {
    try {
      const fh = await open(join(dir, FILES.log), 'r');
      try {
        const { size } = await fh.stat();
        const len = Math.min(size, LOG_TAIL_BYTES);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, size - len);
        const text = buf.toString('utf8');
        // Beim Kürzen kann die erste Zeile angeschnitten sein
        return (size > len ? text.slice(text.indexOf('\n') + 1) : text).trimEnd() || null;
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  }

  async function deployInfo(): Promise<DeployInfo> {
    const info: DeployInfo = {
      state: 'idle',
      requestedAt: null,
      startedAt: null,
      finishedAt: null,
      sha: null,
      logTail: null,
    };
    try {
      const raw = JSON.parse(await readFile(join(dir, FILES.status), 'utf8')) as Record<
        string,
        unknown
      >;
      info.startedAt = asIso(raw.startedAt);
      info.finishedAt = asIso(raw.finishedAt);
      info.sha = asSha(raw.sha);
      if (raw.state === 'running' || raw.state === 'success' || raw.state === 'failed')
        info.state = raw.state;
    } catch {
      /* noch kein Lauf oder Datei halb geschrieben: gilt als „idle“ */
    }
    if (info.state === 'running') {
      const started = info.startedAt ? +new Date(info.startedAt) : 0;
      // Der Dienst wurde beendet, ohne den Status abzuschließen (Neustart des Servers, kill)
      if (now().getTime() - started > STALE_RUN_MS) info.state = 'failed';
    }
    if (info.state !== 'running') {
      try {
        const st = await stat(join(dir, FILES.request));
        info.state = 'requested';
        info.requestedAt = iso(st.mtime);
      } catch {
        /* keine offene Anfrage */
      }
    }
    if (info.state === 'running' || info.state === 'failed') info.logTail = await tail();
    return info;
  }

  async function status(): Promise<CodeStatusResponse> {
    const deploy = await deployInfo();
    const busy = deploy.state === 'running' || deploy.state === 'requested';
    const local = await localSha();
    // Veraltetes oder zu einem anderen Checkout-Stand gehörendes Ergebnis im Hintergrund erneuern (nie während eines Deployments)
    const stale =
      !cache || now().getTime() - cache.at.getTime() > CHECK_TTL_MS || cache.localSha !== local;
    if (stale && !busy && !inflight) void check();
    const c = cache && cache.localSha === local ? cache : undefined;
    return {
      branch,
      localSha: local,
      remoteSha: c?.remoteSha ?? null,
      behind: c?.behind ?? 0,
      commits: c?.commits ?? [],
      checkedAt: c ? iso(c.at) : null,
      checkError: c?.error ?? null,
      deploy,
    };
  }

  return {
    status,

    /** Prüft jetzt (git fetch) und gibt den frischen Stand zurück. */
    async checkNow(): Promise<CodeStatusResponse> {
      const deploy = await deployInfo();
      if (deploy.state !== 'running' && deploy.state !== 'requested') await check();
      return status();
    },

    /** Legt die Anfrage ab; der Deploy-Dienst übernimmt (siehe deploy/deploy-run.sh). */
    async deploy(): Promise<void> {
      const { state } = await deployInfo();
      if (state === 'running') throw errors.conflict('Es läuft bereits ein Deployment.');
      if (state === 'requested')
        throw errors.conflict('Ein Deployment ist bereits angefordert und wartet auf den Start.');
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, `.request.${process.pid}.tmp`);
      await writeFile(tmp, `ref=${branch}\n`, { mode: 0o640 });
      await rename(tmp, join(dir, FILES.request));
    },
  };
}
export type DeployService = ReturnType<typeof createDeployService>;
