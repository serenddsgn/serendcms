// Prüft nach dem Build, dass keine Secret-Werte im Output von admin oder web stehen.
//   node scripts/check-no-secrets.mjs <dir> [<dir> …]
// Geprüft werden: die Werte der Secret-Variablen aus process.env bzw. ./.env sowie
// typische Muster (Zugangsdaten in URLs, Zuweisungen von Secret-Variablen).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SECRET_VARS = ['SESSION_SECRET', 'BUILD_TOKEN', 'PREVIEW_SIGNING_KEY', 'SMTP_PASSWORD'];
const PATTERNS = [
  { name: 'Zugangsdaten in URL', re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/ },
  {
    name: 'Secret-Variable zugewiesen',
    re: /\b(?:SESSION_SECRET|BUILD_TOKEN|PREVIEW_SIGNING_KEY|SMTP_PASSWORD)\s*[=:]\s*["']?[A-Za-z0-9_\-+/=]{16,}/,
  },
  { name: 'Private Key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

export function parseDotenv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export function collectSecretValues(env, dotenvText = '') {
  const merged = { ...parseDotenv(dotenvText), ...env };
  const values = SECRET_VARS.map((k) => merged[k]).filter(
    (v) => typeof v === 'string' && v.length >= 8,
  );
  const db = merged.DATABASE_URL;
  if (db) {
    try {
      const pw = decodeURIComponent(new URL(db).password);
      if (pw.length >= 8) values.push(pw);
    } catch {
      // ungültige URL: ignorieren
    }
  }
  return [...new Set(values)];
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (s.size < 20 * 1024 * 1024) yield p;
  }
}

/** Liefert eine Liste von Funden (Datei + Art); Secret-Werte selbst werden nie ausgegeben. */
export function scanDirs(dirs, secretValues) {
  const findings = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) throw new Error(`Verzeichnis fehlt: ${dir}`);
    for (const file of walk(dir)) {
      const text = readFileSync(file, 'latin1');
      secretValues.forEach((v, i) => {
        if (text.includes(v))
          findings.push({ file, what: `Secret-Wert #${i + 1} aus der Umgebung` });
      });
      for (const p of PATTERNS) if (p.re.test(text)) findings.push({ file, what: p.name });
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('Aufruf: node scripts/check-no-secrets.mjs <dir> […]');
    process.exit(2);
  }
  const envFile = new URL('../.env', import.meta.url);
  const values = collectSecretValues(
    process.env,
    existsSync(envFile) ? readFileSync(envFile, 'utf8') : '',
  );
  const findings = scanDirs(dirs, values);
  if (findings.length > 0) {
    for (const f of findings) console.error(`SECRET-FUND: ${f.file}: ${f.what}`);
    process.exit(1);
  }
  console.log(`Keine Secrets im Build-Output gefunden (${values.length} Werte geprüft).`);
}
