# B6a · Pinned Posts — Implementation Summary

**Status:** DONE  
**Date:** 2026-06-30  
**Module:** `modules/social/group-impl`

---

## What was built

Group owners and admins can pin up to 10 `GROUP_POST` posts per group. Pinned posts appear latest-first. The 3 most recently pinned posts are embedded in the `getGroup` response.

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/groups/{groupId}/pins` | `ROLE_USER` + owner/admin | Pin a post |
| `DELETE` | `/api/groups/{groupId}/pins/{postId}` | `ROLE_USER` + owner/admin | Unpin a post |
| `GET` | `/api/groups/{groupId}/pins` | `ROLE_USER` + member | Get all pinned posts |

### DB schema

```sql
group_pinned_posts (
  id        BIGSERIAL PK,
  group_id  BIGINT NOT NULL,
  post_id   BIGINT NOT NULL,
  pinned_by UUID   NOT NULL,
  pinned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (group_id, post_id)
)
```

Index on `(group_id, pinned_at DESC)` for ordered fetches.

### New files

| File | Purpose |
|---|---|
| `V017__create_group_pinned_posts.sql` | Migration |
| `GroupPinnedPost.java` | Entity |
| `GroupPinnedPostRepository.java` | Repository |
| `PinPostRequest.java` | Request DTO |
| `PinnedPostResponse.java` | Response DTO (includes embedded `PostResponse`) |

### Modified files

| File | Change |
|---|---|
| `GroupResponse.java` | Added `List<PostResponse> pinnedPosts` (null except on `getGroup`) |
| `GroupService.java` | Added `pinPost`, `unpinPost`, `getPinnedPosts` |
| `GroupServiceImpl.java` | Implemented new methods; `getGroup` now populates top 3 pinned posts |
| `GroupController.java` | Added 3 endpoints |
| `group-api/build.gradle` | Added `post-api` dependency |
| `group-impl/build.gradle` | Added `post-api` dependency |

---

## Key decisions

**Cross-domain validation for `groupId`:** When pinning, `PostService.getPostById()` is called via the post-api interface. The returned `PostResponse.groupId` is compared to the URL `{groupId}`. This prevents an admin of group A from pinning a post that belongs to group B without requiring any impl-to-impl imports.

**`pinnedPosts` only in `getGroup`:** The field is null in `createGroup`, `updateGroup`, and `getUserGroups` to avoid N+1 queries when listing groups. Only the single-group detail endpoint populates it.

**`pinnedBy` is `UUID`:** Consistent with every other cross-domain user reference in the system (`GroupMember.userId`, `Group.createdBy`, etc.). The original backlog said `UUID` but context in the codebase confirmed it was the right type.

**Soft-delete resilience in feed:** When building pinned post responses, any post that throws (e.g. deleted post) is silently filtered out rather than failing the whole request. A pinned-but-deleted post simply disappears from the list.

**`unpinPost` is idempotent:** Calling unpin on a post that isn't pinned is a no-op (the `@Modifying` delete matches 0 rows). No `NotFoundException` is thrown.

---

## Test coverage

11 new Spock tests in `GroupServiceImplSpec`:
- `pinPost`: happy path (admin), pin limit, duplicate pin, wrong group, wrong post type, member rejected
- `unpinPost`: happy path, member rejected
- `getPinnedPosts`: happy path with ordering, non-member rejected
- `getGroup`: updated to assert `pinnedPosts` is populated
