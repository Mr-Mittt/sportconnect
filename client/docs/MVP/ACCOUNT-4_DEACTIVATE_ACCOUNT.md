# ACCOUNT-4 · Deactivate account from Account Settings

**Status:** `DONE` (2026-10-13)
**Type:** Feature
**Depends on:** backend **U22** (`POST /api/users/me/deactivate`, user backlog — built in the same change); pairs with AUTH-10 (the way back).
**Filed:** 2026-10-13, found right after AUTH-10: the app could offer re-activation but had no way to deactivate.

## What

A "Deactivate account" section at the bottom of `AccountSettingsModal`. Clicking its button opens a confirm dialog **stacked over** the settings modal (which keeps its unsaved edits; Cancel/Esc returns to it) that asks for the current password (the confirmation, verified server-side). On success the user is signed out and lands on `/login` with a notice that logging in again re-activates the account (AUTH-10's dialog takes it from there). A wrong password keeps the dialog open with the localized `CURRENT_PASSWORD_INCORRECT` line. Cancel/Esc closes and sends nothing.

Decisions (user, 2026-10-13): backend and client built in one pass on the AUTH-10 branch; password re-entry as the confirmation.

## Implementation summary

- `useDeactivateAccount` (`features/profile`): `POST /users/me/deactivate { currentPassword }`, `meta.errorDisplay: 'inline'`; on success raises the login notice, clears the session, calls `onSuccess`.
- `features/auth/accountNoticeStore.ts`: a one-flag in-memory store carrying the "you deactivated your account" hint across the sign-out redirect. **Diverged from the first design:** the notice first rode on router state, but clearing the session while `AppShell` is mounted makes `ProtectedRoute` redirect to `/login` itself and replace that state; navigating to `/login` before clearing hit `PublicOnlyRoute`'s redirect to `/`. A store flag is the only carrier that survives both.
- `DeactivateAccountDialog` (`shared/components`): password field, Deactivate (disabled until typed; Enter submits) and Cancel, inline `role="alert"` error. Mounted by `AppShell` only while open, so the typed password is dropped on close.
- `AccountSettingsModal`: new optional `onDeactivate` prop; the section renders only when it is given. `AppShell` opens the dialog on top of it (changed after review: it first replaced the settings modal, which lost edits and left nothing to return to); on success both close and `ProtectedRoute` redirects to `/login` (no explicit `navigate`, see ACCOUNT-5). The password input is `readOnly` until first focus because Chrome autofilled the saved password into it despite `autocomplete="new-password"`.
- `LoginForm`/`LoginPage`: `showDeactivatedNotice` (a `role="status"` hint); `LoginPage` reads the flag and clears it on a successful login or re-activation.
- i18n (en + vi, same ticket): `accountSettings:section.deactivate`, `deactivate.*`, `deactivateDialog.*`, `login:notice.accountDeactivated`; `CURRENT_PASSWORD_INCORRECT` copy already existed. I18N-4 census row added.
- MSW: `POST /api/users/me/deactivate` in `handlers/auth.ts` (200 for `mockPassword`, 400 `CURRENT_PASSWORD_INCORRECT` otherwise, 400 `VALIDATION_FAILED` for blank).
- Tests: Vitest for the hook, dialog, modal section, `LoginForm` notice and `LoginPage` flag; Storybook `DeactivateAccountDialog` stories (Default/Submitting/WrongPassword); `e2e/flows/account-deactivate.spec.ts` (4 tests); `E2E_OVERVIEW.md` updated.

## Verification

- tsc clean, eslint 0 errors (2 pre-existing warnings). Scoped Vitest: 20 files / 144 tests green (auth, `useDeactivateAccount`, `AccountSettingsModal`, `DeactivateAccountDialog`; the locale guard tests passed in an earlier run).
- **E2E:** `e2e` project, scoped to the specs touching login/Account Settings (`account-deactivate`, `auth-reactivate`, `password-reset`, `auth-journey`, `a11y`, `user-errors`, `profile-journey`): 71 passed. Earlier in the session `locale` also passed. The full e2e suite was not run.
- **Visual-regression expectation:** no baselined surface touched (no visual baseline covers `AccountSettingsModal` or `/login`) — no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run.
- Not checked against a live backend or in a browser by hand; the contract is covered by U22's `SelfDeactivationIntegrationTest`.

## Out of scope

Change-password UI (ACCOUNT-3), deleting data, a grace period.
