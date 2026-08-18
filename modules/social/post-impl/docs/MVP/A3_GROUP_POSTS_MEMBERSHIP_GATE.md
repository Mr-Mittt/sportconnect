# A3 · Group posts membership gate

**Module:** `modules/social/post-impl`  
**Type:** Bug Fix  
**Completed:** 2026-07-01

## What was built

Added a membership check to `PostServiceImpl.getGroupPosts()` so only group members can read group posts. Unauthenticated and non-member callers receive a `ForbiddenException`.

**New exception:** `ForbiddenException` added to `modules/common/exception/` — same pattern as the existing `BadRequestException` / `UnauthorizedException` (plain `RuntimeException` subclass, no `@ResponseStatus`).

**Service change in `getGroupPosts()`:**
```java
if (currentUserId == null || !groupService.isGroupMember(groupId, currentUserId)) {
    throw new ForbiddenException("You must be a group member to view posts");
}
```
`currentUserId` is checked first (short-circuit) to avoid a `groupService` call when the caller is unauthenticated.

## Key decisions

- **`ForbiddenException` over `BadRequestException`** — the request is well-formed; the caller simply lacks access. 403 is semantically correct vs. 400.
- **No `@ResponseStatus`** — matches the existing exception pattern. A global `@ControllerAdvice` mapping exceptions to proper HTTP codes is a separate tech-debt item.
- **`null` check before `isGroupMember`** — avoids a cross-domain call for unauthenticated requests; also prevents a potential NPE in `GroupServiceImpl` if it doesn't defensively handle null UUIDs.

## Tests updated / added (PostServiceImplSpec)

- Updated existing `getGroupPosts returns posts for specific group` → now mocks `groupService.isGroupMember` returning `true`
- Added: non-member caller → `ForbiddenException`
- Added: `null` (unauthenticated) caller → `ForbiddenException` (short-circuits before `isGroupMember` call)

---

**Status:** `DONE`  
**Type:** Bug Fix

`PostServiceImpl.getGroupPosts()` currently returns all posts for a `groupId` with no access check. Any unauthenticated or non-member caller can read GROUP_POSTs.

**Required change in `PostServiceImpl.getGroupPosts()`:**
```java
if (currentUserId == null || !groupService.isGroupMember(groupId, currentUserId)) {
    throw new ForbiddenException("You must be a group member to view posts");
}
```

**Note:** `ForbiddenException` may need to be added to `modules/common` if not already present (check `com.sportconnect.common.exception`). Alternatively throw `UnauthorizedException`.

**Tests:** Add Spock cases: member can read (success), non-member blocked (fail), unauthenticated blocked (fail).

---
