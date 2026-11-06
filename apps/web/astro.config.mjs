import { defineConfig } from 'astro/config';

// Statischer Output. Der SSR-Vorschaumodus kommt mit Phase 5.
export default defineConfig({
  output: 'static',
  server: { port: 4321, host: '127.0.0.1' },
  devToolbar: { enabled: false },
});
