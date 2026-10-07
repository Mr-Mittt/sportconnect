# CLIENT-ERR-7 · Client error adaptation: session

**Status:** `DONE` (2026-10-07)
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

**Scope change (2026-10-06, at pickup):** the user decided session errors must be unmissable: shown in an error dialog in front of the user (not a bottom-right toast), so the user knows what went wrong. Decisions: (1) the session detail load failing with `SESSION_NOT_FOUND` / `SESSION_FORBIDDEN` uses the audit table's page state (`ResourceUnavailable`); (2) a session action (join, leave, cancel, update, approve, reject, comments, likes) failing with `SESSION_NOT_FOUND` shows an error dialog, not a toast; (3) the 409 conflicts (`SESSION_CANCELLED`, `SESSION_NOT_CANCELLABLE`, `SESSION_NOT_PARTICIPANT`, `SESSION_NOT_PREPARING`) also show an error dialog, **the session modal stays open**, and the session data is refetched. This replaces the audit table's toast / silent / inline-banner treatment for those codes. The remaining codes (403 group/creator, 400 field codes) are settled in the Phase 3 behavior table.

**Scope locked (2026-10-06):** `SESSION_NOT_PARTICIPANT` on leave also shows the dialog (modal stays open, refetch). The 403 codes (`SESSION_FORBIDDEN` on a post-open action, `SESSION_GROUP_MEMBER_REQUIRED`, `SESSION_GROUP_ADMIN_REQUIRED`, `SESSION_CREATOR_REQUIRED`) show the error dialog and, on "Got it", **close the session modal** (a 403 means the user has no right to be in it). The 400 field codes stay inline field errors on the form. No other changes.

## Implementation summary (2026-10-07)

**Approved behavior table** (user sign-off 2026-10-06 after one round: the user asked for every session error to show in a dialog in front of the user, not a bottom-right toast, with the session modal kept open and refetched; 403s close the modal; `SESSION_NOT_PARTICIPANT` also gets a dialog). "Dialog" is the app-wide session error dialog: one message and a "Got it" button.

| Flow | Error | Where it shows | After |
|---|---|---|---|
| Detail load | `SESSION_NOT_FOUND` | Modal body: "No longer available" state | Close button closes the modal |
| Detail load | `SESSION_FORBIDDEN` | Modal body: "No access" state | Close button closes the modal |
| Any session action (join, leave, cancel, update, approve, reject, like, comment) | `SESSION_NOT_FOUND` | Dialog | Modal stays open and refetches, so it turns into the "no longer available" state |
| Join, cancel, approve, reject | `SESSION_CANCELLED`, `SESSION_NOT_CANCELLABLE` | Dialog | Modal stays open and refetches |
| Update (complete location or fee) | `SESSION_NOT_PREPARING` | Dialog (no inline banner) | Modal stays open and refetches |
| Leave | `SESSION_NOT_PARTICIPANT` | Dialog | Modal stays open and refetches |
| Approve, reject | `SESSION_JOIN_REQUEST_NOT_FOUND` | Dialog | Modal stays open and the queue refetches |
| Detail actions and comments | `SESSION_FORBIDDEN`, `SESSION_GROUP_MEMBER_REQUIRED`, `SESSION_GROUP_ADMIN_REQUIRED`, `SESSION_CREATOR_REQUIRED` | Dialog | Modal closes, session data refetches |
| Same actions from a card, no modal open | any code above | Dialog | Lists refetch |
| Create session | `SESSION_SPORT_REQUIRED`, `SESSION_LOCATION_SPORT_MISMATCH`, `SESSION_FEE_AMOUNT_REQUIRED` | Inline line on the form, specific copy | Form stays, input kept |
| Create session | `SESSION_GROUP_ADMIN_REQUIRED` | Dialog | Form stays |
| Comments list load | `SESSION_FORBIDDEN` | Section hidden (as before, no dialog) | none |
| Comments list load | `SESSION_NOT_FOUND` | Existing "couldn't load comments" line | none |
| Leave | `SESSION_CREATOR_CANNOT_LEAVE` | Toast (generic; the button is hidden for creators) | none |
| Network, 5xx, unknown code, filter 400s | | Toast, as before | Unchanged |

**Departures from the CLIENT-ERR-1 defaults and the SESSION-45 audit table:** dialogs replace the toast (403 group/creator, cancelled, not-cancellable, join request not found), the silent leave (`SESSION_NOT_PARTICIPANT`) and the inline banner (`SESSION_NOT_PREPARING`); the create-session 403 keeps the form open (the one row the user did not rule on separately; flagged in the plan and approved with it).

