import { defineConfig, devices } from '@playwright/test';
import { MOCK_SERVER_URL } from './e2e/mocks/mockServerConfig.ts';

/*
 * One Playwright install, two projects (see client/CLAUDE.md):
 *  - e2e:               functional user journeys, specs under e2e/flows/
 *  - visual-regression: screenshot diffing, specs under e2e/visual/
 *
 * Both projects depend on the standalone e2e mock server (MSW-1) — visual-
 * regression's specs seed an authenticated session and mock-internal empty
 * state the same way e2e's do (app-home-feed.spec.ts imports the same
 * test.ts/fixtures.ts), so it isn't independent of this even though its
 * screenshots are otherwise mock-data-only.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    // Deliberately not 5173 (plain `pnpm dev`'s port) — a distinct port means this
    // Playwright-managed server can never collide with a developer's own concurrent `pnpm dev`
    // session. See the webServer entry below for the matching `--port`/`--strictPort`.
    baseURL: 'http://localhost:5174',
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
  webServer: [
    {
      command: 'node e2e/mocks/mockServer.ts',
      url: `${MOCK_SERVER_URL}/__mock/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Distinct port from plain `pnpm dev` (5173) — see the `use.baseURL` comment above. Calls
      // `vite` directly (not `pnpm dev -- --port ...`) — pnpm on this setup doesn't strip the
      // `--` separator before forwarding, so vite received a literal "--" arg and silently fell
      // back to its default port 5173, ignoring --port entirely (confirmed live). `--strictPort`
      // makes Vite fail loudly if 5174 is taken instead of its default behavior of silently
      // trying 5175/5176/... next, which historically caused Playwright to poll the *wrong*
      // server's health check while a stale process sat on 5174 (see docs/E2E_OVERVIEW.md).
      command: 'pnpm exec vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      // MSW-1: routes the app's own /api calls to the mock server instead of
      // the real backend, only for this Playwright-managed dev server —
      // plain `pnpm dev` run standalone never sets this, so it keeps
      // targeting :8080 (vite.config.ts's own fallback). CHAT-10: same
      // treatment for the separate /api/chat proxy entry — without this it
      // silently targeted a real chat service on :8081 that doesn't exist in
      // CI, so every chat request 404'd/connection-refused before this fix.
      // The chat MSW handlers (handlers/chat.ts) expect the bare,
      // prefix-stripped paths vite.config.ts's rewrite already produces —
      // the same shape whether the target is this mock server or the real
      // Go service.
      env: { VITE_API_PROXY_TARGET: MOCK_SERVER_URL, VITE_CHAT_PROXY_TARGET: MOCK_SERVER_URL },
    },
  ],
});
