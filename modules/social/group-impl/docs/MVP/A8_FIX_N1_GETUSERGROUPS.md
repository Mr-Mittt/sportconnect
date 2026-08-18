# A8 · Fix N+1 in getUserGroups

**Status:** DONE
**Module:** `modules/social/group-impl`
**Date:** 2026-07-02

## What was built

`getUserGroups` mapped each page item via `Page.map()`, and the per-item work fanned out into
5 queries per item (1 group lookup + 4 more inside `mapToGroupResponse`: creator name, member
count, and a 2-query role resolution) — found while verifying A7. Rewritten to batch everything
up front:

- **Pagination source query changed.** `groupMemberRepository.findByUserId(userId, pageable)` →
  new `findByUserIdAndGroupIsActiveTrue(userId, pageable)`, a JPQL query joining to `Group` and
  filtering `g.isActive = true` at the source (not just in a supplementary lookup). This is a
  **real behavior change**: a user's membership in a since-deleted group (soft-deleted via
  `deleteGroup` → `isActive = false`) no longer appears in "my groups". Confirmed via
  `deleteGroup`'s code that membership rows are never removed when a group is soft-deleted, so
  without this source-level filter, deleted groups would keep showing up indefinitely.
- **New same-domain batched query** — `GroupRepository.findGroupsWithMemberCounts(List<Long>)`:
  `SELECT g, COUNT(gm.groupId) FROM Group g LEFT JOIN GroupMember gm ON gm.groupId = g.id WHERE
  g.id IN :groupIds AND g.isActive = true GROUP BY g`. One query returns both the `Group` entities
  and their member counts for the whole page, replacing what would otherwise be 2N separate calls.
- **Creator names** — batched via the existing cross-domain `userService.getUsersByIds(...)`
  (one call for the whole page, collecting distinct `createdBy` ids from the fetched groups).
- **Role names** — batched via `groupRoleRepository.findAllById(...)`, using role ids already
  present on each page's `GroupMember` row (`membership.getRoleId()`) — no second membership
  query needed, since `getUserGroups`'s own driving query already carries the requesting user's
  role per group.
- New mapper overload `mapToGroupResponse(Group, Map<UUID,UserResponse>, Map<Long,Long>,
  Map<Integer,GroupRole>, Integer)` — pure function, reads from the pre-resolved maps instead of
  querying. The original single-item `mapToGroupResponse(Group, UUID)` is untouched and still used
  by `getGroup`/`createGroup` (not part of this N+1 — single-item calls, not a paginated loop).

Net effect: **4 queries total** for a page of N groups (membership page + groups-with-counts +
creators + roles), down from **1 + 5N**.

## Key decisions