**Built:**
- `errors.json` en + vi: all 14 `SESSION_*` codes (`SESSION_NOT_CANCELLABLE` ignores its raw `status` param: the copy is the same for COMPLETED and CANCELLED). `sharedDialogs.json` `sessionActionError.postActionError.{title,gotIt}` (the dialog is a second instance of `PostActionErrorDialog` with an `i18nOverridePrefix`, so only its screen-reader title differs).
- `app/sessionErrorDialogStore.ts` (raw error, a dismissal counter, whether the last dismissal was a 403), hosted once in `AppShell` through `useSessionErrorDialog()`, which also refetches every session query that is not itself in error on dismissal.
- `features/session/sessionErrors.ts`: `isSessionDialogError`, `isSessionForbiddenDialogError`, `reportSessionDialogError` (returns whether it handled the error; used by the inline hooks), `reportSessionMutationError` (dialog or the usual toast), `useSessionErrorGuard(sessionId, closeDetail)` (closes the open modal after a dismissed 403; inert in an instance with no session open, because several detail-hook instances are mounted at once).
- Hooks: join, leave, approve, reject, session like/unlike and the four session-comment hooks are `errorDisplay: 'silent'` and report through `reportSessionMutationError`; cancel, update and create keep `inline` and call `reportSessionDialogError`. `useSessionDetailModalData(sessionId, closeDetail?)` gained the close callback (passed by `useMatchesPageData`, `useDiscoverModalData` and `AppShell`), exposes `sessionLoadError`, and hides the inline join/leave/cancel/complete lines when the dialog owns the error.
- `SessionDetailModal` takes `loadError`: a 404 or 403 detail load renders `ResourceUnavailable` (`unavailable` / `forbidden`) with a Close action; any other failure keeps the generic line. All 6 render sites pass it. `CreateSessionModal` takes `errorText` (from `getCodedErrorMessage`), filled by `useCreateSessionModalData.createErrorText`.
- **Retry and hand-written checks:** the 403/404 `retry` override in `useSessionComments` is removed (the app default `shouldRetry` already skips 403 and 404), and `useSessionCommentsData` reads `FORBIDDEN` from the classifier instead of `status === 403`; both `noRawServerError` allowlist entries are gone. No `retry` override on a session query remains.
- MSW `sessions.ts`: `apiError` takes `errorParams`; the real statuses and codes (404 `SESSION_NOT_FOUND`, 409 `SESSION_NOT_PARTICIPANT`/`SESSION_NOT_CANCELLABLE`/`SESSION_NOT_PREPARING`, 404 `SESSION_JOIN_REQUEST_NOT_FOUND`).

**Consumer census:** the six hosts of `SessionDetailModal` and `CreateSessionModal` (Matches, Home Feed, Groups, Friends, Profile, `AppShell`): one optional prop each, all updated. `useSessionDetailModalData`: one optional argument and one additive return field (callers: `useMatchesPageData`, `useDiscoverModalData`, `AppShell`, all updated). The session mutation hooks: no signature change; failure reporting moved from the global toast (or inline) to the dialog for session codes, unchanged for everything else; `useSessionParticipationAction` and the cards are compatible as-is (the dialog is app-wide). No backend contract changed; no follow-up ticket came out of this.

**I18N-4 census:** three rows added to `I18N_READINESS.md`. `ERROR_HANDLING_DESIGN.md` tracker: session Phase C `DONE`.

**Tests:**
- Vitest, scoped to `src/features/{session,feed,home-feed,groups,friends,profile}`, `src/shared`, `src/app`: **216 files / 1777 passed**. New or changed: `sessionErrorCodes.test.ts` (all 14 codes in en + vi), `sessionErrors.test.tsx` (classification, dialog vs toast, dismissal refetch, the guard), two failure-reporting cases in `useJoinSession.test.tsx`, load-error and `errorText` cases in `SessionDetailModal.test.tsx` and `CreateSessionModal.test.tsx`. `tsc -b` clean; `eslint` 0 errors (2 pre-existing warnings in `SessionStartTimePicker.tsx`).
- **E2E:** one new spec, `e2e/flows/session-errors.spec.ts`, **5 tests**, 15/15 at `--repeat-each=3`. Scoped existing specs run alongside, **86 passed in one run** with the new ones: `matches-journey`, `locale`, `a11y`, `error-handling`, `feed-groups-journey`, `home-feed-journey`, `notification-bell`, `profile-journey`, `group-invitations`, `post-errors`. **The full `e2e` project was not run** (token-saving rule; scoped subset above). `E2E_OVERVIEW.md` updated (directory listing + new section).
- Not run: the full Vitest suite, `visual-regression`, Storybook, a hand walk of the dev server, and the real backend (the contract is proven by SESSION-45's `SessionErrorCodesIntegrationTest`). No story was added: the dialog is the existing `PostActionErrorDialog` (4 stories), and `SessionDetailModal` gained a state with no new component.

**E2E:** `e2e` project, scoped: 5 new tests (15/15 repeated) + the scoped existing specs, 86 passed in one run; no spec failed; full project not run.

**Visual-regression expectation:** no baselined surface touched. The dialog and the "unavailable" modal state only render in an error state and no existing screen changed, so no baseline change is expected; a failing `visual-regression` run on this Windows host is the noise floor, not a regression. It was not run.
