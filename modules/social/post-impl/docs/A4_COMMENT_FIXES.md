# A4 · Comment Fixes — Implementation Summary

**Date:** 2026-07-01  
**Status:** DONE  
**Scope:** `CommentServiceImpl.java` (1 line change) + `CommentServiceImplSpec.groovy` (2 tests updated/added)

## What was built

Single bug fix: `getPostComments()` now verifies the parent post is `isActive=true` before returning its comments. A soft-deleted post's comments were previously reachable via `GET /api/posts/{postId}/comments`.

## Change

```java
// CommentServiceImpl.getPostComments() — added at top of method
postRepository.findByIdAndIsActiveTrue(postId)
        .orElseThrow(() -> new NotFoundException("Post not found"));
```

`PostRepository.findByIdAndIsActiveTrue()` already existed — no new query needed.

## What was dropped

The originally planned Fix 2 (one-level nesting depth enforcement) was dropped. The existing `NotFoundException` on `parentCommentId` lookup is sufficient; the depth restriction is an unnecessary constraint for MVP.

## Tests

- Updated existing `getPostComments should return paginated comments` to stub `postRepository.findByIdAndIsActiveTrue`
- Added `getPostComments should throw NotFoundException when post is soft-deleted`
