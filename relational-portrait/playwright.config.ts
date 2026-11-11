import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "unfinished.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.PORTRAIT_TEST_URL || "http://localhost:5174",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: process.env.PORTRAIT_TEST_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5174",
        reuseExistingServer: true,
      },
});
