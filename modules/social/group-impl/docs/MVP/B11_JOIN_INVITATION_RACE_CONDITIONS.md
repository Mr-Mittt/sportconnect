# B11 · Reconcile join-request/invitation race conditions

**Status:** `DONE` (2026-07-23, corrected 2026-07-24 — see "Follow-up fix" below)
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

## Follow-up fix (2026-07-24) — `addMember` was missing rule 2

The initial pass wired rule 2 into exactly the two call sites the ADR (§5) named:
`approveInvitation`'s `pending_owner→pending_user` transition, and `createSelfApprovedInvitation`
(rule 1's owner/admin direct-create path in `createInvitation`). It missed a **third** call site
that also creates a `GroupInvitation` directly at `status="pending_user"`: `addMember` (B9's
owner/admin direct-add flow) — an owner/admin adding a friend directly still goes through a
self-approved invitation, not a direct `GroupMember` insert, and that invitation was going straight
to `pending_user` with no check for an existing pending join request from the target.

Caught by the user re-reviewing the three rules against the actual code, not by the original
implementation or its tests. Fixed by adding the same
`joinRequestRepository.findByGroupIdAndUserIdAndStatus(groupId, targetUserId, "pending")` check
`addMember` was missing, reusing the existing `acceptJoinRequestAsSideEffect` helper for the
short-circuit — no new helper needed, `addMember`'s shape (self-approved, `reviewedBy` = the acting
admin for both the invitation and the credited join-request reviewer) matches rule 1's path exactly.

- Two pre-existing `addMember` Spock tests needed a new stub for the added
  `joinRequestRepository.findByGroupIdAndUserIdAndStatus` call; one new test added for the
  short-circuit path itself (auto-accept via an existing pending join request).
- `./gradlew :modules:social:group-impl:test` (117 tests) and `./gradlew :server:test` both green
  after the fix.
- Live-verified against a running `bootRun` instance: user F sent a join request, then the group
  owner called `addMember` on F directly — F became a group member in that same call, and F's join
  request was closed out as `accepted` rather than left `pending`.

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

---

**Status:** `DONE` (2026-07-23, `modules/social/group-impl/docs/MVP/B11_JOIN_INVITATION_RACE_CONDITIONS.md`) ·
**Type:** Bug fix / business rule · **Dependency:** B1 (member invitation
flow, `DONE`), A3 (join requests, `DONE`) · **Filed:** 2026-07-23, found while scoping the client's
GRP-7 (`client/docs/BACKLOG_MVP.md`). **Blocks GRP-7** — the client ticket wires the approve/accept
UI for both flows and should be built against corrected business rules, not retrofitted after.

**Read `documentation/md/adr/JOIN_GROUP_ADR.md` §5 before implementing.** That section is the
canonical, diagrammed version of the three rules below — both tables' full schema/use-case
background (§1–4) plus two Mermaid sequence diagrams showing exactly where each rule's check sits
in the existing `createInvitation`/`approveInvitation`/`createJoinRequest` flows, tagged by rule
number. The prose here is a summary; the diagrams are the source of truth for the exact
call-site/branch structure. If implementation reveals the rules need to change, **update §5 first,
then this ticket** — don't let them drift apart.

**Origin:** `group_join_requests` (self-service) and `group_invitations` (member-initiated) are
independent tables with no cross-awareness today. Verified by reading the actual service methods:
`createInvitation` always sets `status="pending_owner"` regardless of who the inviter is
(`GroupServiceImpl.java:991`); `approveInvitation` flips `pending_owner→pending_user` with no check
for anything else pending for that (group, user) pair (`GroupServiceImpl.java:1000-1021`);
`createJoinRequest` checks membership + an existing pending join request + capacity, but never
checks for an existing invitation (`GroupServiceImpl.java:563-597`). Three real races fall out of
this:

1. A member invites A (→ `pending_owner`). Before the owner approves, A independently sends a join
   request for the same group. Today both rows sit there as two unrelated pending items — the owner
   has to separately act on each, and approving the invitation still leaves A needing to
   individually accept it, ignoring that A already proved intent via the join request.
2. An owner/admin invites A directly. There's no reason for the owner to "approve their own
   invitation," but today it still starts at `pending_owner` and needs an explicit approve step
   before A can even see it.
3. If A already has, or independently creates, a join request while an invitation to A is sitting at
   `pending_user`, nothing connects the two — A ends up needing to act on the invitation separately
   even though a join request is exactly as strong a signal of intent.

**What ships — three rules (user-specified 2026-07-23, resolved interaction confirmed same day):**

1. **`createInvitation`**: if the inviter passes `canManageMembers(groupId, inviterId)` (owner or
   admin), create the invitation at `status="pending_user"` directly — skip `pending_owner`
   entirely, since there's no one else who needs to approve the owner/admin's own action.
