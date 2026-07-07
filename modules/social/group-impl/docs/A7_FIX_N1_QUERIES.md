# A7 · Fix N+1 queries in paginated list mappers

**Status:** DONE
**Module:** `modules/social/group-impl`
**Date:** 2026-07-02

## What was built

`GroupServiceImpl` had six paginated methods that mapped each `Page` item via `Page.map(...)`,
where the per-item mapper did its own DB round trip(s) — a classic N+1 (~20-40 extra queries per
page of 20). Each affected method now fetches the page first, collects distinct ids from
`page.getContent()`, does one batched lookup per dependency, and passes the resulting `Map`s into a
now-pure mapper that just reads from them instead of querying.

- `mapToGroupMemberResponse(member, usersById, rolesById)` — was `(member)` with internal
  `userService.getUsersByIds(List.of(id))` + `groupRoleRepository.findById(id)` calls per item.
  `getGroupMembers` now batches both `userId`s and `roleId`s across the page before mapping.
- `mapToJoinRequestResponse(request, groupsById, usersById)` — was `(request)` with internal
  `groupRepository.findById(id)` + `userService.getUsersByIds(...)` per item. New private helper
  `mapJoinRequestsPage(Page<GroupJoinRequest>)` batches group names and user lookups (requester +
  reviewer) once per page; used by both `getUserJoinRequests` and `getGroupJoinRequests`.
- `mapToGroupInvitationResponse(invitation, groupName, usersById)` — kept its existing `groupName`
  param (already resolved once, outside the loop), added a batched user map. New private helper
  `buildInviterInviteeUserMap(List<GroupInvitation>)` batches inviter+invitee lookups once per page;
  used by `getGroupInvitations`, `getMemberSentInvitations`, and `getUserPendingInvitations`.
- **`getUserPendingInvitations`** — a 6th touch-point found during implementation, not listed in the
  original ticket: it had its own per-item `groupRepository.findById(inv.getGroupId())` inside
  `.map()`, on top of the mapper's per-item user lookup. Since the mapper's signature had to change
  regardless (to accept a pre-resolved user map), this method had to be touched to compile. User
  confirmed fixing its N+1 too rather than only adapting it to compile, since it had zero existing
  test coverage (no breakage risk) and it's the same bug class the ticket exists for. Now batches
  group names into a `Map<Long, String>` the same way the join-request path does.
- Three single-item (non-loop) call sites — `createJoinRequest` and `createInvitation` (×2) — were
  adapted to build a small inline map (`Map.of(...)` / a singleton-list `getUsersByIds` call) and
  pass it to the same mapper, rather than adding single-item overloads.

## Key decisions

- **Guard every batch call with an empty-list check**, returning `Map.of()` instead of calling the
  batch method with an empty collection. This matches the existing test convention where empty-page
  tests assert the lookup is never invoked (`0 * userService.getUsersByIds(_)`,
  `0 * groupRepository.findAllById(_)`) — calling with an empty list would still technically be a
  no-op DB-wise, but would break those strict-count mock expectations.
- **Inline batch reuse over single-item overloads** for the three non-loop call sites
  (`createJoinRequest`, `createInvitation` ×2). A dedicated single-item overload would just wrap
  `getUsersByIds(List.of(id))` internally anyway — no behavioral gain, just extra API surface to keep
  in sync with the mapper. This matches the convention already established in A6.
- **`createJoinRequest` keeps an explicit `groupRepository.findById(...)` call** rather than reusing
  the `group` variable already in scope from the earlier `findByGroupName` lookup — required to keep
  the existing test's strict `1 * groupRepository.findById(testGroup.id)` expectation intact without
  rewriting that test.
- **No new tests added** for the previously-uncovered happy paths (`getGroupJoinRequests`,
  `getGroupInvitations`, `getMemberSentInvitations`, `getUserPendingInvitations`) — out of scope for
  this pure performance refactor; existing coverage stays green.

## Non-obvious constraints

- No change to any returned field, value, or fallback string (`"Unknown User"`, `"Unknown Group"`,
  null-safe role/reviewer handling) — purely a batching refactor.
- `GroupRoleRepository`/`GroupRepository` needed no code changes — `findAllById(Iterable<ID>)` is
  inherited for free from `JpaRepository`.

## Tests

Updated `GroupServiceImplSpec.groovy` (only strict-count stubs naming the old per-item method
needed changes; wildcard `getUsersByIds` stubs were untouched since the call still happens once per
test, just relocated):
- `"getGroupMembers should return page of members when group exists"`:
  `groupRoleRepository.findById(memberRole.id)` → `groupRoleRepository.findAllById([memberRole.id])`
- `"getUserJoinRequests should return pending requests for the caller"`:
  `groupRepository.findById(testGroup.id)` → `groupRepository.findAllById([testGroup.id])`
- `"getUserJoinRequests should return empty page..."`:
  `0 * groupRepository.findById(_)` → `0 * groupRepository.findAllById(_)`

Run: `./gradlew :modules:social:group-impl:test --tests "com.sportconnect.group.service.GroupServiceImplSpec"`
— all pass. Also verified `./gradlew :modules:social:group-impl:compileJava` succeeds (catches any
missed call site from the mapper signature changes), and `:server:bootRun` reaches the Liquibase/DB
connection step with no Spring bean-wiring errors (fails only on the expected local-Postgres-not-running
error, same as A6).
