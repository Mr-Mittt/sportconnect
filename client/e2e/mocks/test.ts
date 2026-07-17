import { test as base } from '@playwright/test';
import { MOCK_SERVER_URL, SESSION_HEADER } from './mockServerConfig.ts';

/**
 * Drop-in replacement for `@playwright/test`'s `test` — import this instead
 * whenever a spec needs the backend mocked.
 *
 * MSW-1: the mock server (mockServer.ts) is a real, already-running process
 * — started once via playwright.config.ts's `webServer` array, before any
 * test begins. There is no per-navigation setup handshake left to race the
 * app's own bootstrap fetch against, unlike the old Service-Worker-based
 * version of this file (see client/docs/BACKLOG_MVP.md · MSW-1 for the full
 * investigation this replaces).
 *
 * One server process serves every Playwright test/worker concurrently
 * (`fullyParallel: true`), so each test gets a unique `mockSessionId`,
 * attached via a header to every request its browser context makes —
 * `context.setExtraHTTPHeaders` covers navigations *and* the app's own
 * fetch/XHR calls, applied before `page` (which depends on `context`) is
 * ever created, so even the very first request of the test carries it. See
 * sessionStore.ts for why handlers need this at all.
 *
 * The session is reset server-side after each test (not just left to grow)
 * to keep a long suite run's memory bounded and to guarantee one test's
 * leftover state (e.g. a created group) can never bleed into a later test
 * that happens to reuse a similar-looking session — reset is keyed by the
 * exact same id, so this is a no-op cleanup, not a correctness dependency
 * (ids are already unique per test).
 */
export const test = base.extend<{ mockSessionId: string }>({
  // Playwright's fixture signature requires this first positional arg even
  // when the fixture has no dependencies of its own.
  // eslint-disable-next-line no-empty-pattern
  mockSessionId: async ({}, use, testInfo) => {
    const id = `${testInfo.testId}-${testInfo.repeatEachIndex}`;
    await use(id);
    await fetch(`${MOCK_SERVER_URL}/__mock/sessions/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
    }).catch(() => {
      // Best-effort cleanup — a failed reset call must never fail the test
      // itself (the mock server may already be shutting down at suite end).
    });
  },

  context: async ({ context, mockSessionId }, use) => {
    await context.setExtraHTTPHeaders({ [SESSION_HEADER]: mockSessionId });
    await use(context);
  },
});

export { expect } from '@playwright/test';
