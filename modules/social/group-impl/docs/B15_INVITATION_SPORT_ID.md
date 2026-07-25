# B15 · Add `sportId` to `GroupInvitationResponse`

**Status:** `DONE` (2026-07-25)
**Type:** Enhancement
**Filed:** 2026-07-24, alongside client ticket **GRP-8** (`client/docs/BACKLOG_MVP.md`)

## Origin

Two client needs both required knowing an invitation's group's sport without a second round-trip:

1. GRP-7's accept-invitation flow worked around this gap by force-switching the sport filter to
   "All" before navigating, instead of switching directly to the group's real sport.
2. GRP-8's new "add this sport to your profile?" accept-time confirmation needs the sport id both
   to check whether the invitee already has a matching sport profile and to submit the
   profile-creation call if they confirm.

## Design decision made at pickup — `sportId` only, no `sportName`

The original ticket draft (see the backlog entry pre-B15) called for both `sportId` and
`sportName` fields, following the same shape as `post-impl`'s A9 (`PostResponse.sportName`,
resolved via a batched `SportService.getSportsByIds()` call once per page).

That was reconsidered before implementation: sports are static reference data, already fully
exposed via the public `GET /api/sports` endpoint (`SportController`, `/api/sports/**` is public
per root `CLAUDE.md`). A client can fetch that list once and resolve any `sportId` to a display
name locally — there's no need for the backend to join the name into every invitation response,
and doing so would have meant adding a new cross-domain `SportService` dependency to
`GroupServiceImpl` purely for a lookup the client can already do for free. This also resolves an
internal inconsistency in the original ticket text, which described the change as "no new query"
while actually requiring one (a sport-name lookup) to satisfy `sportName`.

**Shipped:** `GroupInvitationResponse.sportId` only. No `SportService` dependency added to
`group-impl`. Client resolves `sportName` locally from its own already-fetched `GET /api/sports`
list.

**Follow-up filed, not executed:** the same reasoning arguably applies to `post-impl`'s A9
`sportName` field on `PostResponse` — but that field is already shipped and live-consumed by the
client's Feed/PostCard sport-badge rendering, so removing it would be a breaking contract change,
not a purely-additive one. Filed as `modules/social/post-impl/docs/BACKLOG_MVP.md`'s new **A12**
ticket to resolve whether the client already has a locally-cached sports list reachable from that
render path before acting on it.

## What shipped

- **`GroupInvitationResponse`** (`group-api`): new `Long sportId` field.
- **`GroupServiceImpl`** (`group-impl`): the invitation-mapping helper chain
  (`mapToGroupInvitationResponse` → `mapInvitationPage`/`mapSingleInvitationResponse`) now takes
  the already-loaded `Group` entity instead of just its `groupName` string, so `sportId` can be
  read off the same row with zero new queries — mirrors the existing convention
  `mapToJoinRequestResponse(request, groupsById, usersById)` already used for join requests.
  - Single-group call sites (`getGroupInvitations`, `getDeclinedInvitations`,
    `getMemberSentInvitations`, `createInvitation`'s two return paths,
    `createSelfApprovedInvitation`) now fetch/hold the `Group` object directly rather than
    projecting to `Group::getGroupName` inline.
  - `getUserPendingInvitations` (the one call site whose page can span multiple groups/sports)
    batches a `Map<Long, Group>` via the existing `groupRepository.findAllById(...)` call — same
    query as before, just no longer projected down to name only.
  - Defensive fallback preserved: if the `Group` lookup misses (shouldn't happen in practice —
    `Group.sportId` is `NOT NULL`), `groupName` falls back to `"Unknown Group"` and `sportId` to
    `null`, matching the existing fallback convention.

## Out of scope (per original ticket, still true)

- No migration — `Group.sportId` already existed (B2).
- No client-side change — GRP-7/GRP-8 depend on this, not the other way around.

## Tests

`GroupServiceImplSpec`:
- New happy-path test for `getGroupInvitations` (previously had zero happy-path coverage — only a
  permission-denied test existed) asserting `sportId` flows through.
- `getDeclinedInvitations`, `getMemberSentInvitations` (both variants), `createInvitation`'s
  happy-path test — added `sportId` assertions to existing tests.
- Two new tests for `getUserPendingInvitations` (previously had **zero** Spock coverage at all):
  one confirming each row resolves its own group's `sportId` when a page spans two different
  groups/sports, one confirming the defensive `null`/`"Unknown Group"` fallback when a group is
  missing from the batch.

`./gradlew :modules:social:group-impl:test` — 131 tests, all green.
`./gradlew :server:test` — 34 tests, all green (required setting `DOCKER_HOST` explicitly per
`server/README.md`'s documented Rancher Desktop/Windows Testcontainers workaround; environment
issue, not a code issue).
