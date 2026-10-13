# AUTH-9 · Forgot-password and reset-password screens

**Status:** `DONE` (2026-10-13; first pass the same day, reopened for the page-load check and finished)
**Type:** Feature
**Depends on:** backend **A10** (auth backlog: `forgot-password` is a placeholder today and never issues a token), CLIENT-ERR-1 (done), A8 (done, the `RESET_TOKEN_*` codes)
**Filed:** 2026-10-05, found during **CLIENT-ERR-2** pickup. The client has no recovery route: no `/forgot-password` or `/reset-password` page and no caller of either endpoint, so a user who forgets their password has no way back in. CLIENT-ERR-2 deliberately skips the `RESET_*` copy because there is no screen to show it on; this ticket adds it.

## What

1. **`/forgot-password`**: an email form calling `POST /api/auth/forgot-password`. On success (the server always answers the same, whether or not the email exists) show a neutral "If an account exists for that email, we've sent a reset link" confirmation. No account-existence hint.
2. **`/reset-password?token=…`**: new-password form (with confirmation field) calling `POST /api/auth/reset-password` `{ token, newPassword }`. On success, send the user to `/login` with a "Password updated, sign in" notice. A missing `token` param shows the invalid-link state straight away.
3. **Entry point:** a "Forgot password?" link on `LoginForm`.
4. **Errors** (A8 codes, en + vi `errors:codes.<CODE>`): `RESET_TOKEN_INVALID` (404), `RESET_TOKEN_USED` (400), `RESET_TOKEN_EXPIRED` (400) each show an inline state on the reset page with a "Request a new link" action pointing to `/forgot-password`. Validation errors on the new password stay inline on the field.
5. Both routes are public (outside `ProtectedRoute`); a logged-in user opening them is redirected home.

**Localization:** en + vi for every string (client rule), including the page copy, button labels and the confirmation text.

**Reset-link contract:** the email's link target is backend config `app.email.reset-password-url` (default points at the old `:3000` port). A10 must set it to this route; agree the exact path with A10 at pickup.

**Tests:** Vitest/RTL per form (success, each error code, missing token), Storybook stories for each state, an e2e flow (MSW) for request-link then reset in `en` and `vi`, a11y pass. Update `client/docs/E2E_OVERVIEW.md`. New screens need `design-reference-*` and visual-regression coverage per `client/CLAUDE.md`.

**Out of scope:** email verification screens; changing the CLIENT-ERR-1 classifier contract.

## Scope decisions at pickup (2026-10-13)

