// Erzeugt `.env` aus `.env.example` mit zufälligen Secrets (nur lokal, überschreibt nie).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.log('.env existiert bereits, nichts geändert.');
  process.exit(0);
}
const secret = () => randomBytes(48).toString('base64url');
const filled = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => {
    const m = /^(SESSION_SECRET|BUILD_TOKEN|PREVIEW_SIGNING_KEY)=/.exec(line);
    return m ? `${m[1]}=${secret()}` : line;
  })
  .join('\n');
writeFileSync(target, filled, { mode: 0o600 });
console.log('.env angelegt (Rechte 600) mit frisch erzeugten Secrets.');
