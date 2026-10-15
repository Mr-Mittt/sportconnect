# AUTH-14 · Redirect login, `/auth/callback`, ticket-based reactivate and nullable email

**Status:** `DONE` (2026-10-15) · **Type:** Feature · **Depends on:** backend A26 (and U23); the hosted-pages choice (**A24**). If A24 is a no-go, this ticket is rewritten for the hybrid.

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md` §5).

## What

- `/login` and `/register` redirect to Keycloak with a PKCE pair (the verifier kept only for the redirect, never a token in storage). New `/auth/callback` posts `{code, codeVerifier}` to `/api/auth/callback` and populates `authStore`.
- `ReactivateAccountDialog` and `useReactivate` use the `reactivationTicket` (no password field); cancelling tells the backend.
  - **Contract as built by backend A26 (2026-10-14):** the sign-in `POST /api/auth/callback {code, codeVerifier}` (verifier 43 to 128 characters) answers `401 ACCOUNT_DEACTIVATED` with the ticket in **`errorParams.reactivationTicket`** (not `data`, no cookie); `POST /api/auth/reactivate {ticket}` confirms (200 with the usual session response and cookie) and `POST /api/auth/reactivate/cancel {ticket}` declines (always 200). A ticket works once and lives 5 minutes; a failed confirm is `401 REACTIVATION_TICKET_INVALID` (restart the sign-in). A deactivated user who signed in through Google, Facebook or Zalo never sees the dialog: the backend re-activates them and returns the session.
  - `/api/auth/logout` is now **public and driven by the refresh cookie** (no Bearer needed, so it works with an expired access token); no cookie is still 200. It answers `503 SERVICE_UNAVAILABLE` and **keeps the cookie** when Keycloak cannot be reached: decide what the UI shows (drop the in-memory token and retry in the background, or tell the user the sign-out did not complete).
  - `apiClient`'s `NO_RETRY_URLS` should gain `/auth/callback`, `/auth/reactivate/cancel` (a 401 there is not an expired token) and keep `/auth/refresh`; a `503` on `/auth/refresh` must not log the user out.
- Delete the disabled Facebook, Google and Apple buttons from `LoginForm` / `RegisterForm` (Apple is out of scope), the forgot and reset pages, their hooks and tests. The theme (AUTH-15) shows the provider buttons.
- `email: string | null` in `auth/types.ts` and `profile/types.ts`, `TopBar`, `AppShell` and any form that shows it (the client follow-up of **A22**).
- **i18n:** every new or changed string gets `en` and `vi` keys here; add the new error codes (`errors:codes`) and update the I18N-4 census. Codes the callback flow can return (backend A26): `AUTH_CODE_INVALID`, `REACTIVATION_TICKET_INVALID`, `ACCOUNT_DEACTIVATED` (exists; its copy must now fit the dialog's ticket flow), `PHONE_ALREADY_USED`, `INVALID_PHONE_NUMBER`, `IDENTIFIER_REQUIRED`, `EMAIL_ALREADY_REGISTERED`, `SERVICE_UNAVAILABLE`. `REFRESH_TOKEN_INVALID` is no longer returned (its copy can go).
- **Tests:** unit and component tests, Storybook stories for the dialog and callback states; the existing auth e2e specs and MSW fixtures are reworked (MSW cannot cover a redirect; see AUTH-15); `E2E_OVERVIEW.md` updated.
- State the **Visual-regression expectation** (the AUTH-13 login/register baselines are removed or re-baselined by the `update-baselines` dispatch).

## Out of scope

The theme (AUTH-15), profile completion (AUTH-16), phone-only account UX (A22).

## Done when

Typecheck, Vitest and the scoped e2e are green; the redirect flow is walked against a real Keycloak; the visual-regression expectation line is in the summary.
## Scope decisions (2026-10-14, Phase 1 of the pickup)

- **Keycloak settings in the client:** the Keycloak base URL from a Vite env var (default `http://localhost:8081`), the realm `sportconnect` and the client id `sportconnect-web` as constants; the redirect URI is built from `window.location.origin`.
- **PKCE state across the redirect:** `{codeVerifier, state, returnTo}` in `sessionStorage`, read once and deleted on `/auth/callback` (not a token, so the no-token-in-storage rule holds). `returnTo` is the path `ProtectedRoute` redirected from.
- **`/register`:** a redirect to Keycloak's register page (`prompt=create`), in our design through the AUTH-15 theme. The client `RegisterForm`, `RegisterPage` and `useRegister` are deleted: the old `POST /api/auth/register` makes a local user whose tokens are accepted nowhere since A25, and a client form cannot create a Keycloak account.
- **Logout failure (`503 SERVICE_UNAVAILABLE`):** the backend keeps the refresh cookie, so the user would be signed back in on the next load or silently at Keycloak. The user stays signed in and gets an error dialog with two actions, **Try again** (repeats the logout) and **Stay signed in** (closes it). New en/vi copy and a Storybook story; the existing logout flow (`useLogout`) is reworked to drive it.

