import { defineConfig, devices } from '@playwright/test';

/*
 * One Playwright install, two projects (see client/CLAUDE.md):
 *  - e2e:               functional user journeys, specs under e2e/flows/
 *  - visual-regression: screenshot diffing, specs under e2e/visual/
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Headed locally (visible browser window) for easier debugging; headless
    // in CI, which has no display server — same CI-conditional pattern as
    // retries/reuseExistingServer above.
    headless: !!process.env.CI,
  },
  projects: [
    {
      name: 'e2e',
      testDir: './e2e/flows',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual-regression',
      testDir: './e2e/visual',
      use: { ...devices['Desktop Chrome'] },
      // Stable, platform/test-agnostic snapshot paths: HF-10b's real-page test
      // must diff against the SAME committed baselines the reference spec
      // generates. Note: baselines are rendered on the OS that generated them
      // (currently Windows) — regenerate once on Linux when CI lands.
      snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
