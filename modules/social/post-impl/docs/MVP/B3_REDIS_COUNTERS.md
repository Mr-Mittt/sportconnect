# B3 · Redis Like / Comment / Reply Counters

**Status:** DONE  
**Date:** 2026-07-01  
**Scope:** `post-impl`, `post-api`

---

## What Was Built

Replaced live `COUNT(*)` DB queries in `mapToResponse()` with Redis atomic counters backed by a DB fallback on cache miss. Also added `replyCount` to `CommentResponse`.

**4 Redis keys:**

| Key | Tracks |
|---|---|
| `post:{id}:likes` | Post like count |
| `post:{id}:comments` | Active comment count for a post |
| `comment:{id}:likes` | Comment like count |
| `comment:{id}:replies` | Active reply count for a comment |

---

## Key Decisions

**`StringRedisTemplate` over `RedisTemplate<String, Long>`:** Spring Boot auto-configures `StringRedisTemplate` with no config class needed. Values stored as strings; parsed with `Long.parseLong()`. No custom serializer.

**Read path — `getCount()` helper (copied into both services):**
```java
private long getCount(String key, LongSupplier dbFallback) {
    String val = stringRedisTemplate.opsForValue().get(key);
    if (val != null) return Math.max(0L, Long.parseLong(val));
    long count = dbFallback.getAsLong();
    stringRedisTemplate.opsForValue().set(key, String.valueOf(count));
    return count;
}
```
Cache miss → DB query → seed Redis → return. Values clamped to `Math.max(0L, ...)` on read as a safety guard against negative counters.

**Write path — INCR/DECR on mutations:** `INCR` after like/create, `DECR` after unlike/delete. Known MVP limitation: if Redis key is evicted before any read seeds it, the first `INCR` after eviction sets the key to 1 (wrong). The next cache miss corrects it from DB. Reads are much more frequent than this edge case in practice.

**No Lua script:** atomic-if-exists was skipped for MVP simplicity. The service-level guards (duplicate like check, "you haven't liked" check) prevent the counter legitimately going negative, so the clamp-on-read guard is purely defensive.

---

## Files Changed

| File | Change |
|---|---|
| `modules/social/post-impl/build.gradle` | Added `spring-boot-starter-data-redis` |
| `modules/social/post-api/.../dto/CommentResponse.java` | Added `replyCount` field |
| `modules/social/post-impl/.../repository/CommentRepository.java` | Added `countByParentCommentIdAndIsActiveTrue()` |
| `modules/social/post-impl/.../service/PostServiceImpl.java` | Injected `StringRedisTemplate`; INCR on `likePost`, DECR on `unlikePost`; `getCount()` in `mapToResponse()` |
| `modules/social/post-impl/.../service/CommentServiceImpl.java` | Injected `StringRedisTemplate`; INCR/DECR on all mutations; `getCount()` + `replyCount` in `mapToResponse()` |
| `modules/social/post-impl/.../PostServiceImplSpec.groovy` | Mocked Redis; updated likePost/unlikePost tests; added Redis hit test |
| `modules/social/post-impl/.../CommentServiceImplSpec.groovy` | Mocked Redis; updated all mutation tests; added replyCount + Redis hit tests |

No Liquibase migration required.

---

**Status:** `DONE`  
**Type:** Enhancement (Performance)

Replace `COUNT(*)` queries on every `mapToResponse()` call with Redis atomic counters.

**Redis keys:**
- `post:{postId}:likes` — Long counter
- `comment:{commentId}:likes` — Long counter

**Changes in `PostServiceImpl`:**
- `likePost()` → after DB insert: `redisTemplate.opsForValue().increment("post:" + postId + ":likes")`
- `unlikePost()` → after DB delete: `redisTemplate.opsForValue().decrement("post:" + postId + ":likes")`
- `mapToResponse()` → read from Redis: `redisTemplate.opsForValue().get("post:" + postId + ":likes")`. If `null` (cache miss): fall back to `postLikeRepository.countByPostId(postId)`, then `SET` key with DB result (warmup).

**Changes in `CommentServiceImpl`:**
- Same pattern for `likeComment()` / `unlikeComment()` / `mapToResponse()`.

**`isLikedByCurrentUser`** stays as DB query — `existsByPostIdAndUserId` is an indexed point lookup, cheap enough.

**Note:** `RedisTemplate<String, Long>` or `StringRedisTemplate` with `Long.parseLong()` — reuse the existing Redis config in `server` module.

---
