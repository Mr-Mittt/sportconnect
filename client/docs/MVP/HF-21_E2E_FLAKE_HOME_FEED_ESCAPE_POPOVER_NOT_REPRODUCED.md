# HF-21 · Home Feed Escape-popover e2e flake: find the cause when CI fails on it again (not reproduced locally)

**Status:** `TODO` · **Type:** Bug Fix (e2e test, investigation) · **Depends on:** none

**Filed:** 2026-10-29, split out of AUTH-20 (step 4). The test was one of the two flaky tests in the `client-ci` e2e run on the INFRA-4 merge to `master` (2026-10-28), but it could not be reproduced locally, so by the user's decision it is parked here until CI keeps failing on it.

## What

`e2e/flows/home-feed-journey.spec.ts:364` ("Home Feed — Escape closes only the open Time/Location popover, then a second Escape closes the 'Join a match' modal") passed in CI on retry after failing once.

**What was tried (AUTH-20, 2026-10-29), all green:** `--repeat-each=30` at 8 workers: 30 of 30 passed. A run at `--workers=16` is not evidence either way: the machine was overloaded (Node worker crashes with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and timeouts), so its failures say nothing about this test.

**What is known.** It is not the AUTH-20 cause: the test signs in with `signIn()` through `seedAuthenticatedSession`, which already skips the "Complete your profile" dialog. It is also not the `'All'` substring locator. Not yet looked at: `getByRole('button', { name: 'Time' })` and `{ name: 'Badminton' }` are substring matches too (a second match would be a strict-mode failure, not a flake); the first `Escape` is pressed as soon as the popover is visible, before Radix's dismissable-layer listener may be attached (CLIENT-SESSION-27's fix pinned a single `react-dismissable-layer` copy, so a dependency drift is also worth re-checking with `pnpm why react-dismissable-layer`).

## Scope

1. Pick this up when CI fails on this test again. First get the evidence from that run: the failing assertion line, the `error-context.md` snapshot, and a trace (`trace: 'on-first-retry'` is on).
2. Reproduce locally under the load that CI has (a few workers, not 16), with `--repeat-each`.
3. Fix the cause, with a mutation check that fails without the fix.

**Out of scope:** raising the retry count, changing the Escape behaviour in the app (CLIENT-SESSION-27 is correct).

**Tests / docs:** e2e spec only; update `client/docs/E2E_OVERVIEW.md` if the test list changes.

**i18n / enums / account lifecycle:** none.
