# ACCOUNT-3 · Change-password section in Account Settings

**Status:** `DONE` (2026-10-13)
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

## Scope decisions (user, 2026-10-13, at pickup)

- **Separate dialog, not an inline section** (diverged from the first plan): the settings modal already holds many fields, so a "Change password" button opens a stacked `ChangePasswordDialog`, built like `DeactivateAccountDialog`. Side effect: the ACCOUNT-5 unsaved-changes guard is untouched.
- **Session continues after a change.** The backend `changePassword` only swaps the hash and revokes nothing, so signing out would be theatre (per-session revocation is backend A15/A18).
- **No backend change.** Checked: `ChangePasswordRequest.currentPassword` is `@NotBlank`, `UserServiceImpl.changePassword` verifies it against the stored hash (`CURRENT_PASSWORD_INCORRECT`), rejects a deactivated caller (`findByIdAndIsActiveTrue`), and is covered by `UserServiceImplSpec` and `UserErrorCodesIntegrationTest`. The backend does not reject a new password equal to the current one; left as is.

## Implementation summary

- `useChangePassword` (`features/profile`): `PUT /users/me/password { currentPassword, newPassword }`, `meta.errorDisplay: 'inline'`; returns the localized `errorMessage` plus `isCurrentPasswordError` (code `CURRENT_PASSWORD_INCORRECT`) so the dialog can put that error on the current-password field.
- `ChangePasswordDialog` (`shared/components`): current / new / confirm fields, an independent show-hide toggle on each of the three fields (a local `PasswordInput`; the browser's own reveal button is hidden in `index.css`), custom validation (`noValidate`) shown after the first submit attempt (new ≥ 8 characters, confirm matches — the confirm is client-only); submit disabled until a current password is typed; current-password field is `readOnly` until focused (same autofill guard as the deactivate dialog). Mounted by `AppShell` only while open, so typed passwords never outlive it.
- `AccountSettingsModal`: new optional `onChangePassword` prop; a "Password" section (above "Deactivate account") renders only when given.
- `AppShell`: owns the dialog and mutation; on success closes the dialog and shows a `sonner` toast ("Your password was updated."); Account settings stays open underneath.
- i18n (en + vi, same ticket): `accountSettings:section.password`, `password.*`, `changePasswordDialog.*`; `CURRENT_PASSWORD_INCORRECT` copy already existed. I18N-4 census row added.
- MSW: `PUT /api/users/me/password` in `handlers/auth.ts` (400 `VALIDATION_FAILED` with per-field errors, 400 `CURRENT_PASSWORD_INCORRECT`, 200).
- Tests: Vitest for the hook (3), dialog (8) and modal section (2); Storybook `ChangePasswordDialog` (Default / Submitting / WrongCurrentPassword / GeneralError) and `AccountSettingsModal` `WithChangePassword`; `e2e/flows/account-change-password.spec.ts` (4); `E2E_OVERVIEW.md` updated.

## Verification

- tsc clean, eslint clean on the touched files. Scoped Vitest: new/changed files 44 passed; locale guard + `App.test` 18 passed.
- **E2E:** `e2e` project, scoped to the specs touching Account Settings / the shell (`account-change-password`, `account-deactivate`, `account-settings-unsaved`, `a11y`, `profile-journey`, `user-errors`, `notification-bell`, `admin-route-guard`): 71 passed, no flakes. Full suite not run (token-saving rule).
- **Visual-regression expectation:** no baselined surface touched (no visual baseline covers `AccountSettingsModal`) — no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run.
- Storybook stories written but not opened; not checked against a live backend or by hand in a browser (the backend contract is covered by its own integration test).
- IT changes: none — no backend change.

## Scope change (user, 2026-10-13, after review)

- **Success toast is now a proper app pattern.** `toast.success` was the first success toast in the app (every other toast is an error); `ErrorToaster` now themes sonner's success style from design tokens (`--success-*` -> `surface-2` / `text-success` / `border-strong`), and its stories gain a Success button.
- **Saving Account Settings also confirms with a toast** ("Your account settings were saved." / vi: "Đã lưu cài đặt tài khoản của bạn."), shown by `AppShell` after a successful save from the Save button or the unsaved-changes prompt. New key `accountSettings:saved`; `account-settings-unsaved.spec.ts` ("Save in the prompt...") now asserts it.
- Verified: tsc/eslint clean; `e2e` scoped to the account specs plus `profile-journey` and `user-errors` 18 passed, then `account-settings-unsaved` + `account-change-password` re-run after the last assertion edit 7 passed.

## Scope change #2 (user, 2026-10-13)

- **Account Settings stays open after a successful save** (toast only). `AccountSettingsModal.onSave` now takes `(payload, { onSuccess })`; the Save button's `onSuccess` resets the geo-edit flag (the profile/preferences caches are patched on save, so the other "edited" signals clear by themselves), which means closing afterwards does not trigger the ACCOUNT-5 unsaved-changes prompt. The prompt's own Save still saves and then closes everything.
- Tests: new e2e in `account-settings-unsaved.spec.ts` (Save keeps the modal open, toast, Save disabled again, Esc closes without a prompt); `profile-journey` step 7 no longer expects the modal to close on save (it checks the toast, then Esc without a prompt; the toast and dialog title are matched in en or vi since the saved language flips the UI locale); `AccountSettingsModal.test.tsx` `onSave` assertions take the extra options argument.
- Verified: tsc/eslint clean; Vitest `AccountSettingsModal` 33 passed; `e2e` scoped (`account-*`, `profile-journey`, `user-errors`, `a11y`) all passed after the fix.
