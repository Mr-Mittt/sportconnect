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

## Update 2026-11-18: more evidence, folded in (owner decision, instead of a new ticket)

Two large parallel `e2e` runs during CLIENT-SESSION-49 and CLIENT-SESSION-52 hit the same family of load flakes. None reproduced when the spec ran alone, and none touched the code under change.

- **`matches-journey.spec.ts:79`, step `8c` (Discover filters), failed in both runs.** CLIENT-SESSION-49 (29 tests, 7 specs) and CLIENT-SESSION-52 (39 tests, 9 specs). Both times at `expect(discoverSection.getByText('No sessions to discover on Today.')).toBeVisible()` (the Fee filter at line 419 in the first run, the Minimum open slots filter at line 411 in the second), after the 60 s test timeout. Isolated re-runs of the whole spec passed (4 of 4 each time). The step never opens the session modal. This is the failure scope item 3 asked to look at, now seen three times (2026-11-14 once, then these two).
- **`home-feed-journey.spec.ts`, 7 tests, failed once (CLIENT-SESSION-52 run).** Each hit the 30 s test timeout inside `seedAuthenticatedSession` -> `signIn` (`e2e/mocks/keycloakStub.ts:107`, `page.unroute: Target page, context or browser has been closed`), i.e. before the test body. A Vitest run was going on the same machine. Isolated re-run of that spec plus `matches-journey` passed 11 of 11.

**What it suggests (not proven):** the suite is sensitive to machine load, in two places: the sign-in helper (30 s) and the Discover filter steps (5 s `expect` timeout after a debounced fetch). Add to the scope: measure `8c` and the sign-in under `--workers` 1, 4 and 8 with `--repeat-each`, and decide between a longer `expect` timeout for the Discover steps, waiting for the filtered request to finish before asserting, and a lower worker count for the `e2e` project in CI and locally. Same out-of-scope list.

**Out of scope:** raising the retry count; changing the app's redirect on load; the Home Feed Escape-popover flake (HF-21).

**Tests / docs:** e2e spec only; update `client/docs/E2E_OVERVIEW.md` if the test list changes.

**i18n / enums / account lifecycle:** none.
