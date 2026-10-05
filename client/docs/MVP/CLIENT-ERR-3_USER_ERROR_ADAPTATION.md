# CLIENT-ERR-3 · Client error adaptation: user / account

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, U21 (user)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **user / account**, after U21 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** Account Settings (`useEditProfileSave`, `useUpdateMyProfile`, `useUpdateMyPreferences`), Edit Profile, friend requests and search; range errors, unknown language, invalid gender, ownership.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Backend codes delivered by U21 (2026-10-05)

Final codes this ticket maps to en + vi copy (full registry and params in `documentation/md/ERROR_CODES.md`; per-endpoint audit table with the proposed client behavior in `modules/user/user-impl/docs/MVP/U21_ERROR_CODE_AUDIT.md`):

- 403 `USER_PROFILE_NOT_OWNED`
- 400 `HEIGHT_OUT_OF_RANGE`, `WEIGHT_OUT_OF_RANGE`, `SHOE_SIZE_OUT_OF_RANGE` (all `{min,max}`), `GENDER_INVALID` (`{allowed}`), `LANGUAGE_UNKNOWN` (`{language}`), `LOCATION_INCOMPLETE`, `LOCATION_OUT_OF_RANGE`, `CURRENT_PASSWORD_INCORRECT`, `SEARCH_KEYWORD_TOO_SHORT` (`{min}`), `FRIEND_REQUEST_SELF`
- 404 `USER_NOT_FOUND` (friend-request receiver only), `FRIEND_REQUEST_NOT_FOUND`
- **409** (moved from 400) `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING`, `FRIEND_REQUEST_NOT_PENDING`, `NOT_FRIENDS`
- Un-coded on purpose: the generic `User not found` 404s (category copy). The country/region 400s stay un-coded until REF-5.

**Shoe size is millimetres now** (U21 renamed `shoeSizeCm` to `shoeSizeMm`, label `Shoe size (JP, mm)`, range 10 to 500); the client side of that rename shipped in U21 itself, so this ticket only adds the `SHOE_SIZE_OUT_OF_RANGE` copy (interpolate `{min}`/`{max}` in mm).

## Implementation summary (2026-10-05)

**Approved design, as built.** En + vi `errors:codes` copy for all 17 U21 codes, resolved by the existing `getErrorMessage` (code, then server text for 400/409, then category copy), plus one small wiring change: the unfriend dialog shows the coded text for `NOT_FRIENDS`. Everything else already flowed through the CLIENT-ERR-1 layer, so no hook needed a behavior change.

**Approved behavior table (user approved 2026-10-05).** "Banner" is the existing `role="alert"` line in `AccountSettingsModal`; "toast" is the CLIENT-ERR-1 default (bottom-center, 5 s, `sonner`).

