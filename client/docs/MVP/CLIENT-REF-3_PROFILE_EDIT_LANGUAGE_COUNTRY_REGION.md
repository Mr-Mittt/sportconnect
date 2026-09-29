# CLIENT-REF-3 · Profile edit: Language / Country / Region fields, translated

**Status:** `DONE` (2026-09-29)
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

## Scope change (2026-09-29, user decision at pickup)

`EditProfileModal`'s free-text **City** input is **dropped**, replaced by `GeoLocaleRegionField`
(the same Region select Country/Region already needs) — not kept alongside it. Investigated: no
backend migration needed. `users.city` is a plain, unrelated free-text column (no link to
`regions`, unlike `country`'s U16 backfill — city-to-region text matching is far fuzzier than the
~250-country case and not worth building). It stays on the backend untouched, just no longer
written from this form going forward; existing `city` text is not backfilled into `regionId` (same
"legacy, unmatched, shown read-only until replaced" acceptance already given to country's legacy
text below).

**Also folded in:** `ProfileHeader`'s handle line (`@username · city`) switches to `regionName`,
with **no fallback to the legacy `city` string** (user decision, 2026-09-29) — unlike `country`'s
own legacy-text fallback. An existing user with `city` set but no `regionId` yet simply shows no
location segment until they pick a region. Accepted as intentional: `city` is being fully retired
(U19), not kept alive as a display fallback.

**Not in scope:** any backend `city`→`regionId` backfill/migration, and dropping the `city` column
or `UpdateProfileRequest.city`/`UserResponse.city` fields themselves (left as-is, just unused by
this form and by `ProfileHeader` going forward).

## Edge cases

- Existing users whose legacy free text was not matched to a country: `country` shows the legacy text read-only in the modal
  until they pick a real country (the Country select starts empty).
- Country changed → region cleared client-side before submit. A country without regions → region select disabled.
- **Contract shipped (backend U16, 2026-09-26), verified live:** `PUT /users/{id}/profile` takes `countryId` / `regionId` (the free-text
  `country` is gone); a bad selection is a `400` with a readable `message` and applies **nothing** (not even other fields in the same
  request). `UserResponse` returns `country` (resolved name, else legacy text), `countryId`, `regionId`, `regionName`. `PUT /users/me/preferences`
  now `400`s on a `language` that is not an active reference language code; both preference calls `404` for a deactivated caller.
- **Gap between backend U16 and this ticket (accepted 2026-09-26):** once U16 merges, the *current* `EditProfileModal` still sends
  free-text `country`, which the server now silently ignores — a typed country appears to save but does nothing. Ship this ticket
  promptly after U16, or hide the country field until it lands. Also: on the profile update, `countryId` present means `regionId`
  *replaces* the region, so an absent `regionId` clears it — always send both together (as the both-together rule above already says).
- The deactivated-user case is server-side (U16); a `404`/`403` on save surfaces the server message.
- **Placement note:** Language could later move to `ACCOUNT-1`'s account-settings modal (TopBar avatar dropdown). Not decided
  here — if ACCOUNT-1 is picked up first, revisit where the Language select belongs before building it twice.

## Tests

Vitest/RTL for `EditProfileModal` and `profileEditDraft` (id diffing, both-together rule, language saved via preferences,
partial failure). e2e: edit country/region/language and see them persist and the UI switch language; the location button
updates coordinates. **Visual regression:** `EditProfileModal`-bearing baselines change — list the expected-changed files at
close-out and regenerate through `update-baselines`. Update `client/docs/E2E_OVERVIEW.md` and the a11y spec.

**Out of scope:** sign-up (CLIENT-REF-2); clearing a country once set; moving Language to ACCOUNT-1; translating other screens.

## Implementation summary (2026-09-29)

Built per the design above plus the Scope change section, with one more Delta below (location
consent copy).

**Types/draft (`features/profile/types.ts`, `profileEditDraft.ts`):** `UserResponse` gained
`countryId`/`regionId`/`regionName`; `country`'s doc comment updated to "server-resolved display
name only, never submitted." `UpdateProfilePayload`/`ProfileEditDraft` dropped `country` *and*
`city` (Scope change); `UpdateProfilePayload` gained `countryId?`/`regionId?`/`location?`. New
`applyGeoSelection(payload, user, geo)` — separate from `buildProfileUpdatePayload` since Country/
Region/location come from `useGeoLocaleFieldsData`'s own state, not `ProfileEditDraft` — applies
the "both together" rule (`geo.countryId !== user.countryId || geo.regionId !== user.regionId` →
include whichever of `countryId`/`regionId` is non-null; a cleared `regionId` is simply omitted,
which is exactly the server's "absent means clear" semantics for a plain nullable field).

**`useGeoLocaleFieldsData`** (shared with sign-up, `shared/hooks/`) gained an optional
`initial?: { languageCode?, countryId?, regionId? }` param, fully backward-compatible
(`RegisterForm` still calls it with no args). A non-null seed pre-marks that field `touched` — a
stored value is a real prior choice, so the mount's silent resolve (and a later "Use my location"
click) never silently overwrites it, same "an edit always wins over detection" rule the hook
already applied to a hand-pick.

**`EditProfileModal`** wires the hook directly (same "owns its own field state locally" precedent
`RegisterForm` set), replacing City with `GeoLocaleCountrySelect`/`GeoLocaleRegionField` (one row,
plus the location button) and adding `GeoLocaleLanguageField` paired with Phone number. New
`EditProfileSavePayload = { profile: UpdateProfilePayload; languageCode?: string }` — `languageCode`
is only ever set when it actually changed from the seeded preference, so the parent knows whether
to fire the preferences call at all. Legacy-country hint renders when `countryId` is `null` but
`country` still holds old free text. Translated via a new `profile` i18n namespace
(`src/locales/{en,vi}/profile.json`, registered in `app/i18n.ts`), reusing `common:geoLocaleFields.*`.

