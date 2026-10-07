# CLIENT-ERR-8 · Client error adaptation: reference / location / notification

**Status:** `DONE` (2026-10-07)
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, REF-5, LOC-6, NTF-5
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **reference / location / notification**, after REF-5 / LOC-6 / NTF-5 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** Country/region pickers, location picker and favorites, notification actions. **May be closed as a no-op at pickup** if the three audits define no client-actionable codes.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Carried over from REF-5 (2026-10-07):** the reference codes are final (`ERROR_CODES.md` § reference): `COUNTRY_NOT_FOUND` (404, regions list), `COUNTRY_UNKNOWN` (400, `{country}`), `REGION_UNKNOWN` (400, `{region, country}`), `REGION_COUNTRY_REQUIRED` (400). The three 400s come back from register and profile update; `REGION_UNKNOWN` is what a stale or REF-3-deactivated region id produces, so the region picker should refetch. The `resolve` endpoint's 400s are generic `VALIDATION_FAILED` and the pre-fill ignores them. This is client-actionable, so CLIENT-ERR-8 will not close as a no-op on REF-5's account.

**Carried over from LOC-6 (2026-10-07, scope decision):** The favorite stale-state codes are not errors the user needs to read. `LOCATION_ALREADY_FAVORITED` (409, favorite) and `LOCATION_NOT_FAVORITED` (409, unfavorite) are almost always a double-click or a second tab: the client **refetches the favorites and shows no error** (no toast, no inline line). The other location codes are listed in `ERROR_CODES.md` § location once LOC-6 lands. The wider "can double-click UX be improved elsewhere" review, across every module, is part of **CLIENT-ERR-9** (scope added 2026-10-07).