- **`isActive` filtering added at the user's explicit request**, not part of the original ticket
  scope. Initially considered "no behavior change" (matching A6/A7's convention), but the user
  chose to add it here. Filtering only in the supplementary `findGroupsWithMemberCounts` query
  would have left dangling memberships (group missing from the page's lookup map, with no safe way
  to represent that inside `Page.map()` without either throwing mid-page or fabricating a fake
  group). Filtering at the pagination source instead means every page item is guaranteed to have a
  matching group — no missing-group case to handle at all.
- **`GroupRole` was deliberately NOT joined into `findGroupsWithMemberCounts`.** The role needed is
  per-membership (the requesting user's own role), not per-group, so it doesn't fit an aggregate
  query grouped by `Group`. `GroupRole` is also a tiny, pre-seeded 3-row table — a separate flat
  `findAllById` call is already trivially cheap; folding it in would only add fragility (grouping
  semantics on top of an already non-trivial `LEFT JOIN + COUNT`) to save one query on a 3-row
  table.
- **`findGroupsWithMemberCounts` also filters `g.isActive = true`**, technically redundant given the
  pagination source already excludes inactive groups, but kept for defensive clarity if this method
  is ever reused elsewhere.
- Count values consumed via `((Number) row[1]).longValue()` rather than a direct `Long` cast,
  matching the existing defensive-cast convention already used for `Object[]` count rows in
  `getPublicGroups`.

## Non-obvious constraints

- `groupMemberRepository.findByUserId(UUID, Pageable)` was renamed/replaced rather than kept
  alongside the new method — confirmed via grep it had exactly one call site in this module
  (`getUserGroups`) before this change, so no dead code was left behind.
- `mapToGroupResponse`'s two overloads intentionally diverge: the single-item one still calls
  `getUserRoleInGroup` (which does its own 2 queries) since it's not in a loop; the batched one
  never calls it, reading the role straight from the page's own `GroupMember.roleId` instead.

## Tests

Updated `GroupServiceImplSpec.groovy`'s `"getUserGroups should return page of user's groups"` test:
replaced the old per-item stub chain (`findByUserId`, `findById`, `countByGroupId`,
`findByGroupIdAndUserId`, `findById` on role) with the new batched calls:
`findByUserIdAndGroupIsActiveTrue`, `findGroupsWithMemberCounts` (returning `[[testGroup, 1L] as
Object[]]`), `getUsersByIds`, `findAllById`.

Run: `./gradlew :modules:social:group-impl:test` — all pass. `./gradlew
:modules:social:group-impl:compileJava` and `:modules:social:group-api:compileJava` succeed.

**Verification gap, disclosed:** the two new JPQL queries (`findByUserIdAndGroupIsActiveTrue`,
`findGroupsWithMemberCounts`) could not be validated against a live Hibernate/Postgres instance in
this sandbox — `:server:bootRun` fails at the Liquibase/DB-connection step (no local Postgres
running), before Spring Data would parse and validate the queries, and the Spock tests mock the
repository layer entirely (bypassing the JPQL parser). Confidence in correctness comes from both
queries being structurally identical to already-proven queries in this same file:
`findByUserIdAndGroupIsActiveTrue` mirrors `findGroupIdsByUserAndSportIds`'s multi-entity
`FROM GroupMember gm, Group g WHERE ... g.isActive = true` shape; `findGroupsWithMemberCounts`
mirrors `searchPublicGroupsWithCounts`'s `SELECT g, COUNT(gm.groupId) ... LEFT JOIN ... GROUP BY g`
shape. Recommend running against a real Postgres instance (or CI) before merging to confirm.

---

**Status:** `DONE`  
**Type:** Bug Fix (Performance)  
**Scope:** `GroupServiceImpl.java` only

**Found while verifying A7** (user asked "seem no N+1 problem in group module, right?" — checked the
whole file for remaining per-item lookups inside `.map()`/loops and found this one; it wasn't part of
A7's ticket scope). `getUserGroups` maps each page item via `Page.map()`, and the per-item work fans
out into several more per-item queries — worse than anything A7 fixed.

**Current code (lines ~155-163):**
```java
public Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable) {
    Page<GroupMember> memberships = groupMemberRepository.findByUserId(userId, pageable);
    return memberships.map(membership -> {
        Group group = groupRepository.findById(membership.getGroupId())
                .orElseThrow(() -> new NotFoundException("Group not found"));
        return mapToGroupResponse(group, userId);
    });
}
```

Per page item, this is **1 (group lookup) + 4 more inside `mapToGroupResponse`** = 5 queries/item:
- `groupRepository.findById(membership.getGroupId())` — 1 query
- `mapToGroupResponse()` internally calls:
  - `userService.getUsersByIds(List.of(group.getCreatedBy()))` — 1 query (single-id, not batched across the page)
  - `groupMemberRepository.countByGroupId(group.getId())` — 1 query
  - `getUserRoleInGroup(groupId, currentUserId)` → `groupMemberRepository.findByGroupIdAndUserId(...)` +
    `groupRoleRepository.findById(...)` — 2 more queries

**Fix approach:** collect distinct `groupId`s from the page's memberships up front, batch-fetch groups
via `groupRepository.findAllById(...)`, batch-fetch creator names via `userService.getUsersByIds(...)`
(collecting all `createdBy` ids across the page), batch-fetch member counts (needs a new repository
method, e.g. `groupMemberRepository.countByGroupIdIn(List<Long> groupIds)` grouped by group id — check
if Spring Data supports this directly or needs a `@Query` with `GROUP BY`), and batch-resolve the
current user's role per group (the same `userId` across all rows — one
`groupMemberRepository.findByUserIdAndGroupIdIn(userId, groupIds)` call plus one
`groupRoleRepository.findAllById(...)` for the distinct role ids found). `mapToGroupResponse` will need
a variant that takes these pre-resolved maps instead of querying internally — similar to what A7 did
for the other mappers. Note `mapToGroupResponse` is also called from `getGroup` (single-item, not
paginated) — keep that call site using the existing per-item-fetch signature or an inline
single-element-map wrapper, per the same convention A7 used for single-item call sites.

**Out of scope:** no change to what data is displayed — pure performance refactor, same fields/values.
Also out of scope: two bounded (max 3) per-item `postService.getPostById()` loops — one in `getGroup`'s
pinned posts resolution (line ~136-147), one in `getPinnedPosts` itself (line ~844-864, iterating
`pinnedPostRepository.findByGroupIdOrderByPinnedAtDesc`). Both are much lower severity than a true
paginated N+1: `GroupPinnedPost` rows per group are capped at exactly 3 by a business rule enforced at
pin-time (B6a), not by a query `LIMIT` or client-controlled pagination — so unlike the 7 paginated
methods this ticket + A8 fixed, there's no scaling axis (more members, more history, bigger page size)
for these two loops to grow along. Noted here for awareness but not ticketed.

---
