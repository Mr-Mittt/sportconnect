# CLIENT-ERR-5 · Client error adaptation: group

**Status:** `DONE` (2026-10-06)
**Type:** Enhancement
**Program:** Error handling · Phase C
**Depends on:** CLIENT-ERR-1, A11 (group)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase C of the error-handling program for **group**, after A11 defines the codes: add the en + vi `errors:<CODE>` entries for that module's codes (interpolating `errorParams`), switch the affected flows from generic states to the specific one via the CLIENT-ERR-1 classifier and the `ResourceUnavailable`/inline/toast treatment recorded in the backend ticket's audit table, remove the module's remaining ad-hoc `status === 403/404` checks, and update the I18N-4 census row(s) in `documentation/md/I18N_READINESS.md`.

**Flows:** Groups page: group not found/forbidden → `ResourceUnavailable`, Invite Friend modal (`useInviteFriendModalData`), join requests, membership/role actions, settings.

**Delta from backend A11 (2026-10-05, DONE):** the code list is final — `documentation/md/ERROR_CODES.md` § group (29 `GROUP_*` codes) and the per-endpoint audit table in `modules/social/group-impl/docs/MVP/A11_ERROR_CODE_AUDIT.md`, which is the starting point for the behavior table below. Statuses moved: owner/admin/member/invitee permission failures are now **403** (were 400), state conflicts (name taken, already member, already pending, not pending, already pinned) **409** (were 400), and cancelling a join request or invitation of a deleted group **404** (was 400). Anything in the group feature that keyed off a 400 for those flows must key off the code or the new category instead. Invite Friend inline errors (`GROUP_NOT_FRIENDS`, `GROUP_ALREADY_MEMBER`, `GROUP_INVITATION_ALREADY_PENDING`, `GROUP_MEMBER_INVITES_DISABLED`, `GROUP_MEMBER_CAPACITY_REACHED {max}`) are the first priority. Deactivated callers still pass every group endpoint until their token expires (U12), so no client state is needed for that.

**Localization:** en + vi for every new string (client rule).

**Out of scope:** Other modules' codes; changes to the CLIENT-ERR-1 classifier contract (raise those against that ticket instead).

**Behavior sign-off (program rule, 2026-10-03):** before implementing, this ticket's Phase 3 plan must carry a per-flow error behavior table and get explicit user approval. Per endpoint or screen and per error (code or category): **where it shows** (inline field, inline banner, page state, toast, modal), **the en and vi copy**, and **what the app does afterward** (stay on the form, keep or discard the user's input, retry or refetch, roll back an optimistic update, close or keep a modal, redirect, go to a not-found/forbidden screen). Start from the backend audit table's "Client behavior" column and the CLIENT-ERR-1 approved defaults, and list every row that departs from the defaults. Nothing is built until the table is approved; the approved table is copied into this ticket's implementation summary.

**Tests:** Vitest/RTL per updated component or hook (code → localized text, unknown code → category copy → server prose), a `locale.spec.ts` or flow e2e case for the main flow in `vi`, scoped e2e; update `client/docs/E2E_OVERVIEW.md` if specs change.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Implementation summary (2026-10-06)

**Approved behavior table** (user sign-off 2026-10-06). "Dialog" means the error shows inside the modal the user is already in; list actions that have no dialog of their own get one new shared error dialog.

| Flow | Error | Where it shows | After |
|---|---|---|---|
| Invite Friend row | `GROUP_NOT_FRIENDS`, `GROUP_INVITATION_ALREADY_PENDING` | Inline row error in the modal (existing slot) | Modal stays open; the lists reload |
| same | `GROUP_MEMBER_INVITES_DISABLED`, `GROUP_MEMBER_CAPACITY_REACHED {max}` | Same | Modal stays open; no reload needed |
| same | `GROUP_ALREADY_MEMBER`, `GROUP_NOT_FOUND` | Same | Modal stays open; the lists reload |
| same | `GROUP_MEMBER_REQUIRED` | Same | Modal stays open; no reload |
| Join Group modal | `GROUP_ALREADY_MEMBER`, `GROUP_JOIN_REQUEST_ALREADY_PENDING`, `GROUP_MEMBER_CAPACITY_REACHED {max}`, `GROUP_NOT_FOUND` | The modal's `role=alert` line | Modal stays open; the requests/membership state reloads |
| Join-request actions (accept, decline, cancel) and invitation actions (approve, decline, accept, reject, cancel) | `GROUP_JOIN_REQUEST_NOT_FOUND`, `GROUP_JOIN_REQUEST_NOT_PENDING`, `GROUP_INVITATION_NOT_FOUND`, `GROUP_INVITATION_NOT_PENDING`, `GROUP_NOT_FOUND`, `GROUP_REQUESTER_ONLY`, `GROUP_INVITEE_ONLY`, `GROUP_INVITER_ONLY`, `GROUP_ADMIN_REQUIRED`, `GROUP_MEMBER_CAPACITY_REACHED {max}` | New `GroupActionErrorDialog` (one message, "Got it") | The list reloads, so the stale row goes away |
| Create group | `GROUP_NAME_TAKEN`, `GROUP_SPORT_PROFILE_REQUIRED` | Existing form alert, specific copy | Form stays, input kept |
| Delete group | `GROUP_OWNER_REQUIRED`, `GROUP_NOT_FOUND` | Existing dialog line, specific copy | Dialog stays; the groups list reloads |
| Leave group | `GROUP_OWNER_CANNOT_LEAVE` | Existing settings-tab line, specific copy | Stays on the tab |
| Settings / general-data save | `GROUP_OWNER_REQUIRED`, `GROUP_ADMIN_REQUIRED` | Existing save-error line, specific copy | Draft kept |
| Privacy toggle | `GROUP_ADMIN_REQUIRED`, `GROUP_NAME_TAKEN`, `GROUP_NOT_FOUND` | Existing privacy-error line, specific copy | Optimistic flip rolls back (existing) |
| Any other group code (member removal, role change, transfer, pins, recurrence, `GROUP_PRIVATE`, `GROUP_MEMBER_NOT_FOUND`, ...) | | Copy only, no UI | The registry is complete for when the UI exists |
| Any uncoded error | 5xx / network / unknown | Each flow's existing static line, or the category copy in the dialog | Unchanged |