2. **Join-request short-circuit, checked at every point an invitation is about to enter
   `pending_user`** — both `approveInvitation`'s normal `pending_owner→pending_user` transition
   *and* rule 1's direct-to-`pending_user` creation path (confirmed: both call sites need this
   check, not just `approveInvitation` — an owner-authored invitation must also check for a
   pre-existing join request from that user, or the owner-authored path could skip the ADR's rule
   entirely). If a `pending` `GroupJoinRequest` already exists for that (group, user): skip
   `pending_user`, set the invitation `status="accepted"` directly, create the `GroupMember` row,
   post the welcome message (crediting the invitation's `inviterId`) — **and** update the join
   request's own row to `status="accepted"` with `reviewedBy`/`reviewedAt` set (confirmed: don't
   leave it dangling at `pending` — it would otherwise sit as a phantom row in the owner's
   "Waiting for group approve" queue forever, with no clean way to act on it since the user is
   already a member).
3. **`createJoinRequest`**: before creating a new row, check for an existing `pending_user`
   `GroupInvitation` for that (group, user). If one exists: do **not** create a join request row at
   all — instead accept that invitation directly (`status="accepted"`, create `GroupMember`, post
   welcome message, same effect as `acceptInvitation`).

**Open questions to resolve at pickup:**
- `createJoinRequest`'s declared return type is `JoinRequestResponse` — when rule 3 short-circuits
  and no join request is ever created, what does the endpoint return? A few options: a
  `GroupInvitationResponse`-shaped result instead (contract change — needs a client-side type
  update too), a synthetic `JoinRequestResponse` with `status="accepted"` pointing at the resolved
  invitation's id (keeps the response shape stable but is semantically odd — it's not really a join
  request), or a different response wrapper entirely for this case. Pick before implementing, not
  during — this is a real API-contract decision, not a detail to improvise mid-method.
- All three rules end in the same "create GroupMember + post welcome message" effect that already
  exists three times over (`acceptJoinRequest`, `acceptInvitation`, and now this). Worth extracting
  a shared private helper (e.g. `finalizeMembership(groupId, userId, creditedInviterId)`) rather
  than a fourth near-identical block — not required for correctness, but flagged since the
  duplication was already borderline before this ticket adds a fourth copy.
- Capacity: every new short-circuit path (`createInvitation`'s owner-authored case, both
  `pending_user`-entry check-ins, `createJoinRequest`'s short-circuit) results in an actual
  membership creation and must run `checkMemberCapacityNotExceeded`/`enforceMemberCapacity` exactly
  like the existing accept paths do — easy to miss since these are new code paths, not extensions of
  the ones that already have the check.
- Decline-side interactions (declining an invitation/join request while the other is also pending)
  are **explicitly out of scope** for this ticket — only the three rules above, as specified. Don't
  invent additional symmetric rules beyond what's written here.

**Delta (2026-07-23, resolved at pickup, executed as shipped):**
- **Return-shape open question resolved differently than either floated option:** neither a
  `GroupInvitationResponse`-shaped result nor a synthetic accepted `JoinRequestResponse` — rule 3
  always creates a **real** `GroupJoinRequest` row, directly at `status="accepted"`, with
  `reviewedBy` set to the invitation's approver. The endpoint's return type and contract are
  completely unaffected; no client-side change needed for this case.
- **Confirmed consequence of that choice, explicitly accepted by the user:** rules 2 and 3 can now
  leave **two** `accepted` rows for a single real join event — one `GroupInvitation`, one
  `GroupJoinRequest` — both persisted as-is, no merge/suppression logic added. Flagged on GRP-7's
  backlog entry (`client/docs/BACKLOG_MVP.md`) for the client's future display decision.
- `finalizeMembership(groupId, userId, creditedInviterId)` helper extracted as suggested — confirmed
  with the user rather than left as an optional cleanup, since this ticket was about to add a 4th
  near-identical copy of the capacity+insert+welcome-post block.
- Full writeup: `modules/social/group-impl/docs/MVP/B11_JOIN_INVITATION_RACE_CONDITIONS.md`.

**Acceptance criteria:**
- All three rules verified with a live-backend walkthrough (register two users, exercise each race
  in order), not just Spock mocks — these are exactly the kind of cross-repository interaction
  GRP-4's own verification found real gaps in.
- Spock coverage in `GroupServiceImplSpec` for each of the three rules independently, plus the
  combined case (rule 1 + rule 2 interaction: owner-authored invitation created after a pending join
  request already exists).
- `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both green.
- No regression to the existing single-flow paths (a plain member's invitation still starts at
  `pending_owner` and still requires explicit owner approval when no join request is in play; a
  plain join request with no invitation in play behaves exactly as today).

**Out of scope:**
- Any client-side change — GRP-7 depends on this ticket, not the other way around; the client's
  merged "Waiting for group approve" list (already scoped in GRP-7) should reflect whatever these
  corrected backend semantics produce, once this ships.
- Decline-side symmetric rules (see above).
- The `group_invitations` table's missing DB-level FKs/CHECK constraint on `status` — a
  pre-existing, separate gap noted in `JOIN_GROUP_ADR.md`, not this ticket's concern.

---