## Delta (2026-10-14, from auth A24 — go)

- **Locale at the redirect:** a bare `kc_locale=vi` on the first `/auth` request rendered English in A24. Send the standard `ui_locales=<i18n language>` and verify the themed page opens in Vietnamese (not verified in A24).
- **Remove AUTH-13's 21 auth baselines** (`auth-login-*`, `auth-register-*`, `auth-forgot-password-*`, `auth-reset-password-*`, each at 375/768/1280) together with the screens they cover; AUTH-15 baselines the theme pages instead.

## Implementation summary

### Approved design

- Keycloak settings in the client: `VITE_KEYCLOAK_URL` (default `http://localhost:8081`), realm `sportconnect` and client id `sportconnect-web` as constants, redirect URI from `window.location.origin`.
- `/login` and `/register` redirect to Keycloak with a PKCE S256 pair; `{codeVerifier, state, returnTo}` live in `sessionStorage` only across the redirect and are read once on `/auth/callback`. `/register` adds `prompt=create`; `ui_locales` carries the app language.
- `/auth/callback` checks `state`, posts `{code, codeVerifier}` once, returns to `returnTo` (the path `ProtectedRoute` supplied) and shows the ticket dialog for `ACCOUNT_DEACTIVATED`.
- A 503 on logout keeps the session and shows "Try again" / "Stay signed in". `apiClient` no longer clears the session when a refresh fails with a 5xx or no response.
- The client login, register, forgot- and reset-password pages, forms, hooks, stories, tests, locale files and `accountNoticeStore` are deleted; `email` is nullable.

### What was built

- `features/auth/`: `keycloak.ts`, `pkce.ts`, `redirectToKeycloak.ts`, `RedirectToKeycloakPage`, `AuthCallbackPage`, `useAuthCallback`, `useReactivate` (ticket: `reactivate` and `cancel`), `useLogout` (`failed`, `dismissFailure`, `onSignedOut`), and the components `AuthCallbackView`, `LogoutFailedDialog` (stories and tests for each); `ReactivateAccountDialog` keeps its props and now declines the ticket on close.
- `AppShell` and `AdminLayout` render `LogoutFailedDialog`; `TopBar` hides an absent email; `apiClient` `NO_RETRY_URLS` is `/auth/refresh`, `/auth/callback`, `/auth/reactivate`, `/auth/reactivate/cancel`.
- Copy: the `login` namespace gained `redirecting`, `callback.*` and `logoutFailed.*` (en and vi); `errors:codes` gained `AUTH_CODE_INVALID`, `REACTIVATION_TICKET_INVALID` and `SERVICE_UNAVAILABLE`, and `ACCOUNT_DEACTIVATED` now reads as a re-activation hint. The `register`, `forgotPassword` and `resetPassword` namespaces are gone; `login` stays because the AUTH-15 theme imports it. `PHONE_ALREADY_USED`, `INVALID_PHONE_NUMBER`, `IDENTIFIER_REQUIRED` and `EMAIL_ALREADY_REGISTERED` already had copy.
- I18N-4 census updated (login/register/forgot/reset rows replaced by the callback and logout rows).

### Divergences from the plan

- The "log in again to re-activate" hint (ACCOUNT-4) was dropped with `accountNoticeStore` (user decision: option 1), and `useDeactivateAccount` no longer raises it.
- The failure paths of `/auth/callback` (forged `state`, Keycloak `error`, missing PKCE entry) go through the same mutation as a backend failure (`exchange('invalid')`), because the lint rule `react-hooks/set-state-in-effect` forbids setting an error from the effect.
- `REFRESH_TOKEN_INVALID` had no client copy, so there was nothing to remove.
- The unused `INVALID_CREDENTIALS` and `RESET_TOKEN_*` copy in `errors:codes` was left in place (harmless; a backend that still sends them is rendered).

