# ACCOUNT-6 · Two ways to confirm: current password or an emailed code (deactivate and change password)

**Status:** `DONE` (2026-10-19) · **Type:** Bug follow-up / Enhancement · **Depends on:** backend **U24** (done on its branch: the contract below is built and tested)

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

## Design (approved 2026-10-19)

Scope locked with no additions. Decisions taken in the pickup:

- Radios are "My password" and "A code sent by email" (not "Current password": that label belongs to the input and the e2e locators match it exactly). The dialog opens on the password method.
- `user.email === null` (phone-only) disables the email method up front with the reason; the server's `VERIFICATION_EMAIL_UNAVAILABLE` is still handled.
- A wrong password shows its error plus "Signed in with Google, or not sure of a password? Use an emailed code instead" (one click switches). There is no profile field to say beforehand whether the account has a password.
- `PASSWORD_ATTEMPTS_EXCEEDED` (429, `errorParams.seconds` = the remaining life of the backend's 15-minute wrong-password window, up to 900): the password radio is disabled and the dialog moves to the code, with "try again in m:ss". Without an email, the password stays and shows the lock.
- `VERIFICATION_RESEND_TOO_SOON`: no error shown; the countdown restarts from `seconds` and a code counts as sent. `VERIFICATION_CODE_EXPIRED` / `_ATTEMPTS_EXCEEDED` clear the code input; `VERIFICATION_CODE_INVALID` keeps it.
- `NEW_PASSWORD_REJECTED` (change password): shown on the new-password field.
- The code-resend countdown is local to the dialog (reset on close), so reopening starts fresh. The password lock is not: the backend counts wrong passwords per user, so deactivate and change password share one allowance, and the client keeps one lock to match (`app/passwordLockStore`, in memory, cleared when the signed-in user changes). Lock it in one dialog and the other opens already locked. The "Try again in m:ss" line shows above both methods, so it stays visible after the move to the code.

## Built

- **Data layer** (`features/profile`): `confirmationProof.ts` (proof type, `proofBody`, `digitsOf`, which codes belong to which field), `useConfirmationCode` (`POST /users/me/confirmation-code`), `useChangePassword` and `useDeactivateAccount` now take a proof and return `errorCode` and `passwordLockSeconds`; `shared/lib/useCountdown.ts` (`start(seconds)`, deadline-based; the clock is read in the event handler because `Date.now()` during render breaks the `react-hooks/purity` rule).
- **Components** (`shared/components`): `ConfirmationProofFields` (radio + the two methods), `useConfirmationProofState`, `PasswordInput` (extracted; the toggle is optional), `ChangePasswordDialog` and `DeactivateAccountDialog` rebuilt on them, `AppShell` passes `hasEmail`, `codeSender` and the lock. `RadioGroup` options can be `disabled`.
- **Errors and copy:** `ErrorCategory` gains `RATE_LIMITED` (429); en and vi for the 8 codes, the 429 category, and `accountSettings:confirm.*` (the change-password intro now reads "Confirm it's you, then choose a new password…").
- **Tests:** Vitest (both dialogs: each method, lock, no email, each code error; the two hooks; `useConfirmationCode`; `useCountdown`; the code copy in en and vi; the 429 category), Storybook states for each radio choice, the countdown, can-resend, send failure, wrong and expired code, lock, phone-only, new-password rejected; MSW `/users/me/confirmation-code` and both proofs on the deactivate and password handlers with the real shapes (`mockVerificationCode`, `mockExpiredCode`, `mockLockedPassword`, `password1` = realm policy refusal); `account-deactivate` +5 and `account-change-password` +4 e2e tests.
- **Docs:** I18N-4 census rows for both dialogs, `E2E_OVERVIEW.md` catalog.

## Verification

- tsc: only the 3 pre-existing `e2e/` type errors (identical on a stashed tree); eslint: 0 errors (2 pre-existing warnings).
- Vitest, scoped: profile hooks, both dialogs, `useCountdown`, the error-code copy, `App`, the locale checks: all green.
- **E2E:** `e2e` project, the three account specs (`account-change-password`, `account-deactivate`, `account-settings-unsaved`): 23 passed. The full suite was not run (scoped, by standing instruction).
- **Visual-regression expectation:** baselines `account-settings-change-password-{375,768,1280}.png` and `account-settings-deactivate-{375,768,1280}.png` legitimately change (the dialogs gained the method radio) and are expected to fail until the `update-baselines` GitHub dispatch regenerates exactly those six files; `account-settings-default-*` and every other baseline must come back byte-identical. The `account-settings` visual spec was run: 6 of 9 failed on this Windows host, including the untouched `account-settings-default` (the documented noise floor), so the failures carry no signal until the dispatch. **Executed by AUTH-19 (2026-10-22): the dispatch artifact was classified by SHA-256 against the committed set and exactly the 90 predicted files differed (84 new, 6 changed), the other 153 byte-identical; commit `160ee0c`.** The six changed files are exactly `account-settings-change-password-{375,768,1280}` and `account-settings-deactivate-{375,768,1280}`; `account-settings-default-*` came back identical. Human check at 1280: both dialogs show the "My password" / "A code sent by email" radio above the field.
- **Not tested:** a walk in a real browser against the running backend and Keycloak, and a real emailed code through Mailpit. The backend contract is covered by U24's integration tests (`AccountConfirmationIntegrationTest`); the client mirrors it through MSW.

## Done when

A user who signed in with Google, with a password, or with both can deactivate their account and change their password from Account Settings by either method, in en and vi, with the countdown, and the I18N-4 census rows for both dialogs are updated.
