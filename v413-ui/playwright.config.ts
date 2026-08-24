import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const testPort = Number(process.env.MOBILE_RUNTIME_TEST_PORT ?? 4174);
const localPlaywrightChromium = join(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright",
  "chromium-1217",
  "chrome-win64",
  "chrome.exe",
);
const localChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const configuredBrowser = process.env.NOVASTORE_CHROMIUM_PATH?.trim();
const executablePath = configuredBrowser
  || (existsSync(localPlaywrightChromium) ? localPlaywrightChromium : undefined)
  || (existsSync(localChrome) ? localChrome : undefined);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 20_000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    viewport: { width: 1100, height: 1100 },
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}/tests/runtime-fixture.html`,
    reuseExistingServer: process.env.MOBILE_RUNTIME_TEST_PORT == null,
  },
});
