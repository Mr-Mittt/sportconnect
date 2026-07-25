# B13 · Persist a rejection reason on invitee-declined invitations

**Status:** `DONE` (2026-07-24) · **Type:** Enhancement · **Module:** `modules/social/group-impl`

## Origin

Filed alongside client ticket **GRP-8** (`client/docs/BACKLOG_MVP.md`) — GRP-8's invitee-facing
reject flow asks for a reason before rejecting an invitation, but `PUT
/invitations/{invitationId}/reject` took no request body at all: `GroupController.rejectInvitation`
had no `@RequestBody` parameter, and `GroupInvitation` had no reason/notes column.

## Design decisions (confirmed with the user before implementation)

1. **Reason is optional at the API layer.** `RejectInvitationRequest.reason` has no `@NotBlank` —
   the client can still gate its own Reject button on a non-empty textarea (GRP-8's scope), but the
   backend never requires it. A `null`/omitted reason is valid.
2. **Length cap: 500 characters** (`@Size(max = 500)`), tighter than `Post.content`'s uncapped
   precedent but matching a short "why" field rather than long-form content.
3. **Visibility: owner/admin only**, not the invitation's inviter(s). This ruled out surfacing
   `rejectReason` via `getMemberSentInvitations` (member-facing — any inviter, not just owner/admin,
   can call it) and required a genuinely new read path, since neither existing invitation-listing
   endpoint returns a rejected row at all:
   - `getGroupInvitations` filters strictly to `pending_owner` (the owner/admin's approval queue) —
     by design, so GRP-3/GRP-7's merged approval-queue list never shows resolved invitations mixed in
     with real pending ones.
   - `getMemberSentInvitations` filters to `pending_owner`/`pending_user` only (B8's "still in
     flight" set) — a terminal `declined_by_user` row is excluded there too.

   Resolved by adding a new, narrowly-scoped endpoint (`GET
   /{groupId}/invitations/declined`, owner/admin only) rather than repurposing either existing one and
   risking a contract change those tickets' client code already depends on.

## What shipped

- **Migration `V028__add_reject_reason_to_group_invitations.sql`**: `ALTER TABLE group_invitations
  ADD COLUMN reject_reason TEXT` (no DB-level length constraint — same precedent as
  `group_join_requests.message`; the 500-char cap is enforced only at the Bean Validation layer).
  Registered in `db.changelog-master.xml`.
- **Entity**: `GroupInvitation.rejectReason` (`String`, nullable).
- **DTOs** (`group-api`):
  - New `RejectInvitationRequest { @Size(max = 500) String reason; }`.
  - `GroupInvitationResponse` gains `rejectReason`.
- **Service interface** (`GroupService`):
  - `rejectInvitation(Long invitationId, UUID inviteeId, String reason)` — added the `reason` param
    directly (not the request DTO), keeping the service layer decoupled from the web-layer request
    shape, consistent with every other service method in this interface.
  - New `getDeclinedInvitations(Long groupId, UUID ownerId, Pageable pageable)`.
- **Service impl** (`GroupServiceImpl`):
  - `rejectInvitation` persists `reason` onto `rejectReason` alongside the existing
    `status = "declined_by_user"` transition — no other business-rule change.
  - `getDeclinedInvitations` mirrors `getGroupInvitations`'s owner/admin gate (`canManageMembers`,
    404 if the group doesn't exist) but queries `invitationRepository.findByGroupIdAndStatus(groupId,
    "declined_by_user", pageable)` — reused the existing repository method (already used by
    `getGroupInvitations` with a different status literal), no new repository method needed.
  - `mapToGroupInvitationResponse` includes `rejectReason` for every response built from this method,
    not just the new endpoint.
- **Controller** (`GroupController`):
  - `rejectInvitation` now takes `@RequestBody(required = false) @Valid RejectInvitationRequest
    request` — `required = false` so an invitee who sends no body at all (not even `{}`) still binds
    to `null`, matching "optional at the API layer." `@Valid` enforces the 500-char cap when a body
    is present.
  - New `GET /{groupId}/invitations/declined` (`@PreAuthorize("hasRole('USER')")`, same pattern as
    every other invitation endpoint — the real owner/admin gate is `canManageMembers` inside the
    service, matching `getGroupInvitations`'s precedent of enforcing this in the service layer, not
    the security annotation).

## Out of scope (confirmed with the user)

- No reason field on `declineJoinRequest` (the owner/admin's join-request decline) — only invitation
  reject was in scope.
- No `declined_by_owner` rows on the new `/declined` endpoint — an owner-declined invitation never
  reached the invitee, so there's no rejection reason to show for it.

## Tests

- `GroupServiceImplSpec`:
  - `rejectInvitation` — reason persisted; `null` reason allowed; still throws on a non-`pending_user`
    invitation (existing case, unchanged behavior).
  - `getDeclinedInvitations` — group-not-found (404), caller-not-owner/admin (400, mirrors
    `getGroupInvitations`'s existing failure-case shape), happy path (owner caller, one
    `declined_by_user` row returned with its `rejectReason`).
- `GroupControllerTest` (server-level MockMvc, `GroupService` mocked): `rejectInvitation_WithReason_Success`,
  `rejectInvitation_NoBody_Success` (confirms an entirely missing body binds to a `null` reason, not
  a binding error), `getDeclinedInvitations_Success`, `getDeclinedInvitations_NotOwnerOrAdmin_ReturnsBadRequest`.
- `./gradlew :modules:social:group-impl:test` and `./gradlew :server:test` both green.
- **No H2 test-schema update needed** — confirmed `group_invitations` isn't modeled in
  `server/src/test/resources/schema.sql` at all (the only server-level test touching invitations,
  `GroupControllerTest`, mocks `GroupService` entirely, never touching the real repository/H2 DB).

## Live verification (real running backend, not just MSW/mocks)

Registered two real users, sent/accepted a real friend request, gave the owner a sport profile,
created a group, enabled `allowMemberInvites`, had the owner self-invite the invitee (lands directly
at `pending_user` per B11 rule 1), rejected with reason `"Schedule does not work for me"`, then:
- `GET /groups/{groupId}/invitations/declined` as the owner returned the row with that exact
  `rejectReason`.
- The same call as the invitee (non-owner/admin) correctly 400'd: `"Only group owner or admin can
  view declined invitations"`.

## Client impact

Unblocks **GRP-8**'s reject-with-reason confirmation dialog
(`client/docs/BACKLOG_MVP.md`). No existing client code calls `rejectInvitation` or either
invitation-listing endpoint in a way this changes — `rejectInvitation`'s new body parameter is
additive (a client sending no body still works), and `getDeclinedInvitations` is a brand new
endpoint with no prior caller.
