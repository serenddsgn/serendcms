import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';

// Statischer Output. SITE_URL ist öffentlich (kein Secret) und bestimmt Canonical-/Sitemap-URLs.
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  outDir: process.env.BUILD_OUT_DIR ?? './dist',
  trailingSlash: 'always',
  build: { format: 'directory', assets: '_assets' },
  integrations: [preact()],
  server: { port: 4321, host: '127.0.0.1' },
  devToolbar: { enabled: false },
  compressHTML: true,
  // lightningcss fasst animation-timeline in die `animation`-Kurzschreibweise; die verstehen nicht alle Browser.
  vite: { build: { cssMinify: 'esbuild' } },
});
