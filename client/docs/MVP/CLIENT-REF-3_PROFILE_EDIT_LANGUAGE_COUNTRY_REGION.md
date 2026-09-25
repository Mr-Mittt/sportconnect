# CLIENT-REF-3 · Profile edit: Language / Country / Region fields, translated

**Status:** `TODO`
**Type:** New Feature (replaces a free-text field)
**Depends on:** CLIENT-REF-1, CLIENT-I18N-1, backend **U16** (`countryId`/`regionId` on the profile update, validated language on
preferences) — hard-blocked on U16
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md` §§ 6, 11). Filed together with U16, which it consumes.

## What

"User can update these in their profile settings." `EditProfileModal` (`src/shared/components/EditProfileModal.tsx`) today
has a free-text **Country** input; replace it with `GeoLocaleFields`.

- **Country / Region:** saved through `useUpdateMyProfile` (`PUT /users/{id}/profile`) as `countryId` + `regionId`. Send both
  together whenever either changed (the server replaces the region when `countryId` is present; a null `regionId` clears it).
  The free-text `country` is **no longer sent** — update `profileEditDraft.ts` (drop the string diff, add ids) and the
  profile type mirrors (`features/profile/types.ts`: add `countryId`, `regionId`, `regionName`; `country` is now the
  server-resolved display name; `features/friends/types.ts`'s `country: string | null` stays a display string).
- **Language:** a preference, not a profile field — saved through `PUT /users/me/preferences`
  (`{ language: <code> }`) in the **same Save** as the profile update. If the profile call succeeds and the preference call
  fails (or vice versa), report which part failed and keep the modal open; do not pretend both saved. On success update
  `localeStore` so the UI switches immediately.
- **Location button:** reuses `GeoLocaleFields`' button; a granted position is sent as the profile's existing `location`
  field (`UpdateProfileRequest.location`), with the same "saved to your profile" consent copy as sign-up.
- Translate (en + vi): `EditProfileModal` and the geo/locale fields.
- Unsaved-changes handling (`SettingsUnsavedChangesDialog`-style behaviour, if `EditProfileModal` already has it) must
  treat the new fields as dirty state.
- MSW: extend the profile/user handlers and fixtures (`e2e/mocks/handlers/`) for `countryId`/`regionId`/`regionName` and the
  preferences route; keep types 1:1 with `UserResponse` / `UpdateUserPreferenceRequest`.

## Edge cases

- Existing users whose legacy free text was not matched to a country: `country` shows the legacy text read-only in the modal
  until they pick a real country (the Country select starts empty).
- Country changed → region cleared client-side before submit. A country without regions → region select disabled.
- The deactivated-user case is server-side (U16); a `404`/`403` on save surfaces the server message.
- **Placement note:** Language could later move to `ACCOUNT-1`'s account-settings modal (TopBar avatar dropdown). Not decided
  here — if ACCOUNT-1 is picked up first, revisit where the Language select belongs before building it twice.

## Tests

Vitest/RTL for `EditProfileModal` and `profileEditDraft` (id diffing, both-together rule, language saved via preferences,
partial failure). e2e: edit country/region/language and see them persist and the UI switch language; the location button
updates coordinates. **Visual regression:** `EditProfileModal`-bearing baselines change — list the expected-changed files at
close-out and regenerate through `update-baselines`. Update `client/docs/E2E_OVERVIEW.md` and the a11y spec.

**Out of scope:** sign-up (CLIENT-REF-2); clearing a country once set; moving Language to ACCOUNT-1; translating other screens.
