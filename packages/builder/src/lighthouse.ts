import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

export interface LighthouseEntry {
  url: string;
  performance: number;
}
export interface LighthouseResult {
  minScore: number;
  pages: LighthouseEntry[];
  failed: LighthouseEntry[];
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

function serve(dir: string): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as { port: number }).port }),
    ),
  );
}

/** Lighthouse (Performance, mobiles Standardprofil) gegen den statisch ausgelieferten Build-Output. */
export async function checkLighthouse(
  dir: string,
  paths: string[],
  minScore = 95,
): Promise<LighthouseResult> {
  const { default: lighthouse } = await import('lighthouse');
  const { server, port } = await serve(dir);
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${debugPort}`],
  });
  const pages: LighthouseEntry[] = [];
  try {
    for (const path of paths) {
      const url = `http://127.0.0.1:${port}${path}`;
      const run = await lighthouse(url, {
        port: debugPort,
        onlyCategories: ['performance'],
        output: 'json',
        logLevel: 'error',
      });
      const score = run?.lhr.categories.performance?.score ?? 0;
      pages.push({ url: path, performance: Math.round(score * 100) });
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { minScore, pages, failed: pages.filter((p) => p.performance < minScore) };
}
