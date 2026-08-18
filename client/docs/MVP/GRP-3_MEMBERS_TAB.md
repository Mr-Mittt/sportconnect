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

---

### GRP-3 · Members tab — group member management
**Status:** `DONE` (2026-07-21) · **Summary:** `client/docs/GRP-3_MEMBERS_TAB.md`
**Type:** Feature · **Dependency:** GRP-1 (`DONE`)
**Design reference:** none — no Members-tab markup exists in `design-reference-group-feed.html`
today; this ticket is scoped directly from the user's spec, not a mockup. Flag if a reference gets
added before pickup.

**Origin:** requested directly by the user (2026-07-20) — a new "Members" tab in `GroupTabs`,
positioned between Chat and Settings, for group member management.

**What ships:**
- New `GroupTabs` entry `'members'`, ordered **Posts → Chat → Members → Settings**.
- New `GroupMembersTab` component, two parts:
  1. **Header row** — a shared "find member" text input that filters all five lists below on
     `onChange` (case-insensitive substring match on name, no debounce — matches the literal spec)
     + an "Invite friend" button.
  2. **Five status-grouped lists**, all loaded together when the tab becomes active:
     - **Waiting for group approve** — pending join requests for this group. Visible to
       owner/admin only (hidden entirely for a `group_member`). Backed by the existing
       `GET/PUT /api/groups/{groupId}/join-requests*` (already owner/admin-gated server-side,
       `modules/social/group-impl`). Each row keeps the existing accept/decline actions.
     - **Waiting for user accept** — **scope broadened 2026-07-20 (delta from the original spec at
       the top of this ticket):** now shows *every* invitation the *current user* sent for this
       group that's still in flight — both `pending_owner` (awaiting owner/admin approval) and
       `pending_user` (owner/admin already approved, awaiting the invitee's reply), not just
       `pending_user` as originally scoped. User's reasoning: as the inviter, they want visibility
       into invitations they sent regardless of which stage they're stuck at, not only the
       approved-and-waiting-on-my-friend subset. Scoped to invitations sent by the viewer; **the
       whole section is hidden when empty**, not shown with an empty-state message. Backed by
       **B8, shipped 2026-07-20** (`modules/social/group-impl/docs/BACKLOG_MVP.md`,
       `modules/social/group-impl/docs/B8_INVITATION_STATUS_FILTER.md`): `GET
       /api/groups/{groupId}/invitations/sent` takes **no query param** and always returns both
       statuses in one page — **one request covers this whole section**, not two. Use each row's
       `status` to render a per-row label distinguishing the two in-flight states (e.g. "awaiting
       owner approval" vs. "awaiting {inviteeFirstName}'s response") rather than two separate
       sub-lists, unless a visual split reads better at implementation time.
     - **Group administrator** — members with `roleName` `group_owner` or `group_admin` (owner
       listed first — see open decision #1). Backed by `GET /api/groups/{groupId}/members`.
     - **Members** — members with `roleName` `group_member`. Same fetch as above, split
       client-side by role.
     - **Blacklist** — **no backend concept exists at all** (confirmed: no banned/blocked field,
       repository query, or endpoint anywhere in `group-impl`). Ships as a header + a permanent
       "Coming soon" empty state — no data, no actions. Real ban/block needs its own backend design
       pass (schema, ban/unban action, re-join blocking) before a follow-up client ticket can wire
       it — same treatment this backlog already gives the Matches/tournaments backend gap.
- **Invite friend modal** — opens on "Invite friend" click, search input pre-filled with whatever
  text is currently in the "find member" input (the spec's "preset search key"). Search results are
  **mocked** — a static "Search coming soon" state regardless of what's typed, no network call, no
  invite action wired. Real search + invite is **GRP-4** below.

**Open decisions made at scoping time (confirm before/at pickup if this feels wrong — same pattern
GRP-1 used):**
1. Owner is folded into "Group administrator" rather than a separate 6th section — the user's spec
   named exactly 5 sections.
2. None of the three backend endpoints involved (`getGroupMembers`, `getGroupJoinRequests`,
   `getMemberSentInvitations`) support a keyword filter — adding one to all three is out of
   proportion to this ticket. Each section fetches a single larger page (e.g. `size=100`) and
   filters client-side against "find member". Caps correct filtering at ~100 rows/section for MVP —
   a known scaling limit (same spirit as this backlog's A7/A8 N+1 notes), not silently swept under
   the rug.

**Backend mapping:**

| Section | Backend today | Notes |
|---|---|---|
| Waiting for group approve | Real — `GET/PUT /api/groups/{groupId}/join-requests*` | Already owner/admin-gated |
| Waiting for user accept | Real — B8 (`DONE`) | One call, no query param, returns both `pending_owner` and `pending_user` rows — split by `row.status` |
| Group administrator / Members | Real — `GET /api/groups/{groupId}/members` | No keyword filter — see open decision #2 |
| Blacklist | **No backend concept at all** | Ships as a permanent empty state; needs its own design pass |
| Invite friend modal | N/A — mocked on purpose in this ticket | Real wiring is GRP-4 |

**Acceptance criteria:**
- Members tab appears between Chat and Settings in `GroupTabs`, keyboard-navigable like the
  existing three.
- All five section headers render for an active group; "Waiting for group approve" hidden for
  non-owner/admin; "Waiting for user accept" hidden when empty.
- Typing in "find member" filters all visible lists in place, no navigation/reload.
- "Invite friend" opens a modal pre-filled with the current search text and a static "coming soon"
  result state — confirmed no network call.
- Storybook coverage: owner/admin/member role states × populated/empty variants for the five
  sections.
- No new axe violations (extends `a11y.spec.ts`).

**Executed:** shipped exactly as scoped above — new `GroupMembersTab`/`InviteFriendModal` components,
5 new API hooks (`useGroupMembers`/`useGroupJoinRequests`/`useSentInvitations`/
`useAcceptJoinRequest`/`useDeclineJoinRequest`), orchestration hook `useGroupMembersTabData`, all
wired into `GroupsPage`/`GroupTabs`. **Delta found and closed while satisfying this ticket's own "no
new axe violations (extends `a11y.spec.ts`)" AC**: `a11y.spec.ts` had zero Groups-page coverage at
all — both GRP-1 and GRP-2 claimed to extend it in their own acceptance criteria but neither actually
did (confirmed by reading the file directly). Added one baseline check (owner role, Members tab,
1280px) rather than silently carrying the gap forward a third time; not a full breakpoint/tab
backfill for Posts/Chat/Settings, which stays a known gap for a future ticket if it matters. New
`e2e/flows/group-members.spec.ts`, `client/docs/E2E_OVERVIEW.md` updated to match (§3 directory
listing, new spec's test table, `a11y.spec.ts`'s table extended). Verified live against a real
running backend beyond MSW (register → sport profile → create group → join-request → accept →
re-fetch members, via curl) — every new endpoint's response shape matched the client types exactly.
Full writeup: `client/docs/GRP-3_MEMBERS_TAB.md`.

---
