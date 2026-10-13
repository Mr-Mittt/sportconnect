# ACCOUNT-5 · Unsaved-changes guard on Account Settings

**Status:** `DONE` (2026-10-13)
**Type:** Enhancement
**Depends on:** ACCOUNT-1 (the modal), ACCOUNT-4 (the stacked deactivate dialog). Reuses `shared/hooks/useUnsavedChangesGuard` (PROFILE-10).
**Filed:** 2026-10-13, reported by the user while testing ACCOUNT-4: closing Account Settings with edits just discarded them silently.

## What

Closing `AccountSettingsModal` by any route (header close, Esc, outside click) with unsaved edits stacks an "Unsaved changes" dialog over it: **Discard changes** (closes the modal), **Save changes** (runs the modal's own save; the parent closes the modal on success; a failure shows its localized line inside the prompt), or the header close / Esc to keep editing (edits intact). With no edits the modal closes as before. The hook also blocks an in-app route change (browser Back) and adds the native `beforeunload` prompt.

## Implementation summary

- `AccountSettingsModal` wraps its close path in `useUnsavedChangesGuard(hasUserEdits)`; new `AccountSettingsUnsavedChangesDialog` (`shared/components`, copy in `accountSettings:unsaved.*`, en + vi) with stories. Same shape as `features/profile/`'s `SettingsUnsavedChangesDialog`, which was not reused because its text is about a sport profile.
- **`hasUserEdits` is deliberately narrower than `isDirty`** (what enables Save). A user with no stored language or country gets the UI locale and silent geo-detection pre-filled, which makes `isDirty` true on open without any edit; the first e2e run showed the prompt on a plain close. `hasUserEdits` = a text-field diff, or a geo/language handler (`onCountryChange`, `onRegionChange`, `onLanguageChange`, `onUseMyLocation`) fired.
- **ACCOUNT-4 interaction:** deactivation signs out while the modal is still mounted and dirty, and `useBlocker` blocks any navigation made while dirty. `AppShell` therefore no longer calls `navigate('/login')` after deactivating; it closes both dialogs and lets `ProtectedRoute` redirect once the modal (and its blocker) has unmounted. Covered by an e2e test with unsaved edits.
- Needs the app's data router (`useBlocker`): `AccountSettingsModal`'s tests and stories now wrap it in a memory data router.

## Tests

Vitest (`AccountSettingsModal.test.tsx`, +9): closes untouched; Close and Esc with edits prompt and do not close; Discard closes without saving; Save sends the edited payload; closing the prompt keeps the edits; the save error shows in the prompt; detection pre-fills do not count; a hand-picked language does. `e2e/flows/account-settings-unsaved.spec.ts` (3): untouched close; Esc, keep editing, Discard (no `PUT`); Save from the prompt. Plus one more in `account-deactivate.spec.ts` (deactivate with unsaved edits, no prompt).

## Verification

tsc clean, eslint 0 errors. Scoped Vitest (`AccountSettingsModal`, `AppShell`, `App.test`, `locales`): 46 passed. **E2E:** `e2e` project scoped to `account-settings-unsaved`, `account-deactivate`, `user-errors`, `profile-journey`, `a11y`, `locale`, `signup-locale`: 70 passed; full suite not run. **Visual-regression expectation:** no baselined surface touched (no baseline covers `AccountSettingsModal`) — no baseline change expected; a failing run is the Windows noise floor. Not run. Not checked by hand in a browser.

## Out of scope

The same guard for `EditProfileModal` and other modals with drafts.