| Flow | Error | Shows where | Copy (en) | Afterward |
|---|---|---|---|---|
| Profile save | `HEIGHT_OUT_OF_RANGE` / `WEIGHT_OUT_OF_RANGE` / `SHOE_SIZE_OUT_OF_RANGE` | Banner | "Height must be between {{min}} and {{max}} cm." / "Weight ... kg." / "Shoe size ... mm." | Modal stays open, input kept |
| | `GENDER_INVALID` | Banner | "Choose a valid gender." | Same (closed select, defensive) |
| | `USER_PROFILE_NOT_OWNED` | Banner | "You can only edit your own profile." | Same (unreachable from the UI) |
| | `LANGUAGE_UNKNOWN` (preferences half) | Banner, existing "profile saved" prefix logic | "That language isn't available." | Same |
| | `VALIDATION_FAILED`, deactivated/missing caller (404, no code) | Banner | existing copy / category copy | unchanged |
| Friends: send | `FRIEND_REQUEST_SELF`, `USER_NOT_FOUND`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING` | Toast | see `errors.json` | Friend queries refetch (existing `onSettled`), so the button shows the real state |
| Friends: accept / decline / cancel | `FRIEND_REQUEST_NOT_FOUND`, `FRIEND_REQUEST_NOT_PENDING` | Toast | "This friend request no longer exists." / "...was already answered." | Refetch |
| Friends: unfriend | `NOT_FRIENDS` | Dialog message (replaces the generic "Couldn't unfriend") | "You're no longer friends with this person." | Refetch; dialog stays until dismissed |
| | any other failure | Dialog message, existing generic line | unchanged | unchanged |
| Friends: search | `SEARCH_KEYWORD_TOO_SHORT` | Existing "Couldn't search" line; copy only | "Type at least {{min}} characters to search." | Defensive only, the client already gates at 2 characters |
| Not wired | `CURRENT_PASSWORD_INCORRECT`, `LOCATION_INCOMPLETE`, `LOCATION_OUT_OF_RANGE` | Copy added, no UI | en + vi strings | Register already shows its banner through `getErrorMessage`; no change-password screen exists (filed **ACCOUNT-3**) |

**Departures from the backend audit table (decided with the user).** The audit's "inline on the field" for the three range errors became the modal banner with the field named in the copy: the form has no per-field error slots, and building them is a new pattern. Also: the unfriend copy has no `{{personName}}` (the server sends no such param), so it says "this person".

**Findings.**
- The form's own `min`/`max` on the height/weight/shoe inputs make the browser block an out-of-range value before it is sent, so the three range codes are a backstop (stale bounds, a direct API call) rather than a normal path. The e2e therefore forces the 400 with `page.route`.
- This module had no ad-hoc `status === 403/404` checks to remove (the census found none under the friends or profile features).
- `CURRENT_PASSWORD_INCORRECT` has no UI: **ACCOUNT-3** (change-password section) was filed at pickup, before building.
- The friend hooks' doc comments still said "400s server-side"; updated to the 409 codes.

**Changes.**
- `locales/{en,vi}/errors.json`: 17 new `codes` entries.
- `useFriendsPageData` exposes `unfriendErrorText` (set only for `NOT_FRIENDS`), passed through `FriendsPage` and `FriendProfilePanel` to `UnfriendConfirmDialog` (`errorText?`, falls back to the generic line).
- `e2e/mocks/handlers/friends.ts`: `apiError` takes `errorCode`/`errorParams`; the friend, search and gender errors mirror U21 (409 for the four conflicts, real codes).
- Tests: `shared/lib/userErrorCodes.test.ts` (9 code to en/vi rows with params, every U21 code has en + vi copy, unknown code falls back to server prose); `UnfriendConfirmDialog` test and `NotFriendsError` story; new `e2e/flows/user-errors.spec.ts` (4 tests: height 400 in en and vi, `NOT_FRIENDS` in the unfriend dialog, `FRIEND_REQUEST_NOT_PENDING` toast).

**Consumer census.** `getErrorMessage` and the hook return shapes: unchanged, compatible. `UnfriendConfirmDialog`/`FriendProfilePanel`: updated here (optional prop, callers compatible). MSW friends handler: updated here. `useUpdateMyProfile`, `useUpdateMyPreferences`, `useEditProfileSave`: compatible as-is (already route through `getErrorMessage`). I18N-4 census table: updated.

**Checks.** `tsc -b` and `eslint` clean. Scoped Vitest (`shared/lib`, `features/friends`, `features/profile`, `app`, i18n parity): 55 files / 414 tests passed. One earlier run of the same scope failed 2 tests in `noRawServerError.test.ts` (it walks all of `src`); it passed in isolation and on the full re-run with no code change, so I suspect a load timeout but did not prove a cause.

**E2E.** Scoped `e2e` project, headless: `user-errors`, `friends-journey`, `profile-journey`, `error-handling`, `auth-errors`: 18 passed. I did not run the full project. A libuv "Assertion failed" line prints at process shutdown on this Windows host after the results; the run itself reported 18 passed.

**Visual-regression expectation.** No baselined surface touched, so no baseline change is expected; the only markup change is an error line inside the unfriend dialog, which no baseline captures in its error state. I did not run the `visual-regression` project; a failing run on this Windows host would be the documented font-rendering noise floor.

**Not verified.** I did not open Storybook or walk the dev server by hand, and did not run against the real backend: the codes are mirrored in MSW from the U21 registry, and the U21 IT (`UserErrorCodesIntegrationTest`) covers the server side.
