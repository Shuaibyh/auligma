import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/demo-run",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
    env: { VITE_DEMO_MODE: "true" },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
  reporter: [["list"]],
  workers: 1,
});
