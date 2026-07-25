# B14 · Track every co-inviter on a single group invitation

**Status:** `DONE` (2026-07-25) · **Type:** Feature · **Module:** `modules/social/group-impl`

## Origin

Filed alongside client ticket **GRP-8** (`client/docs/BACKLOG_MVP.md`) — the user wants, when more
than one group member independently invites the same prospective member, both the invitee's own
Invitations view and the owner/admin's approval queue to show one merged row ("Invited by X, Y, Z"),
with a single owner/admin approval covering all of them.

**Current behavior before this ticket:** `createInvitation`'s
`existsByGroupIdAndInviteeIdAndStatusIn(groupId, inviteeId, [pending_owner, pending_user])` check
meant a second, different member's invite attempt for an already-pending invitee silently returned
the existing single-inviter invitation unchanged — the second inviter was never recorded anywhere.

## Design decisions (confirmed with the user before implementation)

1. **One canonical invitation row, not one row per inviter.** The alternative (duplicate rows,
   bulk-approved/bulk-declined together) would reintroduce exactly the class of multi-row race
   **B11** was filed to eliminate — two independently-transitioned rows for the same real-world
   event can drift out of sync. A single row with multiple recorded inviters has no such race:
   there is nothing to reconcile.
2. **Owner/admin joining a still-`pending_owner` invitation as a co-inviter auto-approves it**
   toward `pending_user` (or straight to `accepted` under B11 rule 2) — same reasoning as B11 rule
   1's self-approval for a brand-new invitation, applied to a co-invite. A regular member joining
   does *not* change the status.
3. **`getMemberSentInvitations` matches any recorded co-inviter**, not just the row's original
   creator — a member who joins an already-pending invitation as a co-inviter sees it in their own
   "sent invitations" list too, not only the person who created the row.
4. **Cancel is per-co-inviter, not per-row.** Any recorded co-inviter can withdraw their own invite
   (deletes only their `group_invitation_inviters` row); the invitation itself is deleted only once
   its *last* co-inviter withdraws. This is a materially different design from B12's original
   single-inviter cancel — confirmed directly with the user rather than assumed.
5. **Confirmed live and in unit tests** that a *terminal* prior invitation (`declined_by_owner` or
   `declined_by_user`) does **not** count as "still invited" — a subsequent invite creates a
   genuinely fresh row, not a merge. This falls out of `existsByGroupIdAndInviteeIdAndStatusIn`
   already being scoped to only the two in-flight statuses; B14 didn't need to change that check,
   only verify it (user explicitly asked for both terminal statuses to be covered in tests, not just
   one).
6. **`GroupInvitation.inviterId` (the legacy single column) is never reassigned.** If the original
   creator later withdraws their own co-invite but other co-inviters remain, `inviterId`/
   `inviterFullName` (singular, kept for backward compatibility) keep showing that original person's
   name even though they're no longer in `inviterFullNames`. Consistent with this codebase's existing
   "`createdBy` never changes" precedent (e.g. `Group.createdBy` survives ownership transfer) — flagged,
   not fixed, since fixing it would mean reassigning a field this codebase treats elsewhere as an
   immutable historical fact.

## What shipped

- **Migration `V029__create_group_invitation_inviters.sql`**: new `group_invitation_inviters` table
  (`invitation_id` FK, `inviter_id`, `created_at`, unique on `(invitation_id, inviter_id)`), backfilled
  from every existing `group_invitations.inviter_id` in the same migration.
- **New entity** `GroupInvitationInviter` + **new repository** `GroupInvitationInviterRepository`
  (`existsByInvitationIdAndInviterId`, `findByInvitationIdInOrderByCreatedAt`, `countByInvitationId`,
  `deleteByInvitationIdAndInviterId`).
- **New repository query** `GroupInvitationRepository.findByGroupIdAndCoInviterIdAndStatusIn` (EXISTS
  subquery against the join table) — replaces `findByGroupIdAndInviterIdAndStatusIn` in
  `getMemberSentInvitations`.
- **DTO**: `GroupInvitationResponse.inviterFullNames: List<String>` (oldest-first; a singleton list
  in the common single-inviter case), alongside the unchanged singular `inviterId`/`inviterFullName`.
- **Every `GroupInvitation`-creating path now records its creator as the first co-inviter** — not
  just `createInvitation`'s merge branch, but all three places a new row is built:
  `createInvitation`'s normal create, `createSelfApprovedInvitation`, and `addMember`'s direct-add
  path. Necessary for `inviterFullNames` to be populated for every invitation created after this
  ships, not just merged ones.
