import { defineConfig } from "@playwright/test";

const PORT = 3100; // separate from `next dev` on 3000
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // The live map renders with software WebGL (SwiftShader), which is CPU-heavy: cap parallel browsers.
  workers: process.env.CI ? 2 : 4,
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
    // Headless Chromium needs SwiftShader for WebGL, so the live map renders in tests.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  // Test the production build: same caching, prerendering and Secure cookie as Vercel.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 240_000,
    // Reads .env.local, so the app under test uses the DEV Supabase project.
    reuseExistingServer: !process.env.CI,
  },
});
