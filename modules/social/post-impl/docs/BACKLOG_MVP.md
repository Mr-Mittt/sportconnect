# Post Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/post-impl`  
**Last updated:** 2026-07-02

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon post mvp` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | A1 | JWT-based identity | `DONE` |
| 2 | A2 | Fix post delete permission (group owner/admin) | `DONE` |
| 3 | A3 | Group posts membership gate | `DONE` |
| 4 | A4 | Comment fixes (depth + post-active check) | `DONE` |
| 5 | B1 | Friendship system | `DONE` |
| 6 | B2 | Personalized main feed | `DONE` |
| 7 | B3 | Redis like counters | `DONE` |
| 8 | B4 | Redis comment preview cache | `DONE` |
| 9 | B5 | Hashtag service | `DONE` |
| 10 | B6 | GROUP_BROADCAST management | `DONE` |
| 11 | A5 | Fix cross-domain violation in CommentServiceImpl (UserRepository/User → UserService) | `DONE` |
| 12 | A6 | Fix N+1 hashtag lookup in feed mappers | `DONE` |
| 13 | A7 | Fix N+1 in CommentServiceImpl.getPostComments (cross-domain user lookup + per-comment replies query) | `DONE` |
| 14 | A8 | `server:test` needs Redis — `PostControllerIntegrationTest.shouldCreatePost` fails without it | `DONE` |

**Note:** F1 (Frontend — personalized feed) moved to `client/docs/BACKLOG_MVP.md`.

**Dependencies:**
```
A1 → A2, A3, B1
B1 → B2
A5: no hard dependency (can run any time)
All others: no hard dependency (can run in parallel after A1)
```

---

## Tickets

### A1 · JWT-based identity
**Status:** `DONE`  
**Type:** Enhancement (Security)  
**Scope:** `PostController.java` only — no service layer changes

Extract `userId` from the JWT principal inside the controller. Remove caller-identity `userId` / `currentUserId` from request params. Bundle: rename `GET /api/posts/user/{userId}` → `GET /api/posts/mine` (userId comes from token; no path param; other users cannot access).

**Required caller ID (9 endpoints) — replace `@RequestParam UUID userId` with `@AuthenticationPrincipal`:**
- `POST /api/posts` — createPost
- `PUT /api/posts/{postId}` — updatePost
- `DELETE /api/posts/{postId}` — deletePost
- `POST /api/posts/{postId}/like` — likePost
- `DELETE /api/posts/{postId}/like` — unlikePost
- `POST /api/posts/{postId}/comments` — createComment
- `DELETE /api/posts/comments/{commentId}` — deleteComment
- `POST /api/posts/comments/{commentId}/like` — likeComment
- `DELETE /api/posts/comments/{commentId}/like` — unlikeComment

**Optional viewer ID (5 endpoints) — replace `@RequestParam(required = false) UUID currentUserId` with `Authentication` + `SecurityUtils.extractUserId()`:**
- `GET /api/posts/{postId}` — getPost
- `GET /api/posts/mine` — getUserPosts (was `GET /api/posts/user/{userId}`, userId now from token)
- `GET /api/posts/feed` — getPublicFeed
- `GET /api/posts/group/{groupId}` — getGroupPosts
- `GET /api/posts/{postId}/comments` — getPostComments

**Reuse:** `SecurityUtils.extractUserId(Authentication)` from `com.sportconnect.common.auth.SecurityUtils` — already exists in `common` module, used in group-impl A1. No new utility code needed.

---

### A2 · Fix post delete permission
**Status:** `DONE`  
**Type:** Bug Fix  
**Dependency:** A1

`PostServiceImpl.deletePost()` currently only checks `post.getUserId().equals(userId)`. Group owner and group admin must also be able to delete `GROUP_POST` and `GROUP_BROADCAST` posts in their group.

**Required change in `PostServiceImpl.deletePost()`:**
```java
boolean isOwner = post.getUserId().equals(userId);
boolean isGroupModerator = post.getGroupId() != null &&
    (groupService.isGroupOwner(post.getGroupId(), userId) ||
     groupService.isGroupAdmin(post.getGroupId(), userId));

