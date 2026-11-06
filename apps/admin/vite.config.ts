import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Admin und API laufen unter derselben Domain (Caddy). Lokal übernimmt der Dev-Proxy diese Rolle,
// dadurch ist keine CORS-Konfiguration nötig.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
