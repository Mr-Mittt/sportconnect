# AUTH-9 · Forgot-password and reset-password screens

**Status:** `TODO` (blocked on backend **A10**, see Depends on)
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
