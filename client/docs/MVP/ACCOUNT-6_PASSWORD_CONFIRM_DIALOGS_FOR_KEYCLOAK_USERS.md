# ACCOUNT-6 · Two ways to confirm: current password or an emailed code (deactivate and change password)

**Status:** `TODO` · **Type:** Bug follow-up / Enhancement · **Depends on:** backend **U24** (done on its branch: the contract below is built and tested)

**Filed:** 2026-10-14, found in the AUTH-14 pickup census; **rewritten 2026-10-19** with the contract backend U24 shipped (the owner chose "current password **or** a code emailed to the account", with a 60 second resend countdown).

## What

`ChangePasswordDialog` (ACCOUNT-3) and `DeactivateAccountDialog` (ACCOUNT-4) ask only for the current password. Since U24 the backend takes **one of two proofs** on both endpoints. Add a radio choice to both dialogs:

1. **Current password** (as today). Keycloak checks it; an account with no password (Google-only) always gets `CURRENT_PASSWORD_INCORRECT`, so the user switches to method 2.
2. **Verify by email**: a **Send code** button, then a code input. After a send the button is disabled for the `resendAfterSeconds` the response names (60) with a visible countdown, then reads **Resend**. The code is 6 digits, valid `expiresInSeconds` (900, 15 minutes), pasted by the user (accept spaces; `inputMode="numeric"`, `autocomplete="one-time-code"`).

### Contract (backend U24, `modules/user/user-impl/docs/MVP/U24_*.md`)

- `POST /api/users/me/confirmation-code` `{ purpose: "DEACTIVATE" | "CHANGE_PASSWORD" }` -> `200 { data: { resendAfterSeconds: 60, expiresInSeconds: 900 } }`.
- `POST /api/users/me/deactivate` `{ currentPassword? , verificationCode? }` and `PUT /api/users/me/password` `{ currentPassword?, verificationCode?, newPassword }`: **exactly one** proof (the client sends only the chosen one).
- A code is bound to its purpose: a code asked for in the deactivate dialog cannot confirm a password change.

### New error codes to show (en and vi, `errors:codes`, plus the I18N-4 census rows for both dialogs)

| Code | Status | Meaning for the user |
|---|---|---|
| `VERIFICATION_CODE_INVALID` | 400 | The code is not correct (field error on the code input; the input keeps its value). |
| `VERIFICATION_CODE_EXPIRED` | 400 | No code is waiting or it has expired: ask for a new one (re-enable **Send code**). |
| `VERIFICATION_CODE_ATTEMPTS_EXCEEDED` | 400 | Too many wrong codes, this one is dead: ask for a new one. |
| `VERIFICATION_EMAIL_UNAVAILABLE` | 400 | The account has no email (phone-only): hide or disable method 2 and say why; method 1 stays. |
| `VERIFICATION_RESEND_TOO_SOON` | 429 | `errorParams.seconds`: restart the countdown from it (a second tab or a reload can hit this). |
| `PASSWORD_ATTEMPTS_EXCEEDED` | 429 | `errorParams.seconds`: too many wrong passwords; disable method 1 for that long and point to the email code. |
| `NEW_PASSWORD_REJECTED` | 400 | Change password only: the new password does not meet the password rules (field error on the new password; nothing was changed). |
| `CONFIRMATION_REQUIRED` | 400 | Should not happen from the UI (it sends one proof); generic copy. |
| `CURRENT_PASSWORD_INCORRECT` | 400 | Existing copy; for a Google-only account add a hint to use the email code. |
| `SERVICE_UNAVAILABLE` | 503 | Existing: Keycloak or the code store is down; retry. |

Also add a category copy for the new **429** (`RATE_LIMITED`, `documentation/md/ERROR_CODES.md`) so an uncoded 429 never shows raw English.

## Behaviour notes

- The countdown survives closing the confirmation step inside the same dialog session only; a reload may meet `VERIFICATION_RESEND_TOO_SOON`, handle it as above.
- A successful deactivate keeps ACCOUNT-4's behaviour (sign out, land on `/login`); a successful password change closes the dialog with the existing success toast. Other sessions stay signed in (backend decision).
- MSW handlers (`client/e2e/mocks/handlers/auth.ts`) for the new endpoint and both proofs, with the real error shapes; e2e `account-change-password` and `account-deactivate` cover both methods; Storybook states for each radio choice, the countdown, and each error.

## Out of scope

The backend (U24). Showing whether the account has a password (would need a new field on the profile response). The phone-only recovery path (auth A22, parked).

## Done when

A user who signed in with Google, with a password, or with both can deactivate their account and change their password from Account Settings by either method, in en and vi, with the countdown, and the I18N-4 census rows for both dialogs are updated.
