import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/demo-run",
  globalSetup: "./tests/support/e2e-servers.ts",
  metadata: { auligmaServerMode: "demo" },
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  workers: 1,
});
