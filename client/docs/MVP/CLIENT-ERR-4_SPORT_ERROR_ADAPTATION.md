# CLIENT-ERR-4 · Client error adaptation: sport

**Status:** `TODO`
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, A25 (sport)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **sport**, after A25 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** `/profile` Settings tab (`useUpdateSportProfile`, `useDeactivateSportProfile`), add-sport flow. **Admin sport editors are out of scope (2026-10-05, user decision: admin data needs no localization).**

**Final codes from A25 (en + vi copy needed):** `SPORT_PROFILE_ALREADY_EXISTS` (409, `{sportName}`), `PROFILE_NOT_RESUMABLE` (400, `{sportName}`), `PROFILE_ATTRIBUTES_TOO_LARGE` (400, `{maxBytes}`, **no dedicated copy**) and `PROFILE_ATTRIBUTES_INVALID` (400, **no dedicated copy**), `SPORT_PROFILE_NOT_OWNED` (403), `SPORT_PROFILE_NOT_FOUND` (404), `SPORT_NOT_FOUND` (404; also returned by location, session and group creates for a missing/inactive sport, so those flows can reuse the copy). **User decision (2026-10-05): the user must not see the attribute-size error as such.** The 4 KB cap is an internal limit the UI cannot explain or let the user act on, so for `PROFILE_ATTRIBUTES_TOO_LARGE` and `PROFILE_ATTRIBUTES_INVALID` the client adds no `errors:codes` entry and shows the generic message (the 400 category copy via the classifier fallback; never the server prose, and no `maxBytes` in the text). The behavior table must list them as "generic message". The duplicate-profile conflict is now a **409**; the MSW sport handler already mirrors the codes and statuses.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).
