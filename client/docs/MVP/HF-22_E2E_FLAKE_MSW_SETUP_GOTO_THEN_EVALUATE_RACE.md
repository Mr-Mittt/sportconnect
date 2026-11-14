# HF-22 · e2e flake: `msw-setup.spec.ts` runs `fetch` inside `page.evaluate` while the page is still navigating

**Status:** `TODO` · **Type:** Bug Fix (e2e test) · **Depends on:** none

**Filed:** 2026-11-14, found while verifying CLIENT-GL-38 (full `e2e` run: `msw-setup.spec.ts:23` and `:74` failed once, passed on re-run). Reproduced on `master` (`75c4b51`), so it is not caused by that branch.

## What

`e2e/flows/msw-setup.spec.ts` checks that the standalone mock server (MSW-1) answers `POST /api/auth/callback`, `/refresh` and `/logout`. Each of its four tests does `await page.goto('/')` and then, at once, `page.evaluate("fetch('/api/auth/...')")`. The app redirects after load, and when that navigation lands during the `evaluate`, Playwright throws:

- `page.evaluate: Execution context was destroyed, most likely because of a navigation` (line 26, the first test), or
- `TypeError: Failed to fetch` (the in-flight `fetch` is cancelled by the navigation).

**Evidence (2026-11-14, `--project=e2e e2e/flows/msw-setup.spec.ts -g "auth/callback" --repeat-each=10 --workers=1`):** on `master` 5 failed / 5 passed; on the CLIENT-GL-38 branch 3 of 6 failed (`--repeat-each=6`). All failures are the two errors above. The tests do not use any app code beyond loading `/`.

**Cause (not yet proven):** the test never waits for the page to settle after `goto`. Only the first test was repeated; the other three have the same shape and failed once each in the full parallel run.

## Scope

1. Make the four tests wait until the page is stable before the `evaluate` (for example `waitForURL` on the final URL, or `waitForLoadState('networkidle')`), or send the request without a page context (`page.request.post`) since the file only needs the mock server to answer. Pick one and say why.
2. Prove the cause: `--repeat-each=30 --workers=1` fails on `master`, passes after the fix; the same with a few workers.
3. Re-run `matches-journey.spec.ts:79`, which also failed once in that full run and passed in isolation, and file or fold in what it shows.

**Out of scope:** raising the retry count; changing the app's redirect on load; the Home Feed Escape-popover flake (HF-21).

**Tests / docs:** e2e spec only; update `client/docs/E2E_OVERVIEW.md` if the test list changes.

**i18n / enums / account lifecycle:** none.
