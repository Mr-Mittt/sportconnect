# CLIENT-ERR-7 · Client error adaptation: session

**Status:** `TODO`
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, SESSION-45 (session)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **session**, after SESSION-45 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** Session detail modal and Matches page: not found/forbidden, join/leave/approve failures, comments forbidden (`useSessionCommentsData`), create-session failures.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Carried over from CLIENT-ERR-1 (2026-10-04):** `useSessionComments` (403/404 skips retry) and `useSessionCommentsData` (`isForbidden` read from a 403). CLIENT-ERR-1 ships a category-based default retry; decide in this ticket's behavior table whether it makes each override redundant (remove it) or it must stay.

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Carried over from SESSION-45 consumer census (2026-10-06):** the MSW session handlers in `client/e2e/mocks/handlers/sessions.ts` still return the pre-audit shapes (400 for "not a participant" ~line 871 and "no pending join request" ~lines 906/929, uncoded 404s for "Session not found"). SESSION-45 moves these to 409 `SESSION_NOT_PARTICIPANT`, 404 `SESSION_JOIN_REQUEST_NOT_FOUND` and a coded 404 `SESSION_NOT_FOUND`; update the mocks to the real codes/statuses in this ticket. The final code list is the `ERROR_CODES.md` § session registry.
