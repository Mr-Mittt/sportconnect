# CLIENT-ERR-3 · Client error adaptation: user / account

**Status:** `TODO`
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
