# GRP-7 · Wire the invitation approve/accept lifecycle

**Status:** `DONE` (2026-07-24)
**Type:** Feature
**Dependencies:** GRP-3 (`DONE`), GRP-4 (`DONE`), backend B11 (`DONE`,
`modules/social/group-impl/docs/B11_JOIN_INVITATION_RACE_CONDITIONS.md`)
**Filed:** 2026-07-23, discovered while closing out GRP-4

## Problem

`POST /api/groups/{groupId}/invitations` (B1) creates invitations, and GRP-3's "Waiting for user
accept" section is a read-only view of what's been sent — but the other two steps of the documented
3-step flow ("member invites → owner approves → invitee accepts") had zero client wiring. Six
backend endpoints sat completely unused. An invitation could be sent but never resolved.

## Design (as approved)

No new types — `GroupInvitation`/`JoinRequest` in `types.ts` already model all 6 endpoints' responses
exactly (verified field-for-field against `GroupInvitationResponse.java`).

**Part 1 — owner/admin approval, merged into the Members tab.** `useGroupMembersTabData.ts` gained a
`useGroupInvitations` query (`GET /{groupId}/invitations`, gated `isActive && canManage` same as the
existing join-requests query) and merges its result with join requests into one `approvalQueue:
ApprovalQueueItem[]` — a `{ type: 'join_request' | 'invitation', data }` discriminated union, sorted
**oldest-first by `createdAt`**. `acceptApprovalQueueItem`/`declineApprovalQueueItem` dispatch to the
right mutation (`useAcceptJoinRequest`/`useApproveInvitation` or
`useDeclineJoinRequest`/`useDeclineInvitation`) based on `item.type` — `GroupMembersTab` never knows
which endpoint actually fired. Both row types reuse the same "Accept"/"Decline" button labels — the
technical distinction (approve vs. accept) is invisible to the user. An invitation row shows the
**invitee's** name (matching "find member"'s filter target) with an "Invited by {inviterFullName}"
subtitle.

**Part 2 — invitee acceptance, on `GroupDiscoveryPanel`'s All-groups landing state.** New
`GroupInvitationsSection` component (own file, own stories/tests) renders above the joined-groups
grid, backed by a new `useGroupInvitationsData` hook (`GET /invitations/user`, sorted **newest-first**
— a personal inbox reads better with the newest arrival on top, unlike the Members tab's oldest-first
queue). Hidden **entirely** once loaded with zero rows, not a "Nothing here yet." message. Each row:
group name + "Invited by {inviterFullName}" + Accept/Reject. Accepting calls an `onAccepted(groupId)`
callback the hook takes as a param — `GroupsPage.tsx` passes `(groupId) => { setActiveSport('all');
selectGroupAndShowPosts(groupId); }`, keeping the `feedSpaceStore` orchestration in the page component
rather than inside the hook. `setActiveSport('all')` runs first because `GroupInvitationResponse`
carries no `sportId` and `data.groups` is sport-filtered — switching to 'all' first guarantees the
newly joined group resolves regardless of its own sport or of exactly when the background refetch
lands (the fragile refetch-then-lookup race the ticket's spec flagged).

## What was built

- `feedKeys.ts`: 2 new query keys (`groupInvitations`, `userPendingInvitations`).
- 6 new hooks in `features/feed/hooks/`: `useGroupInvitations`, `useApproveInvitation`,
  `useDeclineInvitation`, `useUserPendingInvitations`, `useAcceptInvitation`, `useRejectInvitation`.
- `useGroupMembersTabData.ts` extended with the merged `ApprovalQueueItem`/`approvalQueue` (exported
  type, consumed by `GroupMembersTab.tsx`).
- New `useGroupInvitationsData.ts`, composed directly in `GroupsPage.tsx` (per an explicit design
  choice over a single combined hook — the Members-tab approval queue and the cross-group invitation
  inbox are functionally separate UI surfaces).
- `GroupMembersTab.tsx`: `joinRequests`/`onAcceptJoinRequest`/etc. props replaced with
  `approvalQueue`/`onAcceptItem`/`onDeclineItem`; row rendering branches per item type.
- New `GroupInvitationsSection.tsx` component.
- `GroupDiscoveryPanel.tsx`: renders `GroupInvitationsSection` above the group grid, 8 new props.
- `GroupsPage.tsx`: wires `useGroupInvitationsData`, passes it into both components.
- MSW (`groups.ts`): 6 new handlers, 2 new session-state fields
  (`groupInvitationsState`/`userPendingInvitationsState`, deliberately separate from GRP-3's
  `sentInvitationsState` to avoid coupling this ticket's merged-queue behavior to GRP-3's existing
  fixtures/tests). The invitee-accept handler synthesizes a full `Group` from the matching
  `publicGroupsState` search result and prepends it to `userGroupsState`, matching the real "you're
  now a member" effect.
- 2 new fixtures: `mockGroupInvitation` (a `pending_owner` invitation sent by the group's *admin*, not
  its owner — post-B11, an owner/admin's own invite would skip `pending_owner` entirely, so an
  owner-authored fixture here would be unrealistic) and `mockReceivedInvitation` (a `pending_user`
  invitation to the test user for a group they haven't joined).
- New `e2e/flows/group-invitations.spec.ts` (3 tests): the merged-queue rendering + an
  approve-only-clears-the-queue-row assertion (approving does **not** add a member — only the
  invitee's own accept does), and the Invitations section's accept-then-navigate and
  hidden-when-empty behavior.
- Updated `E2E_OVERVIEW.md`'s catalog (directory listing, fixtures reference, related-docs line, new
  spec's own entry).

## A real bug the new fixtures exposed in an existing test

Seeding `mockGroupInvitation` into `mockOwnedGroup`'s approval-queue state means the **existing**
`group-members.spec.ts` test now has two "Accept" buttons in "Waiting for group approve" (the
pre-existing join request plus the new invitation) — its step 4 did a bare `getByRole('button', {
name: 'Accept' })` click with no row scoping, which is now a strict-mode violation (2 elements
matched). Fixed by scoping the click to Priya Shah's own row via an XPath ancestor lookup, same
pattern the new spec uses. Caught by running the full e2e suite, not by the new spec itself passing.

## Verification

- TypeScript: `tsc -b` clean across the whole client (including `e2e/**`).
- Vitest: 510/510 passing (full suite, run twice — once mid-implementation, once after all changes).
- Storybook: `storybook build` succeeds, including the new `GroupInvitationsSection` story and the
  updated `GroupMembersTab`/`GroupDiscoveryPanel` stories.
- Playwright `e2e` project: all 43 specs pass with `--workers=2` (the default full-parallelism run
  produced 27 scattered failures across totally unrelated specs — login, register, home-feed
  breakpoints — all timing out around 30s; confirmed as this sandbox's resource contention under 43
  parallel headed-browser workers, not a regression, by re-running at reduced parallelism and getting
  a clean pass).
- Live backend check: registered real users, drove all 6 endpoints against the actually-running
  Spring Boot backend (not just MSW) — every `GroupInvitation` response field matched the client type
  exactly; approve moved a row out of the owner's queue without creating membership; accept created a
  real `GroupMember` row; reject and decline both cleared their respective queues correctly.

## Out of scope (unchanged from the ticket)

The B11 dual-accepted-row consequence (a single join event can leave both an `accepted`
`GroupInvitation` and an `accepted` `GroupJoinRequest` row) doesn't actually surface in this UI —
both of GRP-7's lists only ever show *pending* items, so a B11 short-circuit just makes the row
disappear on refetch, identical to a normal accept/approve. No special handling was needed or added.
