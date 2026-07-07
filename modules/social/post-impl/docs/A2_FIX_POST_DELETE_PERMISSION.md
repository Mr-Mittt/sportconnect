# A2 · Fix post delete permission (group owner/admin)

**Module:** `modules/social/post-impl`  
**Type:** Bug Fix  
**Completed:** 2026-06-30

## What was built

Expanded `PostServiceImpl.deletePost()` to allow group owners and admins to delete posts within their group, not just the post author.

**Before:** single ownership check — only the post's `userId` could delete it.

**After:** two-gate check:
```java
boolean isOwner = post.getUserId().equals(userId);
boolean isGroupModerator = post.getGroupId() != null &&
        (groupService.isGroupOwner(post.getGroupId(), userId) ||
         groupService.isGroupAdmin(post.getGroupId(), userId));

if (!isOwner && !isGroupModerator) {
    throw new BadRequestException("You do not have permission to delete this post");
}
```

`USER_FEED` posts (no `groupId`) are unaffected — `isGroupModerator` is always false when `groupId == null`, so only the author can delete them.

## Key decisions

- **Short-circuit on `groupId == null`** — the `&&` guard means `groupService` is never called for non-group posts, keeping it a no-op for the common case.
- **`isGroupOwner` checked first** — owners are more common than admins; avoids a second RPC in the happy path.
- **No change to error message type** — `BadRequestException` (400) is used to match existing behaviour, even though 403 would be more semantically correct. Changing the status code is out of scope.

## Tests added (PostServiceImplSpec)

- group owner can delete GROUP_POST (success)
- group admin (non-owner) can delete GROUP_BROADCAST (success)
- non-member (neither author, owner, nor admin) cannot delete GROUP_POST (BadRequestException)
- existing: `groupService` is never called when the caller is not the owner of a USER_FEED post (0 * groupService._)
