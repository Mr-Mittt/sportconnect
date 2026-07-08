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
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      "window.__mswReady = import('/e2e/mocks/server.ts')" +
        ".then(({ worker }) => worker.start({ onUnhandledRequest: 'bypass' }));",
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
