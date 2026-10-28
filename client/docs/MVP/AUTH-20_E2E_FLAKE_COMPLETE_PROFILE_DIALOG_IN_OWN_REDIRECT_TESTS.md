# AUTH-20 · Fix the e2e flake where the "Complete your profile" dialog hides the page in tests that build their own Keycloak redirect

**Status:** `TODO` · **Type:** Bug Fix (e2e test) · **Depends on:** none (AUTH-16 added the dialog and the suppression in `signIn()`)

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

**Out of scope:** changing the dialog's behaviour in the app (it is correct), the e2e retry count, visual-regression baselines.

**Tests / docs:** the change is to e2e specs and the stub only, so no new test; if a spec's test list changes, update `client/docs/E2E_OVERVIEW.md` (§3 and §6). The Phase 5 result of `/workon` must name the `--repeat-each` evidence.

**i18n / enums / account lifecycle:** none; no user-visible text, no backend contract.