if (!isOwner && !isGroupModerator) {
    throw new BadRequestException("You do not have permission to delete this post");
}
```

**Cross-domain calls:** `groupService.isGroupOwner()` and `groupService.isGroupAdmin()` — both already exist on `GroupService` interface in `group-api`.

**Tests:** Add Spock cases: group owner deletes GROUP_POST (success), group admin deletes GROUP_BROADCAST (success), non-member tries to delete (fail).

---

### A3 · Group posts membership gate
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

### A4 · Comment fixes
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

### B1 · Friendship system
**Status:** `DONE` — implemented in `modules/user/user-impl` (U1). See `modules/user/user-impl/docs/U1_FRIENDSHIP_SYSTEM.md`.  
**Type:** New Feature  
**Dependency:** A1  
**Replaces:** `UserFollow` entity and `user_follows` table

**Liquibase migration (new file):**
- Create `friendships` table: `id BIGSERIAL PK, requester_id UUID NOT NULL, addressee_id UUID NOT NULL, status VARCHAR NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP, updated_at TIMESTAMP, UNIQUE(requester_id, addressee_id)`
- Drop `user_follows` table

**New entity:** `Friendship.java` in `post-impl` — fields: `id`, `requesterId (UUID)`, `addresseeId (UUID)`, `status (String)`, `createdAt`, `updatedAt`.  
**Delete entity:** `UserFollow.java`

**New interface:** `FriendshipService.java` in `post-api`:
```java
void sendRequest(UUID requesterId, UUID addresseeId);
void acceptRequest(UUID addresseeId, UUID requesterId);
void declineRequest(UUID addresseeId, UUID requesterId);
void unfriend(UUID callerId, UUID friendId);
Page<FriendshipResponse> getMyFriends(UUID userId, Pageable pageable);
Page<FriendshipResponse> getPendingRequests(UUID userId, Pageable pageable);
String getFriendshipStatus(UUID callerId, UUID targetId); // NONE / PENDING / ACCEPTED / DECLINED
List<UUID> getAcceptedFriendIds(UUID userId); // used by B2 feed query
```

**New DTOs in `post-api`:** `FriendshipResponse` (friendId, fullName, avatarUrl, status, since).

**New controller:** `FriendshipController.java` in `post-impl` at `/api/social/friends`:
```
POST   /request/{addresseeId}    ROLE_USER — send friend request
POST   /accept/{requesterId}     ROLE_USER — accept incoming request
DELETE /decline/{requesterId}    ROLE_USER — decline incoming request
DELETE /{friendId}               ROLE_USER — unfriend
GET    /                         ROLE_USER — my ACCEPTED friends (paginated)
GET    /requests                 ROLE_USER — pending requests I received (paginated)
GET    /status/{userId}          ROLE_USER — friendship status with a specific user
```

**Validation:** Cannot send request to self (`BadRequestException`). Duplicate request blocked by DB unique constraint + service-level check. Cannot accept a request you sent (must be addressee).

**Repository methods needed:** `findByRequesterIdAndAddresseeId`, `findByAddresseeIdAndStatus`, `findAcceptedFriendships` (either direction), `existsByRequesterIdAndAddresseeIdAndStatus`.

---

### B2 · Personalized main feed
**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** A1, B1

Replace the current `getPublicFeed()` (all public USER_FEED posts, no auth) with an authenticated, personalized feed.

**Liquibase migration:** Add `last_interaction_at TIMESTAMP DEFAULT now()` to `posts` table. Add index: `CREATE INDEX idx_posts_feed ON posts(last_interaction_at DESC) WHERE is_active = true`.

**Feed content:** Posts where:
- `(user_id = callerId AND post_type = 'USER_FEED')` — caller's own posts
- `(user_id IN [friendIds] AND post_type = 'USER_FEED')` — friends' USER_FEED posts (ACCEPTED only)
- `(group_id IN [callerGroupIds] AND post_type = 'GROUP_POST')` — GROUP_POSTs from caller's sport-matched groups

**Ordering:** `last_interaction_at DESC`

**Cross-domain calls:**
- `friendshipService.getAcceptedFriendIds(callerId)` → `List<UUID>` (B1)
- `groupService.getGroupIdsBySportProfiles(callerId)` → `List<Long>` — **new method required on `GroupService` interface in `group-api`** and implemented in `GroupServiceImpl` (join `group_members` + `groups` + `user_sport_profiles` where `groups.sport_id = user_sport_profiles.sport_id AND user_sport_profiles.user_id = callerId`)

**Update `last_interaction_at`** in `PostServiceImpl`:
- `likePost()` / `unlikePost()` → update the post's `last_interaction_at = now()`
- `createComment()` → update parent post's `last_interaction_at = now()`
- `deleteComment()` → recompute or set to `max(created_at of remaining comments, post.created_at)` — simplest: set to `now()` or leave unchanged on delete

**Endpoint:** `GET /api/posts/feed` (existing URL, now requires auth, now personalized). Unauthenticated callers → `401`.

**New repository query:** `PostRepository.findPersonalizedFeed(UUID callerId, List<UUID> friendIds, List<Long> groupIds, Pageable pageable)` — JPQL with `IN` clauses.

---

### B3 · Redis like counters
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

### B4 · Redis comment preview cache
**Status:** `DONE`  
**Type:** Enhancement (Performance)

Serve "3 latest comments" on feed post cards from Redis to avoid N+1 queries (20 posts × `getPostComments()` = 20 extra DB hits per feed page load).

**Redis key:** `post:{postId}:preview` — Sorted Set, score = `createdAt` epoch millis, member = serialized comment JSON.

**Changes in `CommentServiceImpl`:**
- `createComment()` → after DB save:
  ```
  ZADD post:{postId}:preview {timestamp} {commentJson}
  ZREMRANGEBYRANK post:{postId}:preview 0 -4  // keep only 3 most recent
  ```
- `deleteComment()` → `ZREM post:{postId}:preview {commentJson}` (or `DEL` full key for simplicity on MVP)
- `deletePost()` in `PostServiceImpl` → `DEL post:{postId}:preview`

**In `PostServiceImpl.mapToResponse()`:** Add `previewComments: List<CommentResponse>` to `PostResponse`. Read from `ZREVRANGE post:{postId}:preview 0 2`; if key missing → fall back to DB query (`findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc`, limit 3) and populate Redis.

**Liquibase — add index:**
```sql
CREATE INDEX idx_comments_post_active_created
  ON comments(post_id, is_active, created_at DESC);

