import { test as base } from '@playwright/test';

/**
 * Drop-in replacement for `@playwright/test`'s `test` — import this instead
 * whenever a spec needs the backend mocked. Wires MSW's browser-mode worker
 * into the page via `addInitScript`, which runs before any of the page's own
 * scripts on every navigation, so MSW is intercepting before the app's first
 * fetch.
 *
 * The dynamic `import('/e2e/mocks/server.ts')` targets a URL Vite's dev
 * server transforms on request — Vite serves any file under the project
 * root, not just files reachable from src/index.html's module graph — so
 * this works without src/ ever importing anything from e2e/.
 *
 * The init script is a plain string, not a typed closure — the e2e tsconfig
 * has no DOM lib (see HF-8's delta in the Home Feed backlog), so a function
 * referencing `window` wouldn't typecheck here.
 *
 * Callers must `await page.evaluate('window.__mswReady')` after `page.goto()`
 * and before triggering any request that must be mocked.
 *
 * `window.__mswWorker` (AUTH-8) stashes the worker instance itself, not just
 * the ready promise — needed by fixtures.ts's simulateExpiredSessionOnNextLoad
 * to register a runtime handler override from within the page's own JS realm.
 *
 * On any navigation after the page's first (e.g. `page.reload()`), this
 * script's async `worker.start()` genuinely races the app's own
 * `useSessionBootstrap` bootstrap fetch — this script running first
 * (guaranteed by addInitScript) only guarantees the *kick-off* happens
 * first, not that the SW is controlling before the app's effects fire.
 * Confirmed empirically for AUTH-8 to be a real, non-deterministic race
 * (not one-directional), and confirmed that neither gating the refresh
 * request nor the app's entry module via `page.route()` reliably fixes it
 * (see fixtures.ts's `navigateUntil` for what does: bounded retry of the
 * whole navigation, the correct tool for a genuine race rather than a fixed
 * sleep).
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      "window.__mswReady = import('/e2e/mocks/server.ts')" +
        ".then(({ worker }) => { window.__mswWorker = worker; " +
        "return worker.start({ onUnhandledRequest: 'bypass' }); });",
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