**Combined save** — two new hooks in `features/profile/`: `useUpdateMyPreferences` (`PUT
/users/me/preferences`, patches the `preferences` query cache on success — no manual `localeStore`
call needed, `useSyncUserLocale` already reacts to that same query's data changing) and
`useEditProfileSave` (the orchestrator `ProfilePage` calls): runs both mutations concurrently via
`Promise.allSettled`, only firing whichever side actually changed, and reports **which side failed**
distinctly (extracting the real server message from each settled result directly, not from the
sub-hooks' own `errorMessage` — reading those after the `await` would be a stale closure, since
they're computed from each hook's own render-time state). `useUpdateMyProfile` gained
`updateProfileAsync` (`mutateAsync`) alongside the existing `updateProfile` so it can be awaited.

**`ProfileHeader`** switches its handle line from `city` to `regionName`, deliberately **no**
fallback to the legacy `city` string (Scope change, user decision) — `city` is being fully retired
by backend **U19** (filed at this ticket's pickup), not kept alive as a display fallback.

**Delta on the location-button consent copy:** the ticket's own "What" section (above) says to
reuse "the same 'saved to your profile' consent copy as sign-up" — investigated at pickup and
sign-up (`RegisterForm`) has **no such copy today**, just the button's own hover title ("Use my
current location"/"Locating…"). Built with no additional consent sentence (reusing the existing
title/`aria-label` only) — the originally-recommended, not explicitly re-confirmed, resolution.
Revisit if a real consent sentence is wanted later.

**MSW:** `friends.ts`'s `PUT /users/:userId/profile` handler resolves `countryId`/`regionId` into
`country`/`regionName` display names from `reference.ts`'s `mockCountries`/`mockRegionsByCountryId`
fixtures (same "both together" semantics), no longer echoes a raw `country`/`city` string.
`preferences.ts` went from a fixed `GET`-only stub to a session-scoped `PUT`+`GET` pair (mirrors
`friends.ts`'s `myProfileState` pattern) — registered in `mockServer.ts`'s per-session reset list.
`mockMyProfile` (`fixtures.ts`) gained `countryId: null`/`regionId: null`/`regionName: null`
(exercises the legacy-country-hint / no-region-segment states by default).

**Tests:**
- Vitest/RTL: `EditProfileModal.test.tsx` rewritten for Country/Region/Language (seeding, legacy
  hint, both-together submit, language-only dirty/submit) — needed a `QueryClientProvider` +
  `apiClient` mocking wrapper (same pattern `RegisterForm.test.tsx` established), since the modal
  now calls real TanStack Query hooks. `useUpdateMyProfile.test.tsx` covers the new
  `updateProfileAsync`. `ProfileHeader.test.tsx` updated for `regionName`/no-fallback.
  `ProfilePage.test.tsx`/`.stories.tsx` gained the new mount-time GET/POST mocks the modal's hook
  now needs (fires regardless of the modal's own open state).
- `e2e` (`profile-journey.spec.ts`, step 6 expanded): legacy-country hint, bio + Country/Region/
  Language all filled via one "Use my current location" click (mirrors `signup-locale.spec.ts`'s
  coordinate fixture), `PUT .../profile` request body asserted for `countryId`/`regionId`/
  `location`, `ProfileHeader`'s new region-based handle line, and the live UI-language switch
  (reopening the modal renders it in Vietnamese). Step 1's handle-line assertion updated (no more
  `city` fallback). **Not run: the full `e2e` project** — only the directly-affected specs were
  re-verified this pickup: `profile-journey.spec.ts` (2/2) and the `profile page` subset of
  `a11y.spec.ts` (8/8), both green. `signup-locale.spec.ts`/`RegisterForm` are unaffected by the
  hook's new optional param (confirmed via the Vitest run above, not re-run under Playwright).
  One real environment gotcha hit and fixed along the way: the standalone Node mock server
  (`mockServer.ts`) doesn't hot-reload — a stale background instance from an earlier run served
  pre-edit fixture data and produced a false failure; killing it and letting Playwright's
  `webServer` respawn fixed it (not a code bug).
- Storybook: `EditProfileModal.stories.tsx` rewritten with the same `QueryClientProvider`+`apiClient`
  mock pattern, new `LegacyUnmatchedCountry` story; `ProfileHeader.stories.tsx`'s
  `NoUsernameOrCity` renamed `NoUsernameOrRegion`. `pnpm exec storybook build` succeeds (build-time
  verification only — not manually eyeballed in a running Storybook instance this pickup).

**Visual-regression expectation:** all 12 `profile-{posts,memories,settings,edit-profile-modal}-
{375,768,1280}.png` baselines legitimately change — `ProfileHeader`'s handle line lost the `city`
fallback (shows on every tab), and `edit-profile-modal`'s own 3 additionally change shape (City →
Country/Region/Language). Not regenerated (Windows host, per repo convention); expected to fail
until the next `update-baselines` dispatch regenerates exactly these 12 files.

**IT/backend:** none — this is a client-only ticket. Backend **U19** (remove `city` entirely) was
filed as the accepted follow-up, sequenced after this ticket.

**`tsc -b`**, scoped **Vitest** (119 tests across every touched profile/geo-locale file), and
**ESLint** all clean.
