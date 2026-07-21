# GRP-3 · Members tab — group member management

**Status:** DONE (2026-07-21) · **Type:** Feature · **Dependency:** GRP-1 (`DONE`)
**Branch:** `feature/grp-3-members-tab`

Origin: requested directly by the user (2026-07-20) — a new "Members" tab in `GroupTabs`, positioned
between Chat and Settings, for group member management. No design reference exists for this tab;
scoped directly from the user's spec (see `client/docs/BACKLOG_MVP.md`'s GRP-3 entry for the full
scoping history, including the "Waiting for user accept" scope broadening and the two open decisions
made at scoping time).

## What was built (matches the approved Phase 3 design, plus one post-approval addition)

**Types** (`src/features/feed/types.ts`): `InvitationStatus` (5-literal union) and `GroupInvitation`,
1:1 against the real `GroupInvitationResponse` (verified directly against `GroupServiceImpl` source,
then against the live running backend — see Verification below).

**New API hooks** (`src/features/feed/hooks/`, following this feature's existing per-endpoint hook
convention):
- `useGroupMembers(groupId, enabled)` → `GET /groups/{id}/members?size=100`
- `useGroupJoinRequests(groupId, enabled)` → `GET /groups/{id}/join-requests?size=100`
- `useSentInvitations(groupId, enabled)` → `GET /groups/{id}/invitations/sent?size=100` (B8)
- `useAcceptJoinRequest()` / `useDeclineJoinRequest()` → `PUT /groups/join-requests/{id}/accept|decline`,
  blunt `feedKeys.all` invalidation on settle (same convention as `useLeaveGroup`/`useDeleteGroup`)

None of the three GET endpoints support a keyword filter (open decision #2), so each fetches one
`size=100` page and `GroupMembersTab` filters/splits client-side — a known ~100-row cap for MVP.

**Orchestration hook** `src/features/groups/useGroupMembersTabData.ts` — mirrors
`useSettingsUnsavedGuard`'s role as a page-level data boundary, minus any draft/save state (this tab
has none). Derives `canManage` from `currentUserRole`, gates `useGroupJoinRequests` on
`isActive && canManage` (a `group_member` calling that endpoint 400s server-side — this hook never
fires the request for them at all, rather than firing and swallowing the error), and splits one
`useGroupMembers` fetch into `administrators` (owner sorted first, open decision #1: owner folds into
this section rather than a 6th) and `members`.

**Components:**
- `GroupMembersTab.tsx` — presentational/controlled. Owns its "find member" search string as local,
  transient `useState` (same precedent as `GroupDiscoveryPanel`'s `query` state), filtering all four
  real sections client-side (case-insensitive substring, no debounce, matches the literal spec) and
  handing the current text up via `onInviteFriend(query)` when "Invite friend" is clicked. Five
  sections per spec: "Waiting for group approve" (owner/admin only, Accept/Decline), "Waiting for
  user accept" (hidden entirely when the *unfiltered* list is empty, per-row label distinguishing
  `pending_owner`/`pending_user`), "Group administrator", "Members", "Blacklist" (permanent "Coming
  soon" — no backend concept exists).
- `InviteFriendModal.tsx` — same dialog chrome as `JoinGroupModal`. Ships mocked on purpose per this
  ticket's scope: pre-filled from the current search text, permanent "Search coming soon" result
  state, no network call, no invite action wired. Real search + invite is **GRP-4**.

**Post-approval addition (same day, requested after the above shipped):** the signed-in user's own
row in "Group administrator"/"Members" is now suffixed `(you)` (muted, non-bold, appended after the
name inside the same row) — `GroupMembersTab` gained a `currentUserId` prop, `MemberRow` gained an
`isCurrentUser` flag compared against each `GroupMember.userId`. Not applied to "Waiting for group
approve"/"Waiting for user accept" — those rows are never the viewer themselves (the viewer is the
approver/inviter, not the applicant/invitee shown in the row).

**Wiring:** `GroupTabs` gained a `'members'` `GroupTabKey` entry (`IconUsers`) between Chat and
Settings. `GroupsPage.tsx` added the modal's open/query/remount-count state (same
`createGroupOpenCount` pattern as `CreateGroupModal`/`AddSportModal`) and wired
`useGroupMembersTabData(selectedGroup?.id, activeGroupTab === 'members', selectedGroup?.currentUserRole ?? null)`
alongside the existing `useSettingsUnsavedGuard` call. No unsaved-changes guard needed for the
Members tab itself (no draft/save state) — `guardedSetActiveGroupTab` still wraps switching *away
from* Settings, unchanged.