- New-password rules match `RegisterForm` (8 characters minimum); the confirmation field is checked on the client only.
- A successful reset goes to `/login` with a notice, no auto-login (the backend revokes the user's refresh tokens on reset).
- The forgot form shows only the neutral confirmation and a "Back to sign in" link after sending; no resend control, because rate limiting (backend A5, moved to V1) is not built.
- The login form's typed email is passed to `/forgot-password` through router state (never the URL) and prefills the field.

## Delta (2026-10-13)

- **Visual-regression coverage was not added.** The spec asked for it, but no auth screen (`/login`, `/register`) has a baseline or a spec today, and baselines cannot be generated on a Windows host. Filed as **AUTH-13** (covers all four auth screens, with the missing `design-reference-*` HTML).
- **Reset-link contract needed no change.** Backend A10 already defaults `app.email.reset-password-url` to `http://localhost:5173/reset-password`, matching this route; prod sets `RESET_PASSWORD_URL`.

## Implementation summary

**Design (approved):** two public routes under `PublicOnlyRoute`, a "Forgot password?" entry on login, `useMutation` hooks with `errorDisplay: 'inline'`, presentational forms in `AuthShell`, copy keyed on the backend's `errorCode`, en and vi for everything.

**What was built** (`client/src/features/auth/`):
- `useForgotPassword` (`POST /auth/forgot-password`, returns `isSuccess` only: the server answers 200 whether or not the email exists) and `useResetPassword` (`POST /auth/reset-password`, exposes `errorCode`; `isResetLinkErrorCode` separates a dead link `RESET_TOKEN_*` from validation or transport errors).
- `ForgotPasswordForm` (email, custom `noValidate` validation per I18N-10, sent state), `ResetPasswordForm` (new password + confirm, one show/hide toggle for both), `ResetLinkProblem` (inline state with "Request a new link" and "Back to sign in").
- `ForgotPasswordPage`, `ResetPasswordPage` (reads `?token=`; a missing token or a `RESET_TOKEN_*` answer renders `ResetLinkProblem`; success navigates to `/login` with `state.passwordReset`). Routes added in `router.tsx`.
- `LoginForm`: "Forgot password?" link in the password label row (passes the typed email), `showPasswordResetNotice` prop; `LoginPage` sets it from router state.
- i18n: new namespaces `forgotPassword` and `resetPassword` (en, vi), `login` keys `form.forgotPassword` and `notice.passwordReset`, `errors:codes.RESET_TOKEN_INVALID`/`_USED`/`_EXPIRED` (en, vi). I18N-4 census gained the two new rows.
- MSW: `forgot-password` and `reset-password` handlers mirror the real backend (verified against a running backend: unknown email 200, blank email 400 `VALIDATION_FAILED`, unknown token 404 `RESET_TOKEN_INVALID`, short password 400 `VALIDATION_FAILED`); fixtures `mockResetToken`, `mockUsedResetToken`, `mockExpiredResetToken`.

**Key decisions / constraints:** the "Forgot password?" link sits before the password field in tab order, so `/login`'s Tab-order e2e test now expects it between Email and Password. The sent state never echoes the address back as "found". The reset flow never touches the access token or `authStore`.

**Divergence from the approved plan:** none in behavior. The plan's `I18N_READINESS.md` rows and the AUTH-13 follow-up are done; the plan's "Storybook story per state" is met with `ForgotPasswordForm` (default, prefilled, sending, sent, error, invalid submit), `ResetPasswordForm` (default, updating, error, mismatch), `ResetLinkProblem` (three codes) and a new `LoginForm` `PasswordResetNotice` story. Storybook was not opened in a browser in this session.

**Tests:** Vitest 105 passed across `src/features/auth`, `src/locales`, `src/app/i18n.test.ts` (new: 3 form specs, 2 hook specs, `ResetPasswordPage.test.tsx`, 3 `LoginForm` cases). `tsc -b` and eslint on the changed files clean.

**E2E:** scoped subset, not the full `e2e` project. Ran `password-reset.spec.ts` (new, 10 `test()`s), `a11y.spec.ts`, `auth-journey.spec.ts`, `auth-errors.spec.ts`: 63 passed; then `locale`, `admin-route-guard`, `admin-sports`, `msw-setup`, `post-deep-link`, `profile-journey`: 26 passed. These are every spec that references the login page. Full-suite e2e not run (standing token-saving rule); no failures, so no flake triage was needed.

**Visual-regression expectation:** no baselined surface touched — no baseline change expected; no spec screenshots `/login` or any other auth screen, so a failing `visual-regression` run would be the Windows noise floor, not a regression. Not run.

**IT changes report (backend):** none, client-only ticket. Contract checked by hand against `./gradlew :server:bootRun` (stopped afterwards).

## Scope change: check the reset link on page load (2026-10-13)

**Why:** hand-testing showed a used link still renders the form, and the user only learns it is dead after typing and submitting a password. Decision (user, same day): fold the check and the related backend ordering fix into this ticket and branch. The backend half is tracked as auth **A21** (`modules/auth/docs/MVP/A21_RESET_TOKEN_CHECK_ENDPOINT_AND_ATOMIC_RESET.md`).

**What changes here:**
- `ResetPasswordPage` calls the new `POST /api/auth/reset-password/validate` (body `{ token }`) when it opens, through a `useResetTokenCheck(token)` query. While it runs, a short "Checking your link…" state shows; a 404 `RESET_TOKEN_INVALID` (the one generic answer for an unknown, used or expired token) goes straight to `ResetLinkProblem`; success shows the form. A missing token still skips the request. The submit-time handling of `RESET_TOKEN_USED` / `_EXPIRED` stays: the token can change between load and submit.
- New en and vi string for the checking state; `errors:codes.RESET_TOKEN_INVALID` copy is reworded to cover used and expired links too (the load-time check no longer distinguishes them).
- MSW handler for the check endpoint (200 for `mockResetToken`, 404 `RESET_TOKEN_INVALID` for everything else); `useResetTokenCheck` and page tests; `password-reset.spec.ts` updated (a used or expired link now shows the problem state on load, before any submit).
- `ResetPasswordForm` stays as is; the I18N-4 census row for `/reset-password` is updated.
- Out of scope: rate limiting the check (backend A5, V1).

## Implementation summary: page-load check (2026-10-13, scope change above)

**Design (approved):** `ResetPasswordPage` calls `POST /api/auth/reset-password/validate` (backend **A21**, POST with a body, one generic 404 for any bad token) when it opens; a missing token or a 404 goes straight to `ResetLinkProblem`; the submit-time `RESET_TOKEN_*` handling stays.

**Built:**
- `useResetTokenCheck(token)` (`useQuery`, disabled without a token, `retry: false`, never cached or refetched): returns `{ isChecking, isLinkInvalid }`. Only a 404 `RESET_TOKEN_INVALID` counts as an invalid link: a transport or 5xx failure leaves the form usable, because the submit still tells the truth.
- `ResetPasswordPage`: a "Checking your link…" status while the check runs, then the form or the problem state.
- Copy: `resetPassword:checking` (en, vi); `errors:codes.RESET_TOKEN_INVALID` reworded in en and vi to cover used and expired links ("This reset link isn't valid, or it has already been used or has expired. Request a new one."), since the load check no longer says which.
- MSW: `POST /api/auth/reset-password/validate` handler (200 for `mockResetToken`, the same generic 404 for every other token, 400 for a blank one), mirroring the real backend.
- Tests: `useResetTokenCheck.test.tsx` (4), `ResetPasswordPage.test.tsx` rewritten (6: no request without a token, checking then form, invalid on load, form stays usable on a 5xx check, success to `/login`, expired at submit), `ResetLinkProblem` copy updated. `password-reset.spec.ts` is now 13 `test()`s: used, expired and unknown tokens show the problem state on load before any submit; one test asserts the check is a `POST` with the token in the body; one forces a used answer on submit after a good load.

**Divergence from plan:** none. The I18N-4 census row and `E2E_OVERVIEW.md` are updated.

**Verification:** Vitest `src/features/auth` + `src/locales`: 16 files, 96 passed; `tsc -b` and eslint clean. **E2E** (scoped subset, same as the first pass): `password-reset`, `a11y`, `auth-journey`, `auth-errors` 65 passed; the other six specs that reference the login page were not re-run, since nothing in them changed. Real backend: with the server running, the used token you tested (`20c9f4f8-…`) and an unknown token both answered the identical 404 `RESET_TOKEN_INVALID`, a blank token 400 `VALIDATION_FAILED`; server stopped afterwards.

**Visual-regression expectation:** no baselined surface touched, no baseline change expected; a failing `visual-regression` run would be the Windows noise floor. Not run.

**IT changes (backend, A21):** `PasswordResetIntegrationTest` +4 (check accepts a fresh token without consuming it; identical 404 for unknown, used and expired; blank token 400; a failed password update does not consume the token), `PublicSurfaceAccessIntegrationTest` gains the new path. Details in `modules/auth/docs/MVP/A21_RESET_TOKEN_CHECK_ENDPOINT_AND_ATOMIC_RESET.md`.