### Consumer census (final)

| Consumer | Result |
|---|---|
| `useLogin`, `LoginForm`, `LoginPage`, `useRegister`, `RegisterForm`, `RegisterPage`, forgot/reset pages, forms and hooks | deleted here |
| `useReactivate`, `ReactivateAccountDialog`, `useLogout`, `AppShell`, `AdminLayout`, `apiClient`, `TopBar`, `User`/`UserResponse` `email` | updated here |
| `useDeactivateAccount` | updated here (drops the notice) |
| `ChangePasswordDialog` (ACCOUNT-3), the deactivate password confirmation (ACCOUNT-4) | deferred: filed **ACCOUNT-6**, blocked on backend U24 |
| e2e specs signing in through the refresh cookie | compatible as-is (they now go through `signIn` in `seedAuthenticatedSession`) |
| `auth-journey`, `auth-errors`, `auth-reactivate`, `msw-setup`, `locale`, `admin-*`, `account-deactivate`, `a11y` | updated here; `password-reset`, `signup-locale`, `visual/auth-screens` deleted |
| The AUTH-15 theme (imports `locales/*/login.json`, `AuthShell`, `CommunityIllustration`) | compatible as-is; noted in AUTH-15's Delta |

### Verification

- `tsc -b` and `eslint` clean (two pre-existing warnings in `SessionStartTimePicker.tsx`).
- Vitest, scoped to `features/auth`, `app`, `shared/components`, `features/admin`, `useDeactivateAccount` and `App.test.tsx`: 78 files green after reworking five `App.test.tsx` routing tests (14/14 there).
- **E2E:** `e2e` project, 14 spec files run (the 5 auth specs, `admin-route-guard`, `admin-sports`, `account-deactivate`, `locale`, `a11y`, `post-deep-link`, `profile-journey`, `session-errors`, `post-errors`): **76 passed**. A first, narrower run had two timeouts in `auth-journey` (a second `signIn` inside one test, 30 s timeout under 5 parallel workers); an isolated re-run of that spec passed 4/4 and the later 76-test run passed, so it was load, not a regression. The other ~19 flow specs were not run: they sign in through the same `seedAuthenticatedSession` helper, which the 76 tests exercise, and they touch no auth code.
- **Real Keycloak walk** (headless Playwright against the Compose Keycloak, `bootRun` and Vite on :5173, with a throwaway user that was deleted afterwards, together with its local `users` row): a protected deep link `/groups` redirected to the Keycloak sign-in with the S256 request and `ui_locales=en`; the stock login form returned to `/groups` through `POST /api/auth/callback` (200); a reload restored the session through `/api/auth/refresh`; Log out called `POST /api/auth/logout` (200) and ended on the Keycloak sign-in; `/register` reached Keycloak's registration form with `prompt=create`; a forged `state` showed the localized error without a backend call. **Not walked against the real backend:** the deactivated-user ticket dialog and the 503 logout (covered by Vitest and e2e with mocks), and `ui_locales=vi` on Keycloak's page (the client sends it; the themed page is AUTH-15).

### IT changes

No backend IT: this is a client-only change against the A26 contract (its integration tests belong to A26). Client tests: added `pkce.test.ts`, `redirectToKeycloak.test.ts`, `AuthCallbackPage.test.tsx`, `AuthCallbackView.test.tsx`, `LogoutFailedDialog.test.tsx`; rewrote `useReactivate.test.tsx` and `useLogout.test.tsx`; updated `apiClient.test.ts` (5xx refresh keeps the session; new no-retry URLs), `useDeactivateAccount.test.tsx`, `App.test.tsx`, `i18n.test.ts`. E2E: new `auth-logout-failed.spec.ts` (3) and `mocks/keycloakStub.ts`; reworked `auth-journey` (4), `auth-errors` (4), `auth-reactivate` (3), `msw-setup`; deleted `password-reset` and `signup-locale`.

### Visual-regression expectation

(b) The 21 baselines `auth-{login-default,login-password-updated,register-default,forgot-password-form,forgot-password-sent,reset-password-form,reset-password-link-problem}-{375,768,1280}.png` were **deleted** with `visual/auth-screens.spec.ts` (their screens no longer exist); no baseline is added or changed, so nothing needs the `update-baselines` dispatch. Every other baseline must come back byte-identical; a failing `visual-regression` run on this Windows host is the documented noise floor. `visual-regression` was not run (no baselined surface was rendered differently).
