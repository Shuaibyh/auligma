import { defineConfig } from '@playwright/test';

// Sesión y API académica sintéticas definidas en planning.spec.ts.
// El caso de equivalencia ejecuta SymPy real; no se inicia Fastify ni PostgreSQL.
export default defineConfig({
  testDir: './tests-real', testMatch: 'planning.spec.ts', outputDir: './test-results/local-ai-run',
  timeout: 45000, globalTimeout: 180000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5180', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180 --strictPort',
    env: { VITE_DEMO_MODE: 'false' }, url: 'http://127.0.0.1:5180', reuseExistingServer: false },
});
