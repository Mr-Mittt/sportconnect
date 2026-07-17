/**
 * MSW-1: single source of truth for the standalone mock server's port/URL and
 * the session-id header name — imported by the server itself (mockServer.ts),
 * Playwright config (webServer entries), Vite config (dev-proxy target for
 * e2e/visual-regression runs), and test-side code (fixtures.ts, specs)
 * that talks to the server's admin API directly via Playwright's `request`
 * fixture. Keeping this in one file means the port/header name can never
 * drift between the pieces that need to agree on it.
 */
export const MOCK_SERVER_PORT = Number(process.env.MOCK_SERVER_PORT ?? 9876);
export const MOCK_SERVER_URL = `http://localhost:${MOCK_SERVER_PORT}`;
export const SESSION_HEADER = 'x-e2e-session-id';