CREATE INDEX idx_comments_parent_active
  ON comments(parent_comment_id, is_active, created_at ASC);
```

**DTO change:** Add `previewComments: List<CommentResponse>` to `PostResponse.java` in `post-api`.

---

### B5 · Hashtag service
**Status:** `DONE`  
**Type:** New Feature

Auto-extract `#word` patterns from post content and maintain hashtag usage counts.

**DTO change:** Remove `hashtags: List<String>` from `CreatePostRequest.java` (no longer manually provided).

**New interface:** `HashtagService.java` in `post-api`:
```java
void extractAndSaveHashtags(Post post, String content);
void decrementHashtagsForPost(Long postId);
Page<HashtagResponse> getTrendingHashtags(int limit);
Page<HashtagResponse> suggestHashtags(String prefix, int limit);
Page<PostResponse> getPostsByHashtag(String tag, UUID currentUserId, Pageable pageable);
```

**New DTO:** `HashtagResponse` (id, tag, usageCount).

**New implementation:** `HashtagServiceImpl.java` in `post-impl`:
- Extraction regex: `#(\w+)` on post content. Normalize to lowercase. Max 30 per post (silently truncate).
- Upsert hashtag: `INSERT INTO hashtags(tag) VALUES(?) ON CONFLICT (tag) DO UPDATE SET usage_count = usage_count + 1` — or JPA equivalent with `findByTag` + `incrementUsageCount()`.
- Link via `PostHashtag` junction entity (already exists).

**Changes in `PostServiceImpl`:**
- `createPost()` → call `hashtagService.extractAndSaveHashtags(post, request.getContent())` after post is saved
- `deletePost()` → call `hashtagService.decrementHashtagsForPost(postId)` before (or after) setting `isActive=false`

**New controller — `HashtagController.java`** in `post-impl` at `/api/hashtags`:
```
GET /suggest?q={prefix}&limit=10    — public — ILIKE prefix match, ordered by usageCount DESC
GET /trending?limit=10              — public — top hashtags by usageCount DESC
```

**New endpoint on `PostController`:**
```
GET /api/posts/hashtag/{tag}?page=&size=    — public — posts tagged with #tag
```
Visibility: return USER_FEED posts that are public + GROUP_POSTs only if caller is a member of that group.

**Liquibase — add index:**
```sql
CREATE INDEX idx_hashtags_tag ON hashtags(tag varchar_pattern_ops);
```

---

### B6 · GROUP_BROADCAST management
**Status:** `DONE`  
**Type:** New Feature  
**Dependency:** A1, A2

