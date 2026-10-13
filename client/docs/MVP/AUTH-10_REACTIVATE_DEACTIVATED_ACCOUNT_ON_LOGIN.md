# AUTH-10 · Offer to re-activate a deactivated account when login answers `ACCOUNT_DEACTIVATED`

**Status:** `DONE` (2026-10-13) · **Type:** Feature · **Depends on:** backend **A9** (auth backlog) — adds `POST /api/auth/reactivate` and makes login answer `ACCOUNT_DEACTIVATED`. Do not start before A9 ships.
**Filed:** 2026-10-09, client half of A9.

## Contract (from A9)

- `POST /api/auth/login` with the **correct** email and password for a deactivated account → `401`, `errorCode: ACCOUNT_DEACTIVATED`, no tokens, no cookie. A wrong password for that account is still `INVALID_CREDENTIALS`.
- `POST /api/auth/reactivate` with `{ email, password }` (same body as login, public). It re-verifies the credentials, re-activates the account, and returns the same `AuthResponse` as login plus the refresh-token cookie, so the user is logged in. A wrong password → `INVALID_CREDENTIALS` and the account stays deactivated.
- `ACCOUNT_DEACTIVATED` never comes from `/auth/refresh` (a deactivated user's refresh is the generic `REFRESH_TOKEN_EXPIRED_OR_REVOKED`, i.e. "logged out, log in again").

## What ships

- On a login `ACCOUNT_DEACTIVATED`, open a confirm dialog: "Your account has been deactivated. Do you want to re-activate it?"
  - **Confirm** → call `/auth/reactivate` with the email and password the user just typed (the user does **not** re-enter them), then run the same success path as login (store the access token in memory, navigate as after login).
  - **Decline / close / Esc** → nothing is sent, the account stays deactivated, the user is back on the login form.
- The credentials are held in memory only for the life of that dialog (component or mutation state). Never in `localStorage`, `sessionStorage`, Zustand or the URL; cleared on decline, close, unmount and after success.
- Add `/auth/reactivate` to `NO_RETRY_URLS` in `client/src/app/apiClient.ts` (a 401 there is bad credentials, not an expired session).
- `useReactivate` mutation hook next to `useLogin`; errors on the reactivate call go through the same error-adaptation path as login (`INVALID_CREDENTIALS` etc.).
- **i18n (en + vi, same ticket):** dialog title, body, confirm and cancel labels. The existing `errors:codes.ACCOUNT_DEACTIVATED` copy ("This account has been deactivated.") stays as the fallback. Add the login form to the I18N-4 census row if it is not already covered.
- MSW handlers: login returning `ACCOUNT_DEACTIVATED` for a fixture email, and `/auth/reactivate`.

## Out of scope

- Forgot / reset password (AUTH-9; a deactivated user may reset their password and the account stays deactivated until they log in and confirm here).
- Rate-limit error surfacing (needs backend A5, V1).

## Tests

Vitest/RTL for the dialog and hook (confirm path, decline path, wrong password on reactivate, credentials cleared); Storybook story for the dialog; an e2e flow for login → dialog → confirm → logged in, and login → dialog → decline → still on login.

---

## Implementation summary (2026-10-13)

### Design (approved plan)

- `useLogin` gains an `onAccountDeactivated(payload)` option, fired from the mutation's `onError` with the submitted `variables` when the code is `ACCOUNT_DEACTIVATED`; the inline "This account has been deactivated." line stays as the fallback.
- New `useReactivate` (next to `useLogin`): `POST /auth/reactivate` with the same `LoginPayload`, sets the session like login, returns `{ reactivate, isPending, errorMessage, reset }`.
- New presentational `ReactivateAccountDialog` (visible title and body, Re-activate and Cancel, inline `role="alert"` for a failed re-activation).
- `LoginPage` holds `pendingReactivation: LoginPayload | null` in local state only; Confirm re-sends it, Cancel/close/Esc clear it and `reset()` the mutation; success navigates away (the page unmounts).
- `/auth/reactivate` added to `NO_RETRY_URLS` in `apiClient.ts`.

### What was built

`useReactivate.ts`, `components/ReactivateAccountDialog.tsx` (+ test, stories: Default/Submitting/ErrorState), `LoginPage.tsx` wiring, `useLogin.ts` option (stale TSDoc line about deactivated accounts getting `INVALID_CREDENTIALS` corrected), `login:reactivate.*` keys in en and vi, MSW (`mockDeactivatedEmail`; login answers 401 `ACCOUNT_DEACTIVATED` for it, new `/auth/reactivate` handler), `e2e/flows/auth-reactivate.spec.ts` (3 tests), `E2E_OVERVIEW.md` catalog, I18N-4 census row for `/login`.

### Decisions

- A wrong password on re-activation keeps the dialog open with the `INVALID_CREDENTIALS` line (confirmed at the scope gate).
- Declining leaves the form's fallback `ACCOUNT_DEACTIVATED` line visible under the login form.
- No change to the consumers of `useLogin` beyond `LoginPage`; the `NO_RETRY_URLS` change only adds an entry.
- No new backend contract: A9 is done and the endpoint was confirmed in `AuthController`/`SecurityConfig`.

### Verification

- tsc and eslint clean. Scoped Vitest (`src/features/auth`, `src/app`, `src/locales`): 32 files, 206 tests; one failure, the 5 s timeout in `noRawServerError.test.ts` under load, passes in isolation (2/2).
- **E2E:** `e2e` project, scoped to the specs touching login/auth (`auth-reactivate`, `auth-errors`, `msw-setup`, `password-reset`, `auth-journey`, `a11y`, `locale`): 80 passed (25 + 55). The full e2e suite was not run.
- **Visual-regression expectation:** no baselined surface touched (`/login` has no baseline, see AUTH-13) — no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run.
- Not verified against a live backend: MSW mirrors the contract read from `AuthController`, and `AccountReactivationIntegrationTest` covers the server side (A9).
- Storybook stories added, not opened in a browser.
