import { defineConfig } from "@playwright/test";

const managed = process.env.E2E_MANAGED === "1";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://127.0.0.1:${managed ? 3017 : 3000}`;
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL,
    locale: "es-AR",
    launchOptions: process.env.E2E_BROWSER_PATH
      ? {
          executablePath: process.env.E2E_BROWSER_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : undefined,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: managed
          ? "npm run dev -- --port 3017 --turbopack"
          : "npm run dev",
        url: `${baseURL}/login`,
        reuseExistingServer: !managed && !process.env.CI,
        timeout: 120_000,
      },
});
