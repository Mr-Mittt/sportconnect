# ACCOUNT-3 · Change-password section in Account Settings

**Status:** `TODO`
**Type:** Feature
**Depends on:** CLIENT-ERR-1 (done), CLIENT-ERR-3 (adds the `CURRENT_PASSWORD_INCORRECT` en/vi copy), backend `PUT /api/users/me/password` (exists; U21 codes `CURRENT_PASSWORD_INCORRECT`)
**Filed:** 2026-10-05, found during **CLIENT-ERR-3** pickup. The client has no caller of `PUT /api/users/me/password` and no UI for it, so a signed-in user cannot change their password. CLIENT-ERR-3 adds only the error copy.

## What

1. A "Change password" section in `AccountSettingsModal` (or a sub-view of it): current password, new password, confirm new password.
2. A `useChangePassword` mutation (`meta.errorDisplay: 'inline'`) calling `PUT /api/users/me/password`; verify the exact request shape against the backend DTO at pickup.
3. `CURRENT_PASSWORD_INCORRECT` (400) shows inline on the current-password field; `VALIDATION_FAILED` shows inline per field; success shows a confirmation and clears the form.
4. After a successful change, decide at pickup whether the session continues or the user is signed out (check what the backend revokes).

**Localization:** en + vi for every string (client rule).

**Tests:** Vitest/RTL for the form and hook, Storybook stories per state, MSW handler, e2e flow, `E2E_OVERVIEW.md` update.

**Out of scope:** forgot/reset password (AUTH-9).
