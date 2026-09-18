import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, webServer: undefined, testMatch: "**/r26-real-r27-ui.spec.ts", timeout: 45000, workers:1,
  use: { ...base.use, baseURL:"http://127.0.0.1:4177", viewport:{width:412,height:915}, locale:"tr-TR", screenshot:"only-on-failure", trace:"retain-on-failure" } });
