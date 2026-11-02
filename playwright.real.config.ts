import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests-real', outputDir: './test-results/real-run', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort', env: { VITE_DEMO_MODE: 'false' }, url:'http://127.0.0.1:5174', reuseExistingServer:false },
    { command: 'node --env-file-if-exists=.env ./node_modules/tsx/dist/cli.mjs server/index.ts', env: { FRONTEND_URL:'http://127.0.0.1:5174', BACKEND_URL:'http://127.0.0.1:3001', GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'' }, url:'http://127.0.0.1:3001/api/v1/health', reuseExistingServer:false },
  ],
});
