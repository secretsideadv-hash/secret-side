import { defineConfig } from "@playwright/test";

const PORT = 3100; // separate from `next dev` on 3000
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
  // Test the production build: same caching, prerendering and Secure cookie as Vercel.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-only-secret-never-use-in-production-0000",
    },
  },
});
