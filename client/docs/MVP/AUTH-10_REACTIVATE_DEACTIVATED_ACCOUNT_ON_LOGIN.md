# AUTH-10 · Offer to re-activate a deactivated account when login answers `ACCOUNT_DEACTIVATED`

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend **A9** (auth backlog) — adds `POST /api/auth/reactivate` and makes login answer `ACCOUNT_DEACTIVATED`. Do not start before A9 ships.
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
