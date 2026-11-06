// Baut die Seite (statisch oder, mit PREVIEW_MODE=1, als SSR-Vorschau) und prüft danach, dass kein Secret im Output steht.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Ausgabeverzeichnis wie in astro.config.mjs: BUILD_OUT_DIR, sonst dist bzw. dist-preview. */
export function outDirFor(env) {
  return env.BUILD_OUT_DIR || (env.PREVIEW_MODE === '1' ? 'dist-preview' : 'dist');
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run('astro', ['build']);
  run('node', [
    fileURLToPath(new URL('../../../scripts/check-no-secrets.mjs', import.meta.url)),
    outDirFor(process.env),
  ]);
}
