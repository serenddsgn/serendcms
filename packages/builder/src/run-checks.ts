import { checkJsBudget, type BudgetResult } from './budget.js';
import { checkHtml, type HtmlCheckResult } from './html.js';
import { checkLighthouse, type LighthouseResult } from './lighthouse.js';
import { checkLinks, type LinkCheckResult } from './links.js';

export interface ChecksResult {
  passed: boolean;
  links: LinkCheckResult;
  html: HtmlCheckResult;
  budget: BudgetResult;
  lighthouse: LighthouseResult | { skipped: true };
  problems: string[];
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
  const lighthouse = useLighthouse
    ? await checkLighthouse(dir, opts.lighthousePaths!, opts.lighthouseMinScore ?? 95)
    : ({ skipped: true } as const);

  const problems: string[] = [];
  for (const b of links.broken.slice(0, 20))
    problems.push(`Kaputter Link auf ${b.page}: ${b.url} (${b.reason})`);
  for (const e of html.errors.slice(0, 20))
    problems.push(`HTML ${e.page}:${e.line} ${e.rule}: ${e.message}`);
  for (const o of budget.over)
    problems.push(
      `JS-Budget überschritten auf ${o.page}: ${(o.bytes / 1024).toFixed(1)} KB > ${(budget.limit / 1024).toFixed(0)} KB`,
    );
  if ('failed' in lighthouse)
    for (const f of lighthouse.failed)
      problems.push(
        `Lighthouse Performance ${f.performance} < ${lighthouse.minScore} auf ${f.url}`,
      );
  return { passed: problems.length === 0, links, html, budget, lighthouse, problems };
}