- **`createInvitation`'s "already invited" branch** now calls a new `recordCoInviterIfNew` helper:
  records the new co-inviter (no-op if already recorded), and if they're newly added, owner/admin,
  and the row is still `pending_owner`, transitions it via a new shared
  `transitionInvitationTowardPendingUser(GroupInvitation, UUID reviewerId)` helper — extracted from
  `approveInvitation`'s existing body (the B11-rule-2 "check for a pending join request, then
  `pending_user`-or-`accepted`" logic), now reused by both. `createSelfApprovedInvitation`/
  `addMember` are *not* refactored onto this helper — they build a brand-new row rather than mutate
  an existing one, a different enough shape that forcing them through it wouldn't simplify anything.
- **`cancelInvitation`**: authorization check changed from `inviterId == callerId` to
  `existsByInvitationIdAndInviterId` (any co-inviter); deletes only the caller's own join-table row,
  cascading to delete the parent `group_invitations` row only when the co-inviter count reaches zero.
- **N+1-safe batched mapping**: new `buildCoInviterIdsByInvitation(List<GroupInvitation>)` (one query
  per page, not per row) + `buildInviterInviteeUserMap` extended to also resolve co-inviter user ids +
  `mapToGroupInvitationResponse` gains a `Map<Long, List<UUID>>` param. All 6 page-returning call
  sites updated (`getGroupInvitations`, `getDeclinedInvitations`, `getUserPendingInvitations`,
  `getMemberSentInvitations`, plus `createInvitation`'s two single-response paths via a new
  `mapSingleInvitationResponse` wrapper) — consolidated behind a new `mapInvitationPage` helper for
  the four same-group-name page methods.

## Out of scope (confirmed with the user)

- No UI/API to remove one co-inviter individually outside of `cancelInvitation`'s own withdraw
  action, and no per-co-inviter timestamps beyond `created_at` on the join row.

## Tests

`GroupServiceImplSpec` — 13 new cases plus updates to every existing invitation-related test whose
mocked interactions changed shape (the new `invitationInviterRepository` calls, and `save()`'s return
value now being read where it wasn't before):

- Co-inviter merge: a new regular member joining doesn't change status; the already-a-co-inviter
  case is a no-op (existing "duplicate pending" test, extended).
- Owner/admin auto-approve on merge, including the B11-rule-2 short-circuit-to-`accepted` sub-case.
- **Both terminal statuses** (`declined_by_owner` and `declined_by_user`) produce a fresh row, not a
  merge — two dedicated tests, per the user's explicit request to cover both, not just one.
- `cancelInvitation`'s per-co-inviter delete (last co-inviter → row deleted) and withdraw-without-delete
  (other co-inviters remain) cases, plus updated not-a-co-inviter/inactive-group/wrong-status cases.
- `getMemberSentInvitations` returning a row where the caller is a co-inviter but not the original
  inviter.
- Response mapping's `inviterFullNames` ordering (oldest-first).

`./gradlew :modules:social:group-impl:test` (132 tests) and `./gradlew :server:test` both green.

## Live verification (real running backend)

Two scripted end-to-end runs against a live `bootRun` instance:

1. **Merge**: two different regular members invite the same person — owner's pending queue shows
   one row, `inviterFullNames` lists both.
2. **Cascade withdraw**: first co-inviter withdraws → row survives showing only the second; second
   co-inviter withdraws too → row is gone from the owner's queue entirely.
3. **Fresh row after a terminal invitation**: member invites, owner declines (`declined_by_owner`),
   same member invites again → confirmed via distinct ids (26 vs. 27) that a brand-new row was
   created, not a merge with the declined one. Also confirmed B13's `/declined` endpoint correctly
   excludes it (that endpoint is `declined_by_user`-only by design — this row is
   `declined_by_owner`).
4. **Owner/admin auto-approve**: member invites (`pending_owner`), owner co-invites the same person →
   response shows `status: pending_user`, `reviewedBy` set to the owner, `inviterFullNames` listing
   both.
5. **Co-inviter's own sent-invitations view**: the owner (a co-inviter, not the original inviter on
   that row) sees the invitation in their own `GET /{groupId}/invitations/sent` — confirms the query
   isn't scoped to the original creator.

## Client impact

Unblocks **GRP-8** parts 2 and 4 (invitee-side merged invitations display, Members-tab approval-queue
merged display) — both can now read `inviterFullNames` directly instead of the client-side
groupId-merge logic GRP-8's original spec sketched (which this ticket's own filing already flagged as
unreachable under the old backend behavior). No existing client code reads `inviterFullNames` yet
(new field, additive) or calls the changed `cancelInvitation` in a way this breaks — its request/
response shape is unchanged, only the server-side authorization/deletion semantics.