**Final notification codes (NTF-5, 2026-10-07, `ERROR_CODES.md` § notification):** `NOTIFICATION_NOT_FOUND` (404) and `NOTIFICATION_FORBIDDEN` (403), both only from `PUT /api/notifications/{id}/read`. Every client caller (`useMarkNotificationRead`, `useMarkAllNotificationsRead`, `useUnreadNotificationCount`) is already `errorDisplay: 'silent'` and branches on no status, and nothing deletes notifications, so a stale or foreign id is a crafted or racing request. Suggested behavior (to be approved in this ticket's table): show nothing and refetch the list and the unread count; at most add en/vi `errors:` copy for the two codes. The list and unread-count endpoints have no error path, STOMP CONNECT is not coded. With REF-5 and LOC-6 done, notification is the only part of this ticket that may close as a no-op.

**Final location codes (LOC-6, 2026-10-07, `ERROR_CODES.md` § location):** `LOCATION_NOT_FOUND` (404; also returned by session create/update and a group recurrence location through `getLocation`, so those two flows can surface it), `LOCATION_SPORT_PROFILE_REQUIRED` (400), `LOCATION_ALREADY_FAVORITED` and `LOCATION_NOT_FAVORITED` (**409**, were 400: refetch the favorites, no error shown), `LOCATION_MAPS_URL_INVALID` and `LOCATION_MAPS_URL_UNSUPPORTED` (400, inline on the URL field). The MSW favorite handlers already return these (LOC-6). No `*_NOT_FOUND` message carries an id any more, so never rely on the server text for those.

## Scope decisions (2026-10-07, pickup)

- **Notification is not a no-op** (user decision): the two codes get en + vi copy, and a failed mark-read refetches the list and the unread count after the rollback. Nothing is shown, because every caller stays silent.
- **`REGION_UNKNOWN` and the other reference codes show in the existing location-detection hint line** (`GeoLocaleLocationHint`), not in the form banner (user decision).
- **`LOCATION_NOT_FOUND` from session create or update** reuses CLIENT-ERR-7's session error dialog; this ticket adds only the copy.
- No scope was added or removed at the gate.

## Approved behavior table

| Flow | Error (code) | Shows where | Copy | After the error |
|---|---|---|---|---|
| Register, profile save | `REGION_UNKNOWN` | The geo hint line under the pickers; the form banner is suppressed for the code | A | Clear the region, refetch that country's regions, keep everything else typed |
| Register, profile save | `COUNTRY_UNKNOWN` | Same hint line | B | Clear country and region, refetch the countries |
| Register, profile save | `REGION_COUNTRY_REQUIRED` | Same hint line | C | Keep the form and the selections |
| Region list load | `COUNTRY_NOT_FOUND` | Same hint line (instead of the generic `regionsLoadError`) | B | Clear country and region, refetch the countries |
| Reference resolve (pre-fill) | 400 `VALIDATION_FAILED` | Nothing | none | Unchanged: the pre-fill ignores it |
| Favorite or unfavorite | `LOCATION_ALREADY_FAVORITED`, `LOCATION_NOT_FAVORITED` | Nothing | none | Refetch that sport's favorites |
| Favorite | `LOCATION_NOT_FOUND` | Toast | D | Refetch the favorites |
| Favorite | `LOCATION_SPORT_PROFILE_REQUIRED` | Toast | E | Refetch the favorites |
| Favorite or unfavorite | network or 5xx | Toast (global default) | category copy | Refetch the favorites |
| Location picker: resolve URL | `LOCATION_MAPS_URL_INVALID` | Inline `role="alert"` line replacing the static one | F | The URL input stays |
| Location picker: resolve URL | `LOCATION_MAPS_URL_UNSUPPORTED` | Same inline line | G | The URL input stays |
| Location picker: create | `SPORT_NOT_FOUND`, `VALIDATION_FAILED` | Inline line with the existing copy | existing | The form stays |
| Session create or update | `LOCATION_NOT_FOUND` | CLIENT-ERR-7's session error dialog | D | Unchanged (existing session behavior) |
| Notification mark-read, mark-all | `NOTIFICATION_NOT_FOUND`, `NOTIFICATION_FORBIDDEN` | Nothing | H (stored, not displayed) | Rollback, then refetch the list and the unread count |

Copy (en / vi) lives in `locales/{en,vi}/errors.json` under `codes`: A `REGION_UNKNOWN`, B `COUNTRY_UNKNOWN` and `COUNTRY_NOT_FOUND`, C `REGION_COUNTRY_REQUIRED`, D `LOCATION_NOT_FOUND`, E `LOCATION_SPORT_PROFILE_REQUIRED`, F `LOCATION_MAPS_URL_INVALID`, G `LOCATION_MAPS_URL_UNSUPPORTED`, H `NOTIFICATION_*`; the two favorite codes carry copy too, though no screen shows it.

## Implementation summary (2026-10-07)

**What was built, as approved.** No backend change.

- **i18n:** 13 codes added to `errors:codes` in en and vi (`COUNTRY_NOT_FOUND`, `COUNTRY_UNKNOWN`, `REGION_UNKNOWN`, `REGION_COUNTRY_REQUIRED`, six `LOCATION_*`, two `NOTIFICATION_*`).
- **Geo pickers:** new `shared/lib/geoErrors.ts` (`isGeoServerCode`). `useRegions` also returns `error`. `useGeoLocaleFieldsData` gains `serverGeoCode` and a stable `applyServerErrorCode(code)` (clears the stale pick, refetches the matching list; `countryId` is read through a ref so the callback identity never changes, otherwise an effect keyed on it would re-apply a stale error over the user's next pick). `GeoLocaleLocationHint` takes `serverGeoCode` and wins over `geoHint`. `RegisterForm` and `AccountSettingsModal` apply the code from an effect keyed on it. `useRegister` leaves `errorMessage` null for these codes (the code is still exposed); `useEditProfileSave` exposes `geoErrorCode` and drops the profile half's message for them (a language that saved still reports), and `AppShell` passes it down.
- **Location:** new `features/location/locationErrors.ts` (`reportLocationMutationError`: silent for the two stale 409s, toast for everything else). `useFavoriteLocation` and `useUnfavoriteLocation` are `errorDisplay: 'silent'`, report through it and refetch the favorites on any failure. `useLocationPickerData` exposes `resolveErrorText` and `saveErrorText` (`getCodedErrorMessage`); `LocationPicker` shows them in place of the static lines when present.
- **Notifications:** new `notificationErrors.ts` (`refetchWhenNotificationGone`), called from `onError` in both mark-read hooks after the rollback.
- **MSW:** the regions handler's 404 now carries `COUNTRY_NOT_FOUND` (the favorite and notification handlers were already updated by LOC-6 and NTF-5).

**Divergence from the plan.** One, in how the `COUNTRY_NOT_FOUND` regions failure is handled: the lint rule `react-hooks/set-state-in-effect` rejected the effect that called `applyServerErrorCode`, so the state reset happens while rendering (the React-approved "adjust state on change" form) and a small effect only refetches the countries. The behavior is the one in the table; the country the user picked no longer paints for a frame. The `touched` marks that `applyServerErrorCode` sets are not set on this path (a ref write during render is also flagged), so a later "Use my current location" click can refill the country, which is fine.

**Consumer census.** `useGeoLocaleFieldsData` is used only by `RegisterForm` and `AccountSettingsModal`: both updated. The `GeoLocaleLocationHint` prop is optional: compatible as-is. The favorite hooks' three consumers (create-session modal, discover filter, session-detail completion dialog) read only `mutate`/`isPending`: compatible as-is. `LocationPicker` takes two new optional props and is spread from `useLocationPickerData` in four places: compatible as-is. No other code branches on the mark-read failure. No follow-up ticket was needed.

**Tests.**
- **Vitest** (scoped, 20 files, 180 passed; then the two files touched afterwards, 22 passed): `useGeoLocaleFieldsData` (+5: each geo code, ignored codes, `COUNTRY_NOT_FOUND` from the regions list), `useRegister` (+3, banner empty for the three codes), new `useEditProfileSave.test.tsx` (4), new `locationErrors.test.ts`, new `useFavoriteLocation.test.tsx` (stale 409 on favorite and unfavorite say nothing and refetch; `LOCATION_NOT_FOUND` toasts once), `LocationPicker` (+2), new `notificationErrors.test.ts`. `tsc -b` clean; `pnpm lint` has no findings in the changed files (the remaining errors are in the generated `.vite/deps`).
- **E2E:** new `e2e/flows/misc-errors.spec.ts` (3 tests: `REGION_UNKNOWN` en and vi, `COUNTRY_UNKNOWN` clears the country), 3 passed. Existing specs covering the touched surfaces (`auth-errors`, `auth-journey`, `locale`, `matches-journey`, `notification-bell`, `profile-journey`, `signup-locale`, `user-errors`, `session-errors`): 41 passed. **The full `e2e` project and the full Vitest suite were not run** (token-saving rule: scoped only unless asked).
- **Visual-regression expectation:** no baselined surface touched, so no baseline change is expected; a failing `visual-regression` run is the Windows noise floor, not a regression. It was not run.
