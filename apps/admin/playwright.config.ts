import { defineConfig } from '@playwright/test';

const PORT = 5199;
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  // Startet eine komplette Wegwerf-Umgebung: PostgreSQL, API und Admin (Vite) auf festen lokalen Ports.
  webServer: {
    command: 'pnpm exec tsx e2e/stack.ts',
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
