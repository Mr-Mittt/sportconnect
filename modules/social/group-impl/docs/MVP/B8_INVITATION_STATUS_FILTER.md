# B8 · Extend member-sent invitations to include owner-approved status

**Status:** `DONE` (2026-07-20)
**Type:** Enhancement
**Module:** `modules/social/group-impl`

## Revision (2026-07-20, same day, before commit)

The design below ("Design (approved at pickup)") shipped first as a `status` query param — the
user's explicit choice at the time. Later the same session, while scoping GRP-3's request count,
the user reversed that decision: as a group member/owner/admin, they want to see **both**
`pending_owner` and `pending_user` invitations they sent in **one request**, not one call per
status. The endpoint now always returns both statuses together; `GroupInvitationResponse.status`
on each row is how the client tells them apart. **The "What changed"/"Tests" sections below are
kept as originally written for history, but are superseded by this revision** — see the final
shipped shape in the code, not the query-param description below. Net effect on `group-api`:
`GroupService.getMemberSentInvitations` is now `(groupId, inviterId, pageable)` — 3 args, no
`status` — and `GroupInvitationRepository` gained `findByGroupIdAndInviterIdAndStatusIn` (the
single-status `findByGroupIdAndInviterIdAndStatus` method was removed as dead code once nothing
called it anymore).

## Origin

Filed for the client's **GRP-3** (`client/docs/BACKLOG_MVP.md`) — its Members tab needs a "waiting
for user accept" list: invitations the caller sent for a group that an owner/admin already approved
(status `pending_user`) and the invitee hasn't responded to yet.

**Found while scoping GRP-3:** `GroupServiceImpl.getMemberSentInvitations()` hardcoded its status
filter to `pending_owner` only, so `GET /api/groups/{groupId}/invitations/sent` could never return a
`pending_user` row — the exact status GRP-3's new section needs.

## Design (approved at pickup)

Two approaches were on the table:
1. Widen the query to `status IN (pending_owner, pending_user)`, one call returns both, client
   splits by `status` client-side.
2. Add an explicit `status` query param — client makes one call per status it needs.

**User chose option 2** (query param) over the ticket's originally-suggested option 1. Also
confirmed: update the endpoint's `@Operation`/Swagger description to document the new param, rather
than leaving API docs silent about it.

## What changed

- **`GroupService.getMemberSentInvitations`** (`group-api`) — signature gained a `String status`
  parameter. Javadoc added documenting the two accepted values and the validation behavior.
