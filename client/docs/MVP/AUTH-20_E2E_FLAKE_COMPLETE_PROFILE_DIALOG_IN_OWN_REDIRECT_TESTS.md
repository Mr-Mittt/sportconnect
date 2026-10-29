# AUTH-20 · Fix the e2e flake where the "Complete your profile" dialog hides the page in tests that build their own Keycloak redirect

**Status:** `DONE` · **Type:** Bug Fix (e2e test) · **Depends on:** none (AUTH-16 added the dialog and the suppression in `signIn()`)

**Filed:** 2026-10-28, from the INFRA-4 merge to `master`: the `client-ci` e2e run failed (1 failed, 2 flaky) on a merge whose only client change was `client/build.gradle`, and the same code was green on the PR. The failure reproduces locally, so it is a flake in the suite, not a regression from that merge.

## What

`e2e/flows/auth-journey.spec.ts` › "Auth journey — /register asks Keycloak for the create-account step" fails intermittently on `await expect(page.getByRole('heading', { name: 'Home Feed' })).toBeVisible()`. Reproduced locally on 2026-10-28 with `pnpm exec playwright test e2e/flows/auth-journey.spec.ts -g "register asks Keycloak" --project=e2e --repeat-each=15`: **3 of 15 failed**, all at that assertion. CI retries twice and still failed once.

**Root cause (found, not yet fixed).** The failure snapshot shows the "Complete your profile" dialog open over the page. A Radix dialog marks the rest of the page `aria-hidden`, so `getByRole('heading', { name: 'Home Feed' })` finds nothing. The mock profile has no country, so the dialog opens as soon as the profile loads (AUTH-16). `signIn()` in `e2e/mocks/keycloakStub.ts` prevents that by seeding `sessionStorage` (`complete-profile-storage`, `skippedFor`) before the app loads, but this test builds its own redirect with `keycloakRedirectBack` and never calls `signIn()`, so nothing suppresses the dialog. The assertion races the profile request: it passes when the heading is checked first and fails when the dialog opens first (and then stays open for the whole 5 s).

`e2e/flows/locale.spec.ts` › "Accept-Language follows a locale stored before the app loads" builds its redirect the same way (`keycloakRedirectBack(keycloakCode.user)` inside its own `page.route`), and was one of the two flaky tests in the same CI run. Very likely the same cause; to be confirmed.

## Scope

1. Move the sessionStorage seeding out of `signIn()` into an exported helper in `keycloakStub.ts` (for example `skipCompleteProfileDialog(page)`); `signIn()` calls it as today.
2. Call it from every test that builds its own Keycloak redirect: the `/register` test above and the `locale.spec.ts` test; `grep` `e2e/` for other `keycloakRedirectBack(` callers outside `signIn()` (on 2026-10-28 there were only these two).
3. Prove it: re-run both specs with `--repeat-each=15` (all green), and confirm the `/register` test fails again if the helper call is removed (the mutation check).
4. The third flaky test of the same CI run, `home-feed-journey.spec.ts:364` ("Escape closes only the open Time/Location popover, then a second Escape closes the 'Join a match' modal"), does not use `signIn()` or the Keycloak stub and so was **not** explained by the cause above. Reproduce it with `--repeat-each` and find its cause; if it is different, file it as its own ticket instead of widening this one.

**Scope change 2026-10-29 (user decision, at pickup): fix every flaky test of the same CI run in this ticket.** The "Escape-popover" test (step 4) is fixed here whatever its cause, instead of being filed separately, and a third test is folded in:

5. `matches-journey.spec.ts:79` ("Matches journey", step 1) was flaky in the same run. It uses `seedAuthenticatedSession`, so the dialog is not its cause. Failure seen in CI: `expect(getByRole('button', { name: 'All' })).not.toBeVisible()` at line 95 found a visible button, an unpressed sport pill. Cause to confirm in Phase 2: Playwright `getByRole({ name })` matches a **substring, case-insensitively**, and "Pickle**ball**" contains "all", so the Pickleball pill matches `name: 'All'`. The assertion passes when it runs before the sport pills have loaded and fails after, so it is both flaky and, when it passes, meaningless. Every other `'All'` locator in `e2e/` already uses `exact: true`; this is the one that does not.

**Out of scope:** changing the dialog's behaviour in the app (it is correct), the e2e retry count, visual-regression baselines. (Scope change 2026-10-29: the Escape-popover flake and `matches-journey` are now in scope, see above.)