**Departures from the proposal made before approval:**
- The "group gone / private" page states and the `GROUP_PRIVATE` "request to join" button were **dropped**. The client never calls `GET /api/groups/{id}` (the only `GROUP_PRIVATE` path) and only opens groups the user is already a member of, so a non-member can't reach either state. A stale selection after a delete is already handled by the existing groups-list refetch on settle.
- The settings name-taken inline field error was **dropped**: the Settings tab shows the name read-only, so `GROUP_NAME_TAKEN` is only reachable from create group and the privacy toggle (which sends the name along).
- A rejected invitation uses the shared dialog, not `RejectInvitationConfirmDialog`'s own error line: that dialog closes the moment the user confirms (`setRejectingInvitationId(null)` right after the call), so its line never showed. The unused-in-practice line is left as it was.

**Built:**
- `errors.json` (en + vi): all 29 `GROUP_*` codes (`GROUP_MEMBER_CAPACITY_REACHED` and `GROUP_PIN_LIMIT_REACHED` interpolate `{{max}}`); `groups.json` `actionError.{title,gotIt}`.
- New `GroupActionErrorDialog` (+ test, 4 stories). The discovery panel's "Withdraw" on your own join request is wired to it too (found while writing its e2e case; it had no error handler). `GroupsPage` holds the raw error and localizes it at render, so a locale switch while open is picked up; a cancelled request or 401 never opens it.
- `useGroupMembersTabData` and `useGroupInvitationsData` take an optional trailing `onActionError`, passed as the per-call `onError` of every accept/decline/approve/cancel/reject.
- Optional `errorText` on `CreateGroupModal`, `DeleteGroupConfirmDialog`, `JoinGroupModal` (`requestErrorText`) and `GroupSettingsTab` (`privacyErrorText`, `leaveErrorText`, `saveSettingsErrorText`), each `errorText ?? <static line>`, filled by `getCodedErrorMessage` in `GroupsPage`. `useJoinGroupModalData` exposes `requestError`; `useSettingsUnsavedGuard` exposes `saveError`.
- Invite Friend needed no code change: `useInviteFriendModalData` already resolves row errors through `getErrorMessage`, which now finds the codes.
- No ad-hoc `status === 403/404` checks existed in the group feature, so none were removed.
- The existing `onSettled` invalidation already reloads on every failure, so the rows marked "no reload needed" reload too; harmless.

**Consumer census:** the five components each gained one or more optional props (compatible as-is for a caller that omits them; the only caller, `GroupsPage`, is updated here). `useGroupMembersTabData` / `useGroupInvitationsData` gained an optional trailing parameter (callers: `GroupsPage` and tests only). `useJoinGroupModalData` and `useSettingsUnsavedGuard` returns gained one additive field. No shared type, endpoint or DTO changed, and no new backend need or follow-up ticket came out of this.

**I18N-4 census:** the Invite Friend row in `I18N_READINESS.md` is marked done, and rows were added for Join Group, create/delete/leave/settings and the list actions.

**Tests:**
- Vitest, scoped to `src/features/groups` + the new registry test: 22 files / 244 passed (new `groupErrorCodes.test.ts` 32 cases over all 29 codes in en + vi with params, new `GroupActionErrorDialog.test.tsx` 3, one `errorText` case each in the `CreateGroupModal`, `DeleteGroupConfirmDialog`, `JoinGroupModal` and `GroupSettingsTab` tests, one `useGroupMembersTabData` test that a failed accept and cancel reach `onActionError` and refetch). `tsc -b` clean, `eslint` clean on the touched areas.
- **E2E report:** added 1 spec file, `e2e/flows/group-errors.spec.ts`, **14 tests**; no existing spec was edited. Scoped `e2e` project, 32 passed (the 14 new plus `group-members`, `group-invitations`, `group-settings` and `feed-groups-journey`). Covered, each with a forced coded error: accept a join request (en and vi), decline a join request, Invite Friend row (`GROUP_MEMBER_INVITES_DISABLED`), withdraw a sent invitation, accept an invitation into a full group (`{max}`), reject an invitation, withdraw your own join request, Join Group modal, create group (`GROUP_NAME_TAKEN`), delete group, Settings save, privacy toggle, leave group. Not covered by e2e: approving an invitation in the approval queue (same hook path as accept and decline) and the other Invite Friend codes (unit-covered). The full `e2e` suite was not run (token-saving rule).
- **Storybook:** coded-error stories added (`CodedErrorState` on `CreateGroupModal` and `DeleteGroupConfirmDialog`, `CodedRequestErrorState` on `JoinGroupModal`, `CodedErrors` on `GroupSettingsTab`) beside the new dialog's 4; they typecheck and lint, Storybook itself was not opened.
- Not run: the full Vitest suite, Storybook (not opened), `visual-regression` (no baselined surface changed; the new text only renders in an error state), a hand walk of the dev server, and the real backend (the contract is proven by A11's `GroupErrorCodesIntegrationTest`).

**Divergences from the design:** the three departures listed above, all stated before approval or at the approval point.
