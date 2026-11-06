import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Admin und API laufen unter derselben Domain (Caddy). Lokal übernimmt der Proxy diese Rolle,
// dadurch ist keine CORS-Konfiguration nötig.
const apiUrl = process.env.ADMIN_API_URL ?? 'http://127.0.0.1:4000';
const port = Number(process.env.ADMIN_PORT ?? 5173);
const proxy = { '/api': apiUrl };

export default defineConfig({
  plugins: [react()],
  server: { port, strictPort: true, host: '127.0.0.1', proxy },
  preview: { port, strictPort: true, host: '127.0.0.1', proxy },
});
