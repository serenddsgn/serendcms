import { spawn } from 'node:child_process';
import type { WorkerConfig } from './config.js';
import type { LogBuffer } from './log-buffer.js';

export interface SiteBuildInput {
  outDir: string;
  log: LogBuffer;
}
export type SiteBuilder = (input: SiteBuildInput) => Promise<void>;

/**
 * Astro-Build als Kindprozess. Der Prozess bekommt nur, was er braucht (kein DB-Passwort, kein Session-Secret):
 * Build-Token für /internal/build/*, API-URL, Ausgabeverzeichnis und den persistenten Asset-Cache.
 */
export function createAstroBuilder(config: WorkerConfig): SiteBuilder {
  return ({ outDir, log }) =>
    new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['--filter', '@serend/web', 'exec', 'astro', 'build'], {
        cwd: config.repoDir,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          NODE_ENV: 'production',
          API_URL: config.apiUrl,
          BUILD_TOKEN: config.buildToken,
          SITE_URL: config.siteUrl,
          BUILD_OUT_DIR: outDir,
          ASSET_CACHE_DIR: config.assetCacheDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(
            `Astro-Build hat das Zeitlimit (${Math.round(config.buildTimeoutMs / 1000)} s) überschritten.`,
          ),
        );
      }, config.buildTimeoutMs);
      child.stdout.on('data', (d: Buffer) => log.add(d.toString()));
      child.stderr.on('data', (d: Buffer) => log.add(d.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Astro-Build beendet mit Exit-Code ${code}.`));
      });
    });
}
