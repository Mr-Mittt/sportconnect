import { defineConfig, devices } from '@playwright/test';
import { MOCK_SERVER_URL } from './e2e/mocks/mockServerConfig.ts';

/*
 * AUTH-15: the redirect e2e against a REAL Keycloak (the realm import plus the theme JAR). Not part
 * of `pnpm e2e` — it needs a Keycloak container — so it has its own config and script:
 *
 *   pnpm e2e:keycloak          (Keycloak must already be up, see KEYCLOAK_URL)
 *   infra/scripts/run-keycloak-e2e.sh   (starts Keycloak with the theme, runs this, tears it down)
 *
 * What is real and what is not: the client (a Vite dev server on :5175, a port of its own so it
 * can never collide with a developer's `pnpm dev` on :5173; the spec's `beforeAll` adds
 * `http://localhost:5175/*` to the e2e Keycloak's client redirect URIs) and Keycloak (the hosted
 * pages, PKCE, the code) are real. There is no Spring backend here; the standalone mock server (MSW handlers) answers
 * `/api/*`, and `MOCK_AUTH_ACCEPT_ANY_CODE=1` makes its `/api/auth/callback` accept the code Keycloak
 * really issued. The real callback against the real backend was walked in AUTH-14.
 */
export const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e/keycloak',
  // One shared Keycloak, one created user per run: keep the order simple.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { outputFolder: 'playwright-report-keycloak', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: [
    {
      command: 'node e2e/mocks/mockServer.ts',
      url: `${MOCK_SERVER_URL}/__mock/health`,
      reuseExistingServer: false,
      env: { MOCK_AUTH_ACCEPT_ANY_CODE: '1' },
    },
    {
      // Never reuse another server on this port: it must proxy /api to the mock server above.
      command: 'pnpm exec vite --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      stderr: 'ignore',
      env: {
        VITE_API_PROXY_TARGET: MOCK_SERVER_URL,
        VITE_CHAT_PROXY_TARGET: MOCK_SERVER_URL,
        VITE_KEYCLOAK_URL: KEYCLOAK_URL,
      },
    },
  ],
});