**MSW + fixtures** (`e2e/mocks/`): new fixtures `mockGroupMembers` (roster for `mockOwnedGroup` —
the test user as owner, plus an admin and a member), `mockGroupJoinRequest` (pending request against
`mockOwnedGroup`, distinct from the pre-existing `mockJoinRequest`, which is the test user's own
*outgoing* request against a different group), `mockSentInvitation`. New stateful handlers for the
three GETs plus accept/decline — accept removes the row from the group's pending queue and appends a
new `group_member` row, matching the real backend's behavior (verified live, see below).

## Tests

- Vitest+RTL: `GroupMembersTab.test.tsx` (9 cases — role gating, empty-vs-filtered-empty states,
  owner-first sort, filtering, Invite-friend callback, the `(you)` indicator scoped to only the
  viewer's own row), `InviteFriendModal.test.tsx` (4 cases), `useGroupMembersTabData.test.tsx`
  (3 cases, including "join-requests never fires when `canManage=false`"), `GroupTabs.test.tsx`
  extended with a Members-tab case (17 new tests total). Full suite: 447/447 Vitest passing,
  `tsc -b`/`eslint` clean.
- Storybook: `GroupMembersTab.stories.tsx` (member/admin/owner × populated/empty, plus
  loading/error states — owner and admin render identically since gating is a binary `canManage`,
  both included per the ticket's literal "owner/admin/member" wording), `InviteFriendModal.stories.tsx`,
  `GroupTabs.stories.tsx` extended. Storybook build clean.
- E2E: new `e2e/flows/group-members.spec.ts` (2 tests — owner's full 5-section/filter/invite/accept
  flow in 4 steps, plus a plain-member visibility check). Full `e2e` project: 38/38 passing, including
  the pre-existing `group-settings.spec.ts` (no regression from the `GroupTabs`/`GroupsPage` changes).
  `client/docs/E2E_OVERVIEW.md` updated: directory listing (§3),
  new `group-members.spec.ts` table (§6), and the `a11y.spec.ts` table extended for the new Groups-page
  check below.

### a11y gap found and closed (delta, approved by the user before implementation)

`a11y.spec.ts` had **zero** axe coverage for the Groups page — both GRP-1 and GRP-2's acceptance
criteria claimed "extends `a11y.spec.ts`", but neither actually added a Groups-page block (confirmed
by reading the file directly, not assumed from the tickets' own claims). Rather than silently
carrying the gap forward a third time, added one baseline check: Groups page, `mockOwnedGroup`
selected, Members tab active, owner role, 1280px — the richest of the per-group tabs (5 sections,
role-gated content, action buttons). This is a baseline, not a full breakpoint/tab matrix backfill
for Posts/Chat/Settings — that would be out of proportion for this ticket; flagged here so it isn't
mistaken for complete coverage.

## Verification against the real backend

Beyond MSW (which only proves the client's *assumed* contract, not the real one), registered two
real users against a live `./gradlew :server:bootRun` instance, created a sport profile + group, and
exercised the full flow directly via curl:

- `GET /groups/{id}/members` and `GET /groups/{id}/join-requests` response shapes confirmed to match
  `GroupMember`/`JoinRequest` field-for-field (both carry a `pageable` field neither client type
  models — harmless, TS only reads the keys it declares).
- `POST /groups/join-requests` (applicant) → `PUT /groups/join-requests/{id}/accept` (owner) →
  re-fetched `GET /groups/{id}/members` confirmed the applicant now appears with
  `roleName: "group_member"` — exactly what the MSW accept handler simulates.
- `GET /groups/{id}/invitations/sent` confirmed to return the same `PageResponse` shape on an empty
  result.
- `PUT /groups/join-requests/{id}/decline` on an already-accepted request correctly 400s
  ("Request is not pending") — confirms `isDeclineJoinRequestError`'s failure path is reachable.

No divergence from the approved Phase 3 design was needed — the real backend matched the contract
verified from `GroupServiceImpl`/`GroupController` source exactly.
