# B4 · Redis Comment Preview Cache

## What was built

Eliminated the N+1 DB hit per post card on feed loads. Previously, every `PostResponse` mapping triggered a separate `getPostComments()` query. Now the 3 most recent root-level comments are served from a Redis Sorted Set.

**Redis key:** `post:{postId}:comments:preview`  
**Type:** Sorted Set — score = `createdAt` epoch millis, member = JSON-serialized `CommentResponse`

## Changes

| File | Change |
|---|---|
| `post-api/.../PostResponse.java` | Added `List<CommentResponse> previewComments` field |
| `post-impl/.../CommentRepository.java` | Added `findTop3ByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc()` |
| `post-impl/.../CommentServiceImpl.java` | `createComment()` populates preview cache for root comments; `deleteComment()` invalidates it |
| `post-impl/.../PostServiceImpl.java` | `mapToResponse()` reads preview from Redis with DB fallback; `deletePost()` invalidates preview key |
| `V021__add_comment_indexes.sql` | Two partial indexes on `comments` for fallback query performance |

## Key decisions

**DEL on delete, not ZREM:** When a root comment is deleted, the entire `post:{postId}:comments:preview` key is dropped rather than trying to remove the specific JSON member. Simpler and avoids stale-member risk from serialization drift.

**Partial indexes over composite:** `WHERE is_active = true` partial indexes are smaller and faster than full composite indexes because inactive (soft-deleted) rows are excluded entirely.

**`isLikedByCurrentUser = false` in cache:** The preview is viewer-independent. Cached comments always show `isLikedByCurrentUser = false`. This is acceptable for feed card previews; users wanting full interaction state click through to the full comment thread.

**`replies = emptyList()` in cache:** Preview comments are root-level only — replies are not embedded in the cached JSON to keep payload size small and avoid recursive depth issues.

**Cache miss fallback:** `getPreviewComments()` in `PostServiceImpl` falls back to `findTop3By...` on cache miss and repopulates Redis. The DB fallback uses `likeCount = 0` (no extra DB hits for counts on cold start); a subsequent warm read will have the accurate Redis counter.

## Non-obvious constraints

- `addToPreviewCache()` catches `JsonProcessingException` and logs a warning rather than throwing — a serialization failure must never break comment creation.
- `ObjectMapper.findAndRegisterModules()` is used in tests to register `JavaTimeModule` for `LocalDateTime` serialization.
- The preview cache is only populated/invalidated for **root comments** (`parentCommentId IS NULL`). Replies do not touch the preview key.
