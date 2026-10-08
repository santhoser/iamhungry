import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath:
        process.env.CAFE77_BROWSER ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/browser-fixture.ts",
    url: "http://127.0.0.1:5174/api/menu",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
