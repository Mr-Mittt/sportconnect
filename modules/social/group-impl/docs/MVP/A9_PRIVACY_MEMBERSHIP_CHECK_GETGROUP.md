# A9 — Privacy/membership check on `getGroup`

**Module:** `modules/social/group-impl`
**Status:** `DONE` (2026-07-08)

## Problem

`GroupServiceImpl.getGroup(groupId, currentUserId)` returned full group details — including
the top-3 pinned posts — to any authenticated caller, regardless of `group.isPrivate` and
regardless of whether `currentUserId` was actually a member. `isPrivate` was present in
`GroupResponse` as informational data but was never checked against the caller. The only gate
was `SecurityConfig`'s blanket "must be authenticated" rule on `/api/groups/**` — logged in as
*some* user, not necessarily a member of *this* group. Found during the auth module's A2/A3 work
while investigating a stale integration test.

## Decisions (confirmed before implementation)

1. **Visibility model:** deny but confirm existence, not hide it (404). A private group's ID is
   still resolvable — the caller gets an explicit "you can't view this" error, not a
   "not found" masquerade — because the UI needs to render "This group is private, ask to join"
   rather than treat it as a dead link.
2. **Who can view a private group:** any member — owner, admin, or plain member. `isGroupMember()`
   already covers all three (owner/admin rows exist in the same `group_members` table).
3. **Public groups:** unchanged — visible to any authenticated caller regardless of membership.
   Confirmed via `GroupRepository`'s public-search queries, which already filter
   `isPrivate = false` independently of `getGroup` — no regression risk to B5 discovery/search.
4. **Status code:** `BadRequestException` (400), not `ForbiddenException` (403). This module has
   an established, documented convention — `GroupController`'s class Javadoc states permission
   failures are 400 here, and every existing permission check in `GroupServiceImpl`
   (`updateGroup`, `deleteGroup`, `getGroupSettings`, `getPinnedPosts`) already throws
   `BadRequestException`. `ForbiddenException` was unused anywhere in `group-impl`; introducing
   it for this one case would have broken that documented invariant without a strong reason to.

## What changed

- **`GroupServiceImpl.getGroup()`** (`GroupServiceImpl.java:162-188`): after the group is fetched
  and confirmed active, before the (relatively expensive) response mapping and pinned-post fetch,
  added:
  ```java
  if (Boolean.TRUE.equals(group.getIsPrivate())
          && (currentUserId == null || !isGroupMember(groupId, currentUserId))) {
      throw new BadRequestException("This group is private. Request to join to view its details");
  }
  ```
  `currentUserId == null` short-circuits before the repository call — defensive, since in
  practice `SecurityConfig` already rejects unauthenticated HTTP callers with 401 before the
  controller runs, but the service method itself has no such guarantee for direct callers.
- **`GroupService.getGroup()`** (`group-api`): added Javadoc documenting the visibility contract.
- **`GroupController.getGroup()`**: updated `@Operation`/`@ApiResponses` — added a `400` entry and
  replaced the stale "no enforcement yet (tracked as A9)" description.
- **`GroupServiceImplSpec`**: 4 new tests — private+non-member (denied), private+anonymous
  (denied, no membership lookup performed), private+member (allowed, full details incl. pinned
  posts), public+non-member (unchanged, explicit regression coverage).

## Out of scope / unchanged

- `getPublicGroups`/search (B5) — no code path overlap with `getGroup`, verified separately.
- No new "minimal" or partial `GroupResponse` DTO was introduced for the denied case — the
  existing `GroupResponse` already carries `isPrivate` for the client to react to before even
  calling `getGroup`; the error path is a plain exception, not a stub response body.
- `GroupControllerTest` (integration, `server` module) was not extended — that class mocks
  `GroupService` entirely, so the privacy logic itself is only meaningfully testable at the
  service layer (`GroupServiceImplSpec`), which is where the new coverage lives.

## Verification

- `./gradlew :modules:social:group-impl:test` — full suite passes, including the 4 new tests.
- `./gradlew :server:compileTestJava` — confirms no downstream compile breakage in the
  integration test module.
- No N+1 introduced — the new check is a single conditional with one repository call, not inside
  a loop or `.map()`.

---

**Status:** `DONE` (2026-07-08) · **Summary:** `modules/social/group-impl/docs/MVP/A9_PRIVACY_MEMBERSHIP_CHECK_GETGROUP.md`  
**Type:** Bug Fix (Security) / Enhancement  
**Scope:** `GroupServiceImpl.getGroup()` (and its controller), `GroupControllerTest`, `GroupServiceImplSpec`

**Found during:** auth module A2/A3 work (2026-07-08) — investigating a stale integration test
(`GroupControllerTest.getGroup_WithoutUserId_Success`) surfaced that `getGroup(groupId,
currentUserId)` has **no privacy or membership enforcement at all**. It fetches the group by ID
and returns full details — including the top-3 pinned posts — to any caller who reaches the
endpoint, regardless of `isPrivate`, regardless of whether `currentUserId` is a member, and
regardless of whether `currentUserId` is even non-null. `isPrivate` is returned as informational
data in `GroupResponse` but never checked against the caller. The only thing currently gating this
endpoint at all is `SecurityConfig`'s blanket `.anyRequest().authenticated()` rule — logged in as
*some* user, not necessarily a member of *this* group.

The stale test (which expected an unauthenticated call to succeed with `getGroup(1L, null)`) has
been rewritten to assert the current, correct security-layer behavior instead (401 without auth) —
see the auth module's A2/A3 closeout docs. This ticket is the follow-up: decide and implement
actual *content*-level access control, which is a separate, deeper gap from "must be logged in."

**Needs a product/design decision before implementation:**
- Should a **private** group be visible at all to non-members? (Likely: no — hide full details;
  decide the exact shape: 403 `ForbiddenException`, a minimal "this group is private" stub
  response, or 404 to avoid confirming the group exists.)
- Should a **public** group remain visible to any authenticated user regardless of membership?
  (Likely: yes — this is the point of B5's public discovery/search flow; don't regress that.)
- Is a null/absent `currentUserRole` in the response already an adequate signal for "you're not a
  member," or does enforcement need to be stronger (i.e. block the read, not just omit the role)?

**Suggested scope once decided:** in `getGroup`, if `group.getIsPrivate()` is true and the caller
isn't a member (owner/admin/member — reuse the existing `isGroupMember`/`isGroupOwner`/
`isGroupAdmin` checks), throw `ForbiddenException` instead of returning full details. Public
groups unchanged. Add Spock coverage for both the private-member and private-non-member paths
(currently only the "group not found" and implicit "always succeeds" paths are tested).

**Not urgent for MVP unless private groups are already relied on for genuine privacy** — flag with
product before scheduling; this is a real (if narrow) information-disclosure gap, not cosmetic.

---
