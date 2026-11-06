import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests-real', outputDir: './test-results/real-run', timeout: 45000, workers: 1,
  globalSetup: './tests/support/e2e-servers.ts', metadata: { auligmaServerMode: 'real' },
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
});
