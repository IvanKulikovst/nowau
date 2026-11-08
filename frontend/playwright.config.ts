import { defineConfig } from "@playwright/test";

// Перед запуском: бэкенд на :8000 и `npm run build && npm run preview` (:4173) либо `npm run dev` (:5173)
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:4173", trace: "off",
    // PW_CHROMIUM=/путь/к/chromium — если браузер установлен отдельно от версии Playwright
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