A group can have exactly 1 active broadcast at a time. It auto-expires after a configurable duration (default 24h). Shown in a dedicated broadcast section (separate from main feed) visible to users whose sport profiles match the group's sport.

**Liquibase migration:** Add `broadcast_end_time TIMESTAMP` to `posts` table (nullable, only used for GROUP_BROADCAST).

**DTO changes:**
- `CreatePostRequest` — add `broadcastEndTime: LocalDateTime` (optional; default applied in service)
- `PostResponse` — add `broadcastEndTime: LocalDateTime`

**Changes in `PostServiceImpl.createPost()` for GROUP_BROADCAST:**
```java
// Check no active broadcast exists for this group
boolean hasActive = postRepository.existsActiveGroupBroadcast(groupId); // new query
if (hasActive) {
    throw new BadRequestException("This group already has an active broadcast");
}
// Set default end time if not provided
LocalDateTime endTime = request.getBroadcastEndTime() != null
    ? request.getBroadcastEndTime()
    : LocalDateTime.now().plusHours(24);
post.setBroadcastEndTime(endTime);
```

**New repository query:** `PostRepository.existsActiveGroupBroadcast(Long groupId)`:
```sql
SELECT COUNT(*) > 0 FROM posts
WHERE group_id = ? AND post_type = 'GROUP_BROADCAST'
  AND is_active = true AND broadcast_end_time > now()
```

**New endpoint:**
```
GET    /api/posts/broadcast          ROLE_USER — active broadcasts for caller's sport profiles
PATCH  /api/posts/{postId}/broadcast-end-time  ROLE_USER (owner/admin only) — extend/change end time
```

`GET /api/posts/broadcast` logic:
1. Get caller's sport-matched group IDs: `groupService.getGroupIdsBySportProfiles(callerId)` (same method as B2)
2. Query: `WHERE group_id IN [groupIds] AND post_type = 'GROUP_BROADCAST' AND is_active = true AND broadcast_end_time > now()`
3. Return paginated `PostResponse` list

**Delete:** `DELETE /api/posts/{postId}` (existing, already gated by A2 — owner/admin can delete).
**Update content:** `PUT /api/posts/{postId}` (existing).
**Extend end time:** `PATCH /api/posts/{postId}/broadcast-end-time` — body: `{ "broadcastEndTime": "2026-07-02T12:00:00" }`. Validate caller is owner/admin via `groupService`.

---

### A5 · Fix cross-domain violation in CommentServiceImpl (UserRepository/User → UserService)
**Status:** `DONE`  
**Type:** Bug Fix (Architecture)  
**Scope:** `CommentServiceImpl.java` only — `PostServiceImpl.java` in this same module is already clean
(correctly uses `UserFriendService` from `user-api` only).

`CommentServiceImpl` directly imports and injects `com.sportconnect.user.entity.User` and
`com.sportconnect.user.repository.UserRepository` — both internal classes of `user-impl`, not the
`user-api` interface. This violates this repo's core architecture rule (root `CLAUDE.md`):
"Cross-domain communication through `-api` interfaces only — never import a concrete class from
another domain's `-impl` module." Found during the same audit that produced `modules/social/group-impl`'s
ticket A6 (identical pattern).

