import { checkJsBudget, type BudgetResult } from './budget.js';
import { checkHtml, type HtmlCheckResult } from './html.js';
import { checkLighthouse, type LighthouseResult } from './lighthouse.js';
import { checkLinks, type LinkCheckResult } from './links.js';

/** Hinweis, der den Build nicht verhindert (z. B. ein Lighthouse-Wert unter dem Ziel). */
export interface CheckWarning {
  code: 'lighthouse' | 'lighthouse_error';
  /** URL-Pfad der betroffenen Seite, falls es eine bestimmte ist. */
  path: string | null;
  message: string;
}

export interface ChecksResult {
  /** Nur die blockierenden Prüfungen (Links, HTML, JS-Budget). Warnungen ändern das nie. */
  passed: boolean;
  links: LinkCheckResult;
  html: HtmlCheckResult;
  budget: BudgetResult;
  lighthouse: LighthouseResult | { skipped: true };
  problems: string[];
  warnings: CheckWarning[];
}

export interface ChecksOptions {
  siteUrl?: string;
  /** Seiten für Lighthouse (URL-Pfade). Leer oder `lighthouse: false` überspringt die Prüfung. */
  lighthousePaths?: string[];
  lighthouse?: boolean;
  lighthouseMinScore?: number;
}

export async function runChecks(dir: string, opts: ChecksOptions = {}): Promise<ChecksResult> {
  const links = checkLinks(dir, opts.siteUrl ? { siteUrl: opts.siteUrl } : {});
  const html = await checkHtml(dir);
  const budget = checkJsBudget(dir);
  const useLighthouse = opts.lighthouse !== false && (opts.lighthousePaths?.length ?? 0) > 0;
  // Performance ist ein Hinweis, nie ein Grund, nicht zu veröffentlichen: auch wenn Lighthouse selbst scheitert
  // (z. B. fehlender Browser), läuft der Build weiter.
  const warnings: CheckWarning[] = [];
  let lighthouse: ChecksResult['lighthouse'] = { skipped: true };
  if (useLighthouse) {
    try {
      lighthouse = await checkLighthouse(dir, opts.lighthousePaths!, opts.lighthouseMinScore ?? 95);
    } catch (err) {
      const first = (err instanceof Error ? err.message : String(err))
        .split('\n')[0]!
        .slice(0, 200);
      warnings.push({
        code: 'lighthouse_error',
        path: null,
        message: `Lighthouse konnte nicht ausgeführt werden: ${first}`,
      });
    }
  }

  const problems: string[] = [];
  for (const b of links.broken.slice(0, 20)) {
    const hint = b.reason.startsWith('Anker')
      ? ' Die Zielseite hat kein Element mit dieser ID: im Admin beim Link das Feld „Anker“ leeren oder den Anker am Ziel-Block eintragen.'
      : '';
    problems.push(
      `Kaputter Link auf ${b.page}${b.label ? ` („${b.label}“)` : ''}: ${b.url} (${b.reason}).${hint}`,
    );
  }
  for (const e of html.errors.slice(0, 20))
    problems.push(`HTML ${e.page}:${e.line} ${e.rule}: ${e.message}`);
  for (const o of budget.over)
    problems.push(
      `JS-Budget überschritten auf ${o.page}: ${(o.bytes / 1024).toFixed(1)} KB > ${(budget.limit / 1024).toFixed(0)} KB`,
    );
  if ('failed' in lighthouse)
    for (const f of lighthouse.failed)
      warnings.push({
        code: 'lighthouse',
        path: f.url,
        message: `Performance ${f.performance} (Ziel ${lighthouse.minScore}) auf ${f.url}`,
      });
  return { passed: problems.length === 0, links, html, budget, lighthouse, problems, warnings };
}
