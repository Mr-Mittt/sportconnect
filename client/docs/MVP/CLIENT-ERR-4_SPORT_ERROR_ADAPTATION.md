# CLIENT-ERR-4 · Client error adaptation: sport

**Status:** `DONE` (2026-10-05)
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

## Implementation summary (2026-10-05)

**Approved behavior table** (user sign-off 2026-10-05):

| Flow | Error | Where it shows | After |
|---|---|---|---|
| Add sport (modal; inline in the session modals) | `SPORT_PROFILE_ALREADY_EXISTS` | Inline `role=alert` banner (existing slot) | Modal stays open, input kept; the profile list refetches (existing `onSettled`) so the sport leaves the picker |
| same, resume mode | `PROFILE_NOT_RESUMABLE` | Same banner | Stays open; the resumable list refetches |
| same | `SPORT_NOT_FOUND` | Same banner | Stays open; the user can cancel or pick another sport |
| same | `PROFILE_ATTRIBUTES_*` | Same banner, generic copy, no `maxBytes` | Stays open, form kept for retry |
| Add sport, any uncoded error | 400 / network / 5xx | Existing static "Couldn't add that sport. Try again." | Unchanged |
| Reactivate nudge (sport pill) | `PROFILE_NOT_RESUMABLE`, `SPORT_NOT_FOUND`, `SPORT_PROFILE_ALREADY_EXISTS` | The dialog's `role=alert` line | Dialog stays, lists refetch, "Later" still works |
| `/profile` Active toggle: deactivate | `SPORT_PROFILE_NOT_FOUND` | `statusConfirm` alert | Dialog stays; lists refetch (existing `onSettled`), so the stale pill disappears |
| same, reactivate | `PROFILE_NOT_RESUMABLE`, `SPORT_NOT_FOUND` | Same alert | Same |
| `/profile` Settings edit | `SPORT_PROFILE_NOT_FOUND` | Existing form banner | Form stays; **new:** both profile lists are invalidated so the removed profile drops out |
| same | `PROFILE_ATTRIBUTES_*` | Existing banner, generic copy | Form and draft kept |
| same | `SPORT_PROFILE_NOT_OWNED` | Copy only | Unreachable from the UI, no page state |
| Attribute-schema read | `SPORT_NOT_FOUND` | Nothing | Unchanged (no attribute fields) |

**Departures from the defaults / the earlier plan:**
- `PROFILE_ATTRIBUTES_TOO_LARGE` and `PROFILE_ATTRIBUTES_INVALID` ARE registered in `errors:codes`, with the generic line as their text. The ticket note said "no entry", but the classifier lets server prose win for 400s, so without an entry the user would see "...exceed the maximum allowed size (4KB)". The generic copy is the entry; no `maxBytes` is interpolated. The classifier contract is untouched.
- The schema read (`SPORT_NOT_FOUND`) keeps its silent behavior: that query has no error surface today, and adding one is a new feature.

**Built:**
- `errors.json` (en + vi): 7 entries (`SPORT_PROFILE_ALREADY_EXISTS` and `PROFILE_NOT_RESUMABLE` with `{{sportName}}`).
- New `shared/lib/codedErrorMessage.ts`: `getCodedErrorMessage(error)` returns text only when the server sent a code the client has copy for, else `undefined`, so screens that own a static fallback line keep it.
- `AddSportFields`, `AddSportModal`, `ReactivateSportNudgeDialog`, `SportProfileStatusConfirmDialog`: optional `errorText`, shown as `errorText ?? <static line>`.
- Wired at every call site: `GroupsPage` (2 modals + group nudge), `HomeFeedPage`, `MatchesPage` (+ an `addSportErrorText` prop on `CreateSessionModal`/`SessionDiscoverModal`), `ProfilePage` (modal + status dialog), `useInactiveSportPillSelect` (nudge). `useDeactivateSportProfile` now returns `error`.
- `useUpdateSportProfile`: `onError` invalidates both profile lists for `SPORT_PROFILE_NOT_FOUND`; its `errorMessage` (`getErrorMessage`) now localizes by code.
- No ad-hoc status checks existed in sport code to remove (the `status === 404/403` checks in feed/session belong to other modules).

**Consumer census:** the four components gained one optional prop each (compatible as-is for any caller that omits it; every call-site group is updated here). `useDeactivateSportProfile`'s return gained `error` (additive). No shared type changed. `SPORT_NOT_FOUND` now also localizes where the location/session/group creates already call `getErrorMessage` (no per-flow work, as agreed).

**Tests:**
- Vitest: new `sportErrorCodes.test.ts` (5 codes in en + vi with params, generic copy for the attribute-size codes with no "4096"/"KB", every A25 code has en + vi, `getCodedErrorMessage` undefined for uncoded/unknown); `errorText` cases added to the `AddSportModal` and `ReactivateSportNudgeDialog` tests; new `SportProfileStatusConfirmDialog.test.tsx` (3); `useUpdateSportProfile.test.tsx` +2 (refetch on `SPORT_PROFILE_NOT_FOUND`, none otherwise). Scoped run: 56 files / 448 passed, then the new dialog test file (3 passed). `tsc -b` clean; `eslint` 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`, not touched).
- Storybook: stories `CodedErrorState` (`AddSportModal`) and `CodedError` (`SportProfileStatusConfirmDialog`) added; Storybook itself was not opened.
- **E2E:** scoped `e2e` project, 37 passed (new `sport-errors.spec.ts` 4 tests, plus `profile-journey`, `error-handling`, `feed-groups-journey`, `home-feed-journey`, `matches-journey`, `group-invitations`). The full `e2e` suite was not run (token-saving rule: scoped subset of the specs that reference the changed surfaces).
- **Visual-regression expectation:** no baselined surface touched (the new text only renders in an error state no baseline opens) - no baseline change expected; a failing `visual-regression` run is the Windows noise floor, not a regression. Not run.
- Not run: a hand walk of the dev server, and the real backend (the contract is proven by A25's `SportErrorCodesIntegrationTest`).

**Divergences from the design:** none beyond the two departures listed above (both stated at approval).
