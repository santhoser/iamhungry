import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://127.0.0.1:5176" },
  webServer: {
    command: "npx tsx scripts/worker-browser-fixture.ts",
    url: "http://127.0.0.1:5176/api/menu",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