- **`GroupServiceImpl.getMemberSentInvitations`** (`group-impl`) — validates `status` is exactly
  `"pending_owner"` or `"pending_user"` (throws `BadRequestException` otherwise — a terminal status
  like `accepted`/`declined_owner` would never be useful to page through in this "still waiting on
  something" view, so it's rejected rather than silently returning an empty page). Passes `status`
  straight through to the existing `GroupInvitationRepository.findByGroupIdAndInviterIdAndStatus`
  query — **no repository change needed**, since that method already took a single status; only the
  hardcoded literal was replaced with the new parameter.
- **`GroupController.getMemberSentInvitations`** — added `@RequestParam(required = false,
  defaultValue = "pending_owner") String status`. Default preserves the endpoint's exact prior
  behavior for any caller that omits the param (none exist in this codebase today — no client ticket
  currently calls this endpoint — but the default keeps the contract non-breaking regardless).
  `@Operation`/`@ApiResponses` updated: describes both accepted `status` values and documents the new
  400 case (invalid status).

**Not changed:** `GroupInvitationRepository` (existing single-status method was sufficient),
`getGroupInvitations` (owner/admin incoming-approval view) and `getUserPendingInvitations`
(invitee-facing view) — both already return the correct status set for their own purpose, out of
scope per the ticket.

## Tests

`GroupServiceImplSpec` — updated the existing "not a member" throw test to the new 4-arg call
signature, and added three new cases:
- `status` outside `{pending_owner, pending_user}` → `BadRequestException`, repository never called
  (`0 * invitationRepository.findByGroupIdAndInviterIdAndStatus(*_)`).
- `status=pending_owner` → returns only `pending_owner` rows, mapped through the existing
  `buildInviterInviteeUserMap`/`mapToGroupInvitationResponse` path.
- `status=pending_user` → returns only `pending_user` rows.

No `GroupControllerTest` (server-level `MockMvc` test) exists for this endpoint today (confirmed —
grepped `server/src/test` for `getMemberSentInvitations`/`invitations/sent`, no matches) — out of
scope to add one here since it wasn't part of B8's suggested scope and no existing precedent for this
specific endpoint needed updating.

**Superseded (2026-07-20, later same session):** the above "no integration test" gap was flagged
back to the user (in response to "is there any it test create/update?") and closed. Two new
`GroupControllerTest` cases added, `server/src/test/java/com/sportconnect/integration/
GroupControllerTest.java`:
- `getMemberSentInvitations_Success` — real `MockMvc` request against `GET
  /api/groups/1/invitations/sent`, `GroupService` mocked to return one `pending_owner` +
  one `pending_user` row; asserts the real `ApiResponse<Page<GroupInvitationResponse>>` JSON shape
  and that both statuses come through a single call (the thing `GroupServiceImplSpec` can't prove,
  since it mocks the service itself rather than exercising the controller/JSON layer).
- `getMemberSentInvitations_NotAMember_ReturnsBadRequest` — confirms the
  `BadRequestException` → 400 `ApiResponse.error` wiring for this endpoint's one error path, same
  precedent as `getGroup_PrivateGroupNonMember_ReturnsBadRequest` (A9).

Both pass; full `:server:test` re-run green (28/28, including the two new cases).

## Verification

- `./gradlew :modules:social:group-impl:test --tests GroupServiceImplSpec` — green (new + existing
  cases).
- `./gradlew :modules:social:group-impl:test` (full module) — green.
- `./gradlew :server:test` — green, including all 26 `GroupControllerTest` cases (unaffected — none
  target this endpoint) — confirms no Spring wiring/compilation regression from the interface
  signature change.
- **Live `bootRun` verification was skipped**: port 8080 already had a `java` process listening
  (started earlier the same day, not started by this session) — killing/restarting another process
  on shared dev infrastructure without confirming it wasn't in active use by the user or another
  session was judged not worth the risk for a change this narrow and already covered by the
  integration test suite. Flagging this explicitly rather than silently skipping it: a live
  `GET /api/groups/{groupId}/invitations/sent?status=pending_user` walkthrough (invite → approve →
  fetch, checking both status values and the 400 case) has **not** been run against a live server in
  this session — worth doing before/at GRP-3 pickup if the running dev server is confirmed free to
  restart.

## Client impact

`client/docs/BACKLOG_MVP.md`'s **GRP-3** can now build its "waiting for user accept" section against
`GET /api/groups/{groupId}/invitations/sent?status=pending_user` directly — no further backend work
needed for that section. GRP-3's backlog entry should be updated to drop the "blocked on B8" note
once picked up.

---

**Status:** `DONE` (2026-07-20) · **Summary:** `modules/social/group-impl/docs/MVP/B8_INVITATION_STATUS_FILTER.md`  
**Type:** Enhancement  
**Origin:** filed for the client's **GRP-3** (`client/docs/BACKLOG_MVP.md`) — its Members tab needs
a "waiting for user accept" list: invitations the caller sent for a group that an owner/admin has
already approved (status `pending_user`) and the invitee hasn't responded to yet.

**Found while scoping GRP-3:** `GroupServiceImpl.getMemberSentInvitations()` (line ~1098) hardcodes
its status filter to `pending_owner` only —
`invitationRepository.findByGroupIdAndInviterIdAndStatus(groupId, inviterId, "pending_owner",
pageable)`. `GET /api/groups/{groupId}/invitations/sent` therefore can never return a `pending_user`
row today, which is the exact status GRP-3's new section needs.

**Delta (2026-07-20, executed):** at pickup, user first chose an explicit **`status` query param**
(one call per status). Later the same day, while comparing GRP-3's request count against the 5
Members-tab sections, user reversed that: they want **both `pending_owner` and `pending_user` in
one request** (a group member/owner/admin should see everything they've invited that's still in
flight, not just the `pending_user` subset), distinguishable via each row's `status` field. That's
what actually shipped: `GET /api/groups/{groupId}/invitations/sent` takes **no query param** and
always returns both statuses in one page. `GroupService.getMemberSentInvitations` is `(groupId,
inviterId, pageable)` — no `status` arg. New
`GroupInvitationRepository.findByGroupIdAndInviterIdAndStatusIn(groupId, inviterId,
List.of("pending_owner", "pending_user"), pageable)` — the single-status query param variant
(and its now-dead single-status repository method) was removed, not just deprecated. **GRP-3
should build its Members tab against one call to this endpoint**, splitting locally by
`row.status` for whichever of its sections need which status. Full writeup, including the
mid-session revision: `modules/social/group-impl/docs/MVP/B8_INVITATION_STATUS_FILTER.md`.

**Out of scope:** no change to `getGroupInvitations` (owner/admin's incoming-approval view) or
`getUserPendingInvitations` (invitee-facing view) — both already return the correct status set for
their own purpose.

**Tests:** `GroupServiceImplSpec` — updated the existing not-a-member throw test to the 3-arg
signature; replaced the per-status happy-path tests with one asserting a single call returns both
`pending_owner` and `pending_user` rows together.

---