**Tests / docs:** the change is to e2e specs and the stub only, so no new test; if a spec's test list changes, update `client/docs/E2E_OVERVIEW.md` (§3 and §6). The Phase 5 result of `/workon` must name the `--repeat-each` evidence.

**i18n / enums / account lifecycle:** none; no user-visible text, no backend contract.

## Implementation summary (2026-10-29)

**The approved design, restated.** Three of the four flaky tests of the INFRA-4 merge's `client-ci` run are fixed, at their causes; the fourth could not be reproduced and is parked as HF-21 (user decision). The change is to e2e files only: no app code, no backend contract, no user-visible text (no i18n keys), no baseline.

**What was built.**

- `e2e/mocks/keycloakStub.ts`: new exported `skipCompleteProfileDialog(page)` (the `complete-profile-storage` seeding moved out of `signIn()`, with a doc comment saying why and when to call it). `signIn()` calls it unless `completeProfileDialog: 'show'`, as before.
- `auth-journey.spec.ts` ("/register asks Keycloak for the create-account step") and `locale.spec.ts` ("Accept-Language follows a locale stored before the app loads") call it before `page.goto`: both build their own redirect with `keycloakRedirectBack` and never reach `signIn()`. A grep of `e2e/` found no other caller of `keycloakRedirectBack(` outside the stub.
- `matches-journey.spec.ts` step 1: the `'All'` locator is now `{ name: 'All', exact: true }` and runs after the "Badminton is pressed" assertion. Cause: a role name matches as a case-insensitive substring and "Pickle**ball**" contains "all". Before the fix the absence check passed whenever it ran before the sport pills had loaded, so it was flaky and, when it passed, proved nothing.

**Causes (confirmed by reproduction and by the failure screenshots).** `/register` and `locale`: the "Complete your profile" dialog (AUTH-16) was open over the page, and a Radix dialog hides everything behind it from role queries. `matches-journey`: the substring locator above.

**Evidence.** Every number is `--repeat-each=15` unless stated, 8 workers, `--project=e2e`.

| Spec | Before the fix | After the fix | Mutation check (fix removed) |
|---|---|---|---|
| `/register` | 2 and 8 of 15 failed (two runs) | 15 of 15 passed | 5 of 15 failed |
| `locale` | 3 and 6 of 15 failed | 15 of 15 passed | not run separately: same helper as `/register` |
| `matches-journey` | 1 of 15 failed, at line 95 with CI's error text | 15 of 15 passed | with the check moved after the pills load, the old locator fails **40 of 40**, i.e. the bug is deterministic once the race is gone |
| `home-feed-journey:364` (Escape) | 0 of 30 failed | unchanged | not applicable |

**Divergence from the plan.** The Escape-popover flake is not fixed. It did not reproduce in 30 runs at 8 workers; a run at 16 workers is not valid evidence (the machine overloaded: Node worker crashes and timeouts). It is filed as **HF-21** (client backlog), to be picked up when CI fails on it again with that run's trace. This follows the ticket's own step 4 and the user's instruction.

**E2E.** Scoped subset, not the whole `e2e` project (standing scoped-test rule): `auth-journey`, `locale`, `matches-journey`, `home-feed-journey` and `complete-profile` (the stub is shared, so `complete-profile` uses the changed `signIn`). Run serially (`--workers=1`), `auth-journey` + `complete-profile`: **9 of 9 passed**. At the default 8 workers on this Windows machine, the first wave of tests times out at 30 s (in one run `auth-journey` sign-in, `auth-journey` expired session and `complete-profile` "Skip for now"; `page.unroute: Target page, context or browser has been closed` is the teardown of the timed-out test); the same subset with the changes stashed also failed 4 tests, so this is load on this machine, not this change (their names were not recorded for the baseline run). `locale`, `matches-journey` and `home-feed-journey` passed in the parallel runs.

**Visual-regression expectation.** No baselined surface touched, so no baseline change is expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run.

**E2E_OVERVIEW.** No spec was added or removed and no test's steps changed; the one paragraph that describes the dialog suppression (§6) now names `skipCompleteProfileDialog`.

**Follow-up filed:** HF-21 (client, `MVP/HF-21_E2E_FLAKE_HOME_FEED_ESCAPE_POPOVER_NOT_REPRODUCED.md`).
