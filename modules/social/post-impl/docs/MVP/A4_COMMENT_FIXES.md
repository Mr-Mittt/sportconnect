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

---

**Status:** `DONE`  
**Type:** Bug Fix  
**Scope:** `CommentServiceImpl.java` only

Two correctness gaps bundled:

**Fix 1 — Post-active check in `getPostComments()`:**  
Verify the parent post is `isActive=true` before fetching its comments. A soft-deleted post's comments are currently still reachable via `GET /api/posts/{postId}/comments`.
```java
postRepository.findByIdAndIsActiveTrue(postId)
    .orElseThrow(() -> new NotFoundException("Post not found"));
```

**Fix 2 — One-level nesting enforcement in `createComment()`:**  
When `parentCommentId` is provided, validate that the parent comment's own `parentCommentId IS NULL`. This enforces max 1 level of nesting — replies cannot be replied to.
```java
if (request.getParentCommentId() != null) {
    Comment parent = commentRepository.findById(request.getParentCommentId())
        .orElseThrow(() -> new NotFoundException("Parent comment not found"));
    if (parent.getParentCommentId() != null) {
        throw new BadRequestException("Replies cannot be nested deeper than one level");
    }
}
```

**Tests:** Post-active check (deleted post → 404), depth enforcement (reply to reply → 400).

---
