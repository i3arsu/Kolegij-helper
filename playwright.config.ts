import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",

  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,

  reporter: "list",
  timeout: 30_000,

  expect: {
    timeout: 5_000,
  },

  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "hr-HR",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: {
    command:
      "npm run dev -- --hostname localhost --port 3000",
    url: "http://localhost:3000/prijava",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});