import node from '@astrojs/node';
import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';

// PREVIEW_MODE=1 baut dieselbe App als Node-Server (SSR) für die Vorschau; sonst statischer Output.
const preview = process.env.PREVIEW_MODE === '1';

// Statischer Output. SITE_URL ist öffentlich (kein Secret) und bestimmt Canonical-/Sitemap-URLs.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: preview ? 'server' : 'static',
  ...(preview && { adapter: node({ mode: 'standalone' }) }),
  outDir: process.env.BUILD_OUT_DIR ?? (preview ? './dist-preview' : './dist'),
  // Bild-URLs (/img/x.webp) haben keinen Slash am Ende; die SSR-Vorschau muss sie annehmen.
  trailingSlash: preview ? 'ignore' : 'always',
  build: { format: 'directory', assets: '_assets' },
  integrations: [preact()],
  server: { port: 4321, host: '127.0.0.1' },
  devToolbar: { enabled: false },
  compressHTML: true,
  // lightningcss fasst animation-timeline in die `animation`-Kurzschreibweise; die verstehen nicht alle Browser.
  vite: { build: { cssMinify: 'esbuild' } },
});
