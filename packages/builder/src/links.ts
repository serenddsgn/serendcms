import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { htmlFiles, urlOf } from './files.js';

export interface BrokenLink {
  page: string;
  url: string;
  reason: string;
  /** Sichtbarer Text des Links (`<a>…</a>`), damit er sich im Admin wiederfinden lässt. */
  label?: string;
}
export interface LinkCheckResult {
  pages: number;
  links: number;
  broken: BrokenLink[];
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

/** Alle internen Verweise (href, src, srcset, absolute Canonical-/hreflang-URLs der eigenen Domain) müssen auflösbar sein. */
export function checkLinks(dir: string, opts: { siteUrl?: string } = {}): LinkCheckResult {
  const site = opts.siteUrl?.replace(/\/$/, '');
  const files = htmlFiles(dir);
  const idCache = new Map<string, Set<string>>();
  const ids = (file: string) => {
    let s = idCache.get(file);
    if (!s) {
      s = new Set(
        [...readFileSync(file, 'utf8').matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1]!),
      );
      idCache.set(file, s);
    }
    return s;
  };
  const resolveFile = (path: string): string | undefined => {
    const clean = decodeURIComponent(path);
    const base = join(dir, clean);
    for (const c of [base, join(base, 'index.html')]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return undefined;
  };

  const broken: BrokenLink[] = [];
  let links = 0;
  for (const file of files) {
    const page = urlOf(dir, file);
    const html = readFileSync(file, 'utf8');
    const found: string[] = [];
    // Sichtbarer Text je Link-Ziel, nur für verständliche Fehlermeldungen
    const labels = new Map<string, string>();
    for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const text = decode(m[2]!.replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
      if (text && !labels.has(decode(m[1]!))) labels.set(decode(m[1]!), text);
    }
    for (const m of html.matchAll(/\s(?:href|src|poster)="([^"]*)"/g)) found.push(decode(m[1]!));
    for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) {
      for (const part of decode(m[1]!).split(',')) found.push(part.trim().split(/\s+/)[0]!);
    }
    const labelOf = (raw: string) => {
      const label = labels.get(raw);
      return label ? { label } : {};
    };
    for (const raw of found) {
      let url = raw;
      if (site && url.startsWith(`${site}/`)) url = url.slice(site.length);
      if (!url || SKIP.test(url)) continue;
      links++;
      const [pathAndQuery, fragment] = url.split('#') as [string, string | undefined];
      const path = pathAndQuery.split('?')[0]!;
      let abs = path;
      if (!path.startsWith('/')) abs = new URL(path || '.', `http://x${page}`).pathname;
      if (path === '') abs = page;
      const target = resolveFile(abs);
      if (!target) {
        broken.push({ page, url: raw, reason: 'Ziel existiert nicht', ...labelOf(raw) });
        continue;
      }
      if (fragment && target.endsWith('.html') && !ids(target).has(decodeURIComponent(fragment))) {
        broken.push({ page, url: raw, reason: `Anker #${fragment} fehlt`, ...labelOf(raw) });
      }
    }
    for (const m of html.matchAll(/\s(?:href|src)="(https?:\/\/[^"]+)"/g)) void m; // externe Links werden nicht geprüft
  }
  return { pages: files.length, links, broken };
}