**Why this exists (confirmed via `git log`, not guessed):** `CommentServiceImpl.java` traces back to
the same early commits (`64cae07`/`499db05`) that predate `CLAUDE.md`'s introduction (`8b85daa`,
several commits later). Same story as A6 in group-impl — the code predates the rule's documentation
and was never retrofitted once the rule existed. All other cross-domain code in this module (e.g.
`PostServiceImpl`'s use of `GroupService`/`UserFriendService`) correctly follows the rule.

**Current usages to replace (2 call sites, both the same pattern):**
```java
String userFullName = userRepository.findById(comment.getUserId())
        .map(User::getFullName)
        .orElse("Unknown User");
```
- `buildPreviewResponse()` (~line 173)
- `mapToResponse()` (~line 200)

Replace both with `userService.getUserById(comment.getUserId())`'s `fullName` — no batch lookup needed
here (unlike A6's `creatorNames` case), since each is a single-comment mapping call; no new `UserService`
method required, `getUserById(UUID)` (`user-api`) already exists and returns a `UserResponse` with
`getFullName()`.

**Note:** `getUserById()` throws `ResourceNotFoundException` if the user doesn't exist, whereas the
current code silently falls back to `"Unknown User"` via `.orElse(...)`. Preserve the existing
fallback behavior — wrap the call (e.g. `try/catch` or a small helper) rather than letting a missing
user break comment rendering; a comment author who was later hard-deleted (if that ever happens) or a
data-integrity edge case shouldn't 500 the whole response.

**Dependency swap:** remove the `UserRepository userRepository` field from `CommentServiceImpl`; add
`UserService userService` (`user-api` — `post-impl` already depends on `user-api`, used correctly
elsewhere in this module by `PostServiceImpl`, no new Gradle dependency needed).

**Gradle change required (confirmed by checking `post-impl/build.gradle` directly, not assumed):**
`CommentServiceImpl` is the only file in this module using `user-impl` internals — once this ticket
lands, remove the now-unnecessary `implementation project(':modules:user:user-impl')` line from
`post-impl/build.gradle` entirely (keep `user-api`, which stays needed).

**Tests:** update `CommentServiceImplSpec` wherever `userRepository` is mocked (2 places) to mock
`userService` instead; add a case confirming the `"Unknown User"` fallback still applies when the
author lookup fails.

**Out of scope:** no change to what data is displayed (same `fullName` value, same fallback string) —
pure architecture-compliance refactor, no new behavior.

---

### A6 · Fix N+1 hashtag lookup in feed mappers
**Status:** `DONE`  
**Type:** Bug Fix (Performance)  
**Scope:** `PostServiceImpl.java`, `HashtagServiceImpl.java`, `HashtagService.java` (post-api),
`PostHashtagRepository.java`

**Found during a cross-module N+1 audit** (following the same audit that produced group-impl's A7/A8).
`PostServiceImpl.mapToResponse(post, currentUserId)` — shared by all 5 paginated feed methods
(`getUserPosts`, `getPersonalizedFeed`, `getGroupPosts`, `getPostsByHashtag`, `getActiveBroadcasts`) —
calls `hashtagService.getTagsForPost(post.getId())` once per post in the page, with no batching or
caching:
```java
.hashtags(hashtagService.getTagsForPost(post.getId()))
```
which resolves to `postHashtagRepository.findTagsByPostId(postId)` — a single-id repository query, no
batch equivalent exists.

**Important — narrower than it first looked:** an initial scan of `mapToResponse` also flagged
`likeCount`, `commentCount`, and `getPreviewComments()` as per-item DB calls. Verified directly against
the current code: those three already go through `getCount()`, a Redis-first helper (added by B3/B4) —
in the steady state they're per-post **Redis** GETs (still N round trips, not N SQL queries), falling
back to DB only on cache miss. `isLikedByCurrentUser` is a direct DB point-lookup **by deliberate design**
(B3's own note: "indexed point lookup, cheap enough") — not a bug, don't re-fix it here. The hashtag
lookup is the one genuinely unaddressed gap: no cache, no batch, plain DB hit every time.

**Fix approach:** add a batch method mirroring the group module's `getUsersByIds` convention:
- `PostHashtagRepository`: `@Query` returning tag lists grouped by post id for a `List<Long> postIds`
  (e.g. `List<Object[]>` of `(postId, tag)` pairs, or a projection), or reuse the existing
  `findTagsByPostId` shape but with an `IN` clause + grouping.
- `HashtagService` (post-api): add `Map<Long, List<String>> getTagsForPosts(List<Long> postIds)`.
- `PostServiceImpl`: in each of the 5 paginated methods, collect distinct post ids from `page.getContent()`
  before the `.map()`, call `getTagsForPosts(postIds)` once, and have `mapToResponse` take the resolved
  `Map` instead of calling `getTagsForPost` itself (same pattern as A7/A8 in group-impl — pure mapper,
  no DB calls inside).

**Out of scope:** `likeCount`/`commentCount`/`isLikedByCurrentUser`/`previewComments` — already
addressed (Redis) or a deliberate design decision (isLiked). No change to what data is displayed.

---

### A7 · Fix N+1 in CommentServiceImpl.getPostComments
**Status:** `DONE`  
**Type:** Bug Fix (Performance + Architecture)  
**Scope:** `CommentServiceImpl.java` only

**Found during the same audit as A6.** `getPostComments`'s mapper (`mapToResponse`, lines ~200-228)
does, per root comment in the page:
- `resolveUserFullName(comment.getUserId())` → **cross-domain** `userService.getUserById(userId)` call
  (line ~206) — no batching, called again for every reply too (see below)
- `commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(comment.getId())` — a
  per-comment query fetching all direct replies, unbatched
- recursively calls `mapToResponse(reply, currentUserId)` on each reply, repeating the same
  cross-domain user lookup + DB calls per reply

`likeCount`/`replyCount` already go through the same `getCount()` Redis-first helper as A6 found in
`PostServiceImpl` — not a fresh concern. `isLikedByCurrentUser` is the same deliberate direct-DB design
as A6. The two real gaps are the **unbatched cross-domain user lookup** and the **per-comment replies
query**.

**Note on severity — corrected from the initial scan:** the recursion is **not** unbounded-depth.
A4 (`DONE`) already enforces one-level nesting in `createComment()` — a reply's own `parentCommentId`
can never itself be a reply, so `findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(reply.getId())`
called inside the recursive `mapToResponse(reply, ...)` will always return empty. Real worst case is
2 levels (root comments × their direct replies), not the exponential/unbounded-depth case an earlier
pass estimated — still a real N+1 (a popular root comment with many replies means many unbatched
per-reply user lookups + DB checks), just not as catastrophic as first framed.

**Fix approach:**
- Batch the cross-domain user lookup: collect all comment + reply user ids for the whole page up front
  (requires fetching replies before mapping, not lazily inside the mapper), call
  `userService.getUsersByIds(...)` (already exists, added in group-impl's A6/A7) once, resolve
  `userFullName` from the returned map instead of `resolveUserFullName()` per item.
- Batch the replies query: collect all root comment ids from the page, one
  `commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(List<Long> parentIds)`
  call (new repository method) instead of one query per root comment.
- Mapper becomes a pure function taking pre-resolved `Map<UUID, UserResponse>` (users) and
  `Map<Long, List<Comment>>` (replies by parent id) — same shape as group-impl's A7/A8 mappers.

**Tests:** update `CommentServiceImplSpec` wherever `userService.getUserById`/the per-comment replies
query is mocked; add/keep coverage for a root comment with multiple replies to confirm batching doesn't
change output, only call counts.

**Out of scope:** `likeCount`/`replyCount`/`isLikedByCurrentUser` (already addressed or deliberate, see
above). `buildPreviewResponse` (a separate, single-comment helper used elsewhere, not part of the
paginated `getPostComments` path) — not touched here unless later found to also be called in a loop.

---

### A8 · `server:test` needs Redis
**Status:** `DONE` — see `modules/social/post-impl/docs/A8_SERVER_TEST_REDIS_TESTCONTAINERS.md`  
**Type:** Bug Fix (Test infra)  
**Scope:** `server/src/test/resources/application-test.yml`, possibly `PostServiceImpl`'s
Redis-counter code path (B3/B4)

**Found during:** auth module A2/A3 work (2026-07-08), while chasing an unrelated integration-test
schema-drift detour (see auth module's A2/A3 closeout docs). `PostControllerIntegrationTest
.shouldCreatePost` fails with `RedisConnectionFailureException: Unable to connect to Redis` — the
`test` profile's `spring.data.redis.enabled: false` in `application-test.yml` is **not a real
Spring Boot property** (confirmed by this failure — it's a no-op, same category of dead config as
`spring.security.enabled: false` in the same file, which also does nothing in Spring Boot 3.x).
`PostServiceImpl.createPost` unconditionally touches Redis for the B3/B4 like-counter/comment-
preview-cache features, so the test genuinely needs a real (or embedded/fake) Redis to pass — it
isn't optional infrastructure for this code path.

**Two possible fixes, need a decision before implementing:**
1. **Give `server:test` a real Redis.** Natural fit with `infra/documentation/BACKLOG_MVP.md`'s
   **INFRA-2** (dev docker-compose) — either reuse that compose file for CI/test runs too, or wire
   Testcontainers' Redis module into `BaseIT` (spins up a throwaway container per test run,
   `@Container` + `@DynamicPropertySource` overriding `spring.data.redis.host/port`).
2. **Make the Redis-backed counter path test-profile-aware** so it degrades gracefully without
   Redis (e.g. skip the cache write, fall back to a DB count) — changes production code to
   accommodate a test gap, generally the less preferred direction unless Redis-optional behavior
   is independently desired.

**Not fixed as part of A2/A3** — deliberately left `PostControllerIntegrationTest.shouldCreatePost`
red rather than scope-creep further into Redis test infrastructure; that session's actual schema-
drift-in-`schema.sql` fixes (unrelated missing columns/tables) are unaffected and remain fixed.

---
