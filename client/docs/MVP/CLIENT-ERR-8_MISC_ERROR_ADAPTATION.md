# CLIENT-ERR-8 · Client error adaptation: reference / location / notification

**Status:** `TODO`
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

**Final location codes (LOC-6, 2026-10-07, `ERROR_CODES.md` § location):** `LOCATION_NOT_FOUND` (404; also returned by session create/update and a group recurrence location through `getLocation`, so those two flows can surface it), `LOCATION_SPORT_PROFILE_REQUIRED` (400), `LOCATION_ALREADY_FAVORITED` and `LOCATION_NOT_FAVORITED` (**409**, were 400: refetch the favorites, no error shown), `LOCATION_MAPS_URL_INVALID` and `LOCATION_MAPS_URL_UNSUPPORTED` (400, inline on the URL field). The MSW favorite handlers already return these (LOC-6). No `*_NOT_FOUND` message carries an id any more, so never rely on the server text for those.
