# B11 · Reconcile join-request/invitation race conditions

**Status:** `DONE` (2026-07-23)
**Type:** Bug fix / business rule
**Dependencies:** B1 (member invitation flow), A3 (join requests)
**Filed:** 2026-07-23, found while scoping the client's GRP-7 (`client/docs/BACKLOG_MVP.md`)

## Problem

`group_join_requests` (self-service) and `group_invitations` (member-initiated) are independent
tables with no cross-awareness. Three real races fell out of that:

1. A member invites A (→ `pending_owner`). Before the owner approves, A independently sends a join
   request for the same group — two unrelated pending rows, two separate approval actions for what
   is really one intent.
2. An owner/admin invites A directly — there's no reason for them to "approve their own invitation,"
   but it still started at `pending_owner` and needed an explicit approve step.
3. A already has (or independently creates) a join request while an invitation to A sits at
   `pending_user` — nothing connects the two.

The canonical, diagrammed reference for the three rules (with sequence diagrams tagged by rule
number) is `documentation/md/adr/JOIN_GROUP_ADR.md` §5 — read that alongside this doc.

## Design (as approved)

Scope confined to `GroupServiceImpl.java` (plus its Spock spec) — no migration, no entity changes,
no `GroupService` interface signature changes. `group_join_requests.status` already allows
`'accepted'`; `group_invitations.status` has no DB-level CHECK constraint (a pre-existing gap noted
in the ADR, not this ticket's concern). This also means **zero client-side contract change**.

**Extracted helper — `finalizeMembership(groupId, userId, creditedInviterId)`:** capacity-enforce
(`enforceMemberCapacity`), insert the `GroupMember` row, post the B9 welcome message. Both
pre-existing accept paths (`acceptJoinRequest`, `acceptInvitation`) were refactored onto this helper
instead of duplicating the three steps a third and fourth time.

**Rule 1 — `createInvitation`:** after the existing gates (membership, `allowMemberInvites`,
invitee-not-already-member, friends check, capacity), if `canManageMembers(groupId, inviterId)` is
true, control branches into a new `createSelfApprovedInvitation(...)` helper instead of building a
`pending_owner` row.

**Rule 2 — both entry points where an invitation is about to become `pending_user`:**
`createSelfApprovedInvitation` (rule 1's path) and `approveInvitation` both check
`joinRequestRepository.findByGroupIdAndUserIdAndStatus(groupId, inviteeId, "pending")` (pre-existing
repo method, no new query added). If found: invitation goes to `status="accepted"` with
`reviewedBy`/`reviewedAt` = the acting owner/admin; `finalizeMembership(groupId, inviteeId,
invitation.inviterId)` runs; and the join request is marked `accepted` via a shared
`acceptJoinRequestAsSideEffect(joinRequest, creditedInviterId, reviewerId)` helper — the two ids
differ in the `approveInvitation` case (a regular member's original invite vs. the approving
owner/admin).

**Rule 3 — `createJoinRequest`:** before the existing already-a-member → pending-request-exists →
capacity checks, look up `invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(groupId,
userId, List.of("pending_user"))` (pre-existing repo method). If present, a `GroupJoinRequest` row
is still created — **directly as `status="accepted"`**, `reviewedBy` set to
`invitation.getReviewedBy()` (the invitation's approver) — alongside accepting the invitation and
finalizing membership. If absent, the existing pending-request/capacity/create-pending flow is
unchanged.

## Delta from the ticket's open questions (resolved at pickup, 2026-07-23)

- **Rule 3's return-shape question** (the ticket flagged this as unresolved: `createJoinRequest` is
  declared to return `JoinRequestResponse`, but no join request was going to be created in the
  short-circuit branch). **Resolved differently than either option the ticket floated**: instead of
  a synthetic response or a contract change, rule 3 now *always* creates a real
  `GroupJoinRequest` row — just directly at `status="accepted"` — so the endpoint's return type
  and contract are completely unaffected. This was a direct user decision, not an implementer
  default.
- **Dual-record consequence, confirmed with the user:** this means a single real join event (rules
  2 or 3) can leave **two** `accepted` rows behind — one `GroupInvitation`, one
  `GroupJoinRequest` — for the same (group, person) pair. This is deliberate: no merge/suppression
  logic was added. **Note for GRP-7** (client, `client/docs/BACKLOG_MVP.md`): when building any view
  that lists accepted/historical membership events, be aware a single join can appear as two rows
  from two different endpoints; how (or whether) to de-duplicate this in the UI is an open
  client-side decision, not resolved here.
- **`finalizeMembership` extraction:** built as designed — confirmed with the user rather than left
  as the ticket's "not required for correctness" aside, since this ticket was about to add a 4th
  near-identical copy of the capacity+insert+post block.

## Verification

- `./gradlew :modules:social:group-impl:test` — full suite green, including regression fixes to
  four pre-existing tests whose mocks needed new stubs for the added `canManageMembers`/
  `joinRequestRepository`/`invitationRepository` lookups, plus five new B11-specific cases (rule 1
  alone, rule 1+2 combined via `createInvitation`, rule 2 via `approveInvitation`, rule 3 via
  `createJoinRequest`, plus the existing-path regression coverage already in the suite).
- `./gradlew :server:test` — green, no `GroupControllerTest` regressions.
- Live-backend walkthrough (register users, real friend requests, real group, real invites/join
  requests) exercised all three rules against a running `:server:bootRun` instance:
  - Race 1 (rule 2 via `approveInvitation`): member invited A, A independently sent a join
    request, owner approved the invitation → A became a member immediately and A's join request
    was closed out as `accepted` (not left `pending`).
  - Race 2 (rule 1): owner invited D directly → invitation created at `pending_user` directly
    (`reviewedBy` self-attributed), skipping `pending_owner`.
  - Race 3 (rules 1+2 combined): E sent a join request first, then the owner invited E directly →
    invitation landed as `accepted` in the same call, skipping both `pending_owner` and
    `pending_user`, and E became a member immediately.

## Out of scope (unchanged from the ticket)

- Any client-side change — GRP-7 depends on this ticket, not the other way around.
- Decline-side symmetric rules (declining one flow while the other is also pending).
- The `group_invitations` table's missing DB-level FKs/CHECK constraint on `status` — pre-existing
  gap noted in the ADR, not this ticket's concern.
