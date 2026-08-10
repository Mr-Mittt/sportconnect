# Post Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/post-impl`  
**Last updated:** 2026-08-10

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
| 15 | A9 | Fix `PostResponse` never populating `userFullName`/`sportName`/`shareCount` | `DONE` |
| 16 | A10 | Fix `GET /api/posts/hashtag/{tag}` — always 500s (conflicting `ORDER BY`) | `DONE` |
| 17 | A15 | Drop DB-level FKs on post-impl tables' cross-domain columns (user_id chain, posts.group_id, and posts.sport_id — absorbs A13) | `TODO` |
| 18 | A11 | Fix broadcast-expiry timezone mismatch (JVM-local `LocalDateTime` vs DB-UTC `CURRENT_TIMESTAMP`) | `TODO` |
| 19 | A12 | Revisit A9's `sportName` join — sports are static reference data, client may not need it server-resolved | `TODO` |
| 20 | A14 | Enforce post visibility/group-membership on single-item paths (getPostById, comments, likes) — not just list endpoints | `TODO` |

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

### A9 · Fix `PostResponse` never populating `userFullName`/`sportName`/`shareCount`
**Status:** `DONE` (2026-07-13) · **Summary:** `modules/social/post-impl/docs/A9_POSTRESPONSE_MISSING_FIELDS.md`
**Type:** Bug Fix
**Scope:** `PostServiceImpl.mapToResponse()` (ended up touching all 10 call sites, plus a new
`sport-api`/`sport-impl` batch method and a new `post-impl` Gradle dependency — see summary doc)
**Found during:** client ticket FEED-0 (`client/docs/BACKLOG_MVP.md`), verified live against a
running backend (2026-07-13) — not assumed from reading code alone.

`PostServiceImpl.mapToResponse()` (~line 390) never calls `.userFullName(...)`,
`.userAvatarUrl(...)`, `.sportName(...)`, or `.shareCount(...)` on the `PostResponse.builder()` —
those four fields are simply absent from the builder chain, so they always serialize as `null`
(`shareCount` too, despite being conceptually a count — it's a boxed `Long`, not a primitive, so
it's `null` rather than `0`). Confirmed via three live calls: `POST /api/posts` (create),
`GET /api/posts/{id}`, and `GET /api/posts/feed` all return `"userFullName":null,
"sportName":null,"shareCount":null` for a real post from a user who genuinely has a full name, and
even with `sportId` explicitly set on create.

**Why `userFullName` matters most:** `CommentServiceImpl`'s own mapper (A5, `DONE`) correctly
resolves `userFullName` via `userService.getUserById(...)` — same live-verified test user's comment
came back `"userFullName":"Feed Zero QA"` on the identical account that got `null` from every Post
endpoint. This is a Post-specific gap, not a "the user has no name" data issue, and not something
CommentServiceImpl needs fixing too.

**Why this blocks client work:** `client/docs/BACKLOG_MVP.md`'s FEED-1 (Feed + PostCard, real) needs
`userFullName`/`userAvatarUrl` to render "who posted this" — currently unbuildable against the real
contract without a client-side workaround. `sportName` blocks any sport-badge rendering on a post
card that only has `sportId`. `shareCount` blocks the share-count display placeholder, though
post-impl's own module doc already notes share logic itself is unimplemented (V1 scope, `C6`) — this
ticket is just about the field existing and being non-null (e.g. `0`), independent of whether share
logic itself ships.

**Fix approach:**
- `userFullName`/`userAvatarUrl`: resolve via `userService.getUsersByIds(...)` (already used
  elsewhere in this module per A6/A7's batching convention) — batch across the page in each of the 5
  paginated callers of `mapToResponse` (same shape as A6's hashtag batching), pass the resolved
  `Map<UUID, UserResponse>` into the mapper rather than looking it up per-item inside it.
- `sportName`: resolve via the sport module's `-api` interface (check `modules/sport/sport-api`'s
  service for a `getSportsByIds`/`getSportById`-style batch method; add one if it doesn't exist,
  following the same cross-domain-batch convention).
- `shareCount`: set to `0L` (or the real query if `C6`/post-sharing has landed by the time this is
  picked up) rather than leaving the builder call absent.

**Tests:** Update `PostServiceImplSpec` wherever `mapToResponse`'s output is asserted — add explicit
assertions that `userFullName`/`sportName`/`shareCount` are non-null on a fresh post, not just that
the response builds without error (the bug shipped silently specifically because nothing asserted
these fields were populated).

---

### A10 · Fix `GET /api/posts/hashtag/{tag}` — always 500s
**Status:** `DONE` (2026-07-14) · **Summary:** `modules/social/post-impl/docs/A10_FIX_HASHTAG_ENDPOINT_500.md`
**Type:** Bug Fix
**Scope:** `PostHashtagRepository.findPostsByHashtag`, `PostController.getPostsByHashtag`
**Found during:** client ticket FEED-0, verified live against a running backend (2026-07-13).

`GET /api/posts/hashtag/{tag}` throws `org.hibernate.query.sqm.UnknownPathException` for **every**
call, with or without a leading `#`, with or without any posts existing — confirmed via two live
calls (`%23feed0check` and `feed0check`, both 500). Root cause, read directly from the runtime error
and the repository source:

- `PostHashtagRepository.findPostsByHashtag`'s `@Query` already has its own static
  `ORDER BY ph.post.lastInteractionAt DESC`.
- `PostController.getPostsByHashtag`'s `@PageableDefault(size = 20, sort = "lastInteractionAt",
  direction = Sort.Direction.DESC)` supplies a `Pageable` that ALSO carries a `Sort`.
- Spring Data JPA appends the `Pageable`'s `Sort` properties onto the query as an *additional*
  `ORDER BY` clause, resolved against the query's root entity — which here is `PostHashtag ph`, not
  `Post`. The generated query ends up as `ORDER BY ph.post.lastInteractionAt DESC,
  ph.lastInteractionAt desc` — and `PostHashtag` has no `lastInteractionAt` field of its own (only
  `Post` does, already correctly referenced via `ph.post.lastInteractionAt` in the static clause).
  Hibernate throws immediately trying to resolve the second, dynamically-appended path.

**Why this blocks client work:** `client/docs/BACKLOG_MVP.md`'s FEED-6 (TrendingHashtags, real) and
its `usePostsByHashtag` hook (FEED-0) are typed and wired correctly against the documented contract,
but this endpoint cannot return data at all today — not a data-shape issue like A9, a hard 500 on
every call.

**Fix approach (pick one):**
1. Remove the static `ORDER BY` from the `@Query` and rely solely on the `Pageable`'s `Sort` — but
   the `Sort` property name (`"lastInteractionAt"`) would then need to resolve against `Post` (the
   method's actual return type), not `PostHashtag` (the `FROM` root) — likely needs the query
   restructured to select from `Post` with a `WHERE EXISTS (... PostHashtag ...)` subquery instead of
   `FROM PostHashtag`, so Spring Data's sort-property resolution lines up with the returned type.
2. Keep the static `ORDER BY` and stop the controller from supplying a conflicting default `Sort` for
   this specific endpoint — e.g. a plain `@PageableDefault(size = 20)` with no `sort`, so Spring Data
   has nothing to append. Simpler, smaller diff — verify no other caller depends on
   `getPostsByHashtag`'s pagination honoring a client-supplied sort override before choosing this.

**Tests:** No existing Spock coverage caught this (confirmed no test currently exercises this
endpoint against a real query — add one). Add a `PostServiceImplSpec`/integration test that actually
calls `getPostsByHashtag` end-to-end (not just mocking the repository) so a future regression here
fails a test instead of only surfacing via manual/live verification again.

---

### A11 · Fix broadcast-expiry timezone mismatch
**Status:** `TODO` · **Type:** Bug Fix
**Scope:** `PostServiceImpl.createPost`/`updateBroadcastEndTime`, `PostRepository.existsActiveGroupBroadcast`/`findActiveBroadcasts`
**Found during:** client ticket FEED-9 (QA/acceptance checklist), live-verified against a real running
backend + dev Postgres (2026-07-17).

`broadcastEndTime` is validated and defaulted using the **application server's JVM-local clock**
(`LocalDateTime.now()`, observed running at UTC+7 in dev), but the dev Postgres container's clock —
and therefore JPQL's `CURRENT_TIMESTAMP`, used by both `existsActiveGroupBroadcast` and
`findActiveBroadcasts` to decide whether a broadcast is still active — runs in **UTC**. Confirmed live:

- Sent `broadcastEndTime: "2026-07-17T11:18:45"` (a few seconds ahead of the app server's own
  `now()`, ~`11:18:37`) in a `POST /api/posts` (`GROUP_BROADCAST`) call — passed the
  "`broadcastEndTime` must be in the future" check (compared against the app server's local clock).
- Row landed in Postgres as `broadcast_end_time = 2026-07-17 04:18:45` — 7 hours **earlier** than the
  literal value sent, while Postgres's own `NOW()` at the same moment was `2026-07-17 04:19:32`.
  `broadcast_end_time > CURRENT_TIMESTAMP` therefore evaluated `false` **immediately**, even though
  the caller had just been told this timestamp was in the future — `GET /api/posts/broadcast`
  silently omitted the row from the moment it was created.

**Why this isn't a shipped-feature regression today:** the only real client path that creates a
broadcast (`CreatePostForm`'s broadcast toggle, FEED-7) never sends `broadcastEndTime` at all — it
lets the server default to `now()+24h` using the *same* JVM-local clock for both the write and the
later `CURRENT_TIMESTAMP` read-side comparison, so the ~7h skew is dwarfed by the 24h margin and the
broadcast still reads as active well past its intended window. Live-verified this default path
separately: correctly appeared in `GET /api/posts/broadcast` immediately after creation. The
update-broadcast flow (`useUpdatePost` via `UpdateBroadcastConfirmDialog`) also never touches
`broadcastEndTime` — it only re-sends `content`/`locationName`/`sportId`/`visibility`. So today's UI
never exercises the broken window; this is a latent correctness bug, not a visible regression.

**Where it would bite:** any future ticket that lets a caller set a broadcast's expiry to something
closer to "now" than the JVM/DB clock skew (e.g. a "custom duration" broadcast option, or exposing
the existing-but-unused `updateBroadcastEndTime` service method to a real endpoint/client call) would
see broadcasts silently read as already-expired. Also affects `existsActiveGroupBroadcast`'s one-
active-broadcast-per-group cap the same way, in the same narrow window.

**Fix approach:** store and compare `broadcastEndTime` in a timezone-consistent way — either persist
as `OffsetDateTime`/`Instant` (timestamptz) instead of a naive `LocalDateTime`, or explicitly convert
using a fixed zone (e.g. UTC) on both the write path (`createPost`'s default-computation and the
future-check) and read path (replace JPQL `CURRENT_TIMESTAMP`, which resolves against the DB
server's own clock/timezone setting, with a value computed application-side in the same zone used to
store the column). Verify dev/prod Postgres and the JVM's default timezone assumption don't silently
drift apart again — this class of bug (naive local timestamp vs. DB-server-clock comparison) is easy
to reintroduce anywhere else in the codebase using JPQL `CURRENT_TIMESTAMP` against a
`LocalDateTime`-typed column.

**Tests:** No existing Spock coverage exercises the actual DB-level timestamp comparison (mocked
repositories in unit specs wouldn't catch this class of bug at all) — add a `server:test`-level
integration test that creates a broadcast with a short explicit `broadcastEndTime` a few seconds in
the future and asserts it's still returned by `getActiveBroadcasts` immediately after creation, so a
regression here fails a real test instead of only surfacing via manual/live verification again (same
lesson as A10).

---

### A12 · Revisit A9's `sportName` join
**Status:** `TODO` · **Type:** Enhancement (Efficiency) · **Filed:** 2026-07-25, raised while scoping
group-impl's B15 (`modules/social/group-impl/docs/BACKLOG_MVP.md`).

**Origin:** B15 needed to add `sportId` to `GroupInvitationResponse` and initially considered mirroring
A9's pattern here — inject `SportService` and batch-resolve `sportName` via `getSportsByIds()` once per
page. Instead, B15 shipped `sportId` only: sports are static reference data already fully exposed via
the public `GET /api/sports` endpoint, so a client can fetch that list once and resolve any `sportId` to
a name locally, with no need for the backend to join the name into every response that carries a
`sportId`. That reasoning applies equally to A9's `sportName` field on `PostResponse` — flagged here as
a candidate simplification, not applied automatically, because unlike B15 (a brand-new field, no
existing consumer), A9's `sportName` is already shipped and live-consumed by the client's Feed/PostCard
sport-badge rendering (A9's own ticket text: "`sportName` blocks any sport-badge rendering on a post
card that only has `sportId`" — implying the client did *not* already have a locally-cached sports list
at the time A9 was scoped).

**What this ticket needs to resolve before any code changes:**
- Confirm whether the client (by now) already fetches/caches the full sports list somewhere reachable
  from Feed/PostCard's rendering context (e.g. for a sport switcher or filter elsewhere in the app). If
  yes, `sportName` becomes redundant duplication, not a hard client dependency, and can potentially be
  removed. If no, this ticket should conclude "leave as-is" rather than force a client change just for
  backend simplification.
- This is a **breaking contract change** if pursued (removing an existing `PostResponse` field), unlike
  B15's purely-additive `sportId` — needs a corresponding client ticket, not just a backend one, and
  should not land in the same session as any client work depending on the current `sportName` field
  without coordinating both sides.

**Out of scope:** any change to `GroupInvitationResponse`/group-impl (B15 already shipped, sportId-only,
no sportName) — this ticket is scoped entirely to `post-impl`'s existing A9 field.

---

### A14 · Enforce post visibility/group-membership on single-item paths, not just list endpoints
**Status:** `TODO` · **Type:** Bug Fix (Security) · **Filed:** 2026-08-08, found while designing
`SESSION-10`'s comment access-gating (`modules/session/docs/BACKLOG_MVP.md`) — comparing how a
session's `SessionParticipant`-status gate would need to work led to checking how the equivalent
post/group-membership gate actually works today, surfacing this gap.

**Found:** `getGroupPosts(groupId, currentUserId, pageable)` (the *list* endpoint) correctly calls
`groupService.isGroupMember(groupId, currentUserId)` before returning anything. But every
**single-item** path only checks that the post exists (and is active) — never `visibility`, never
group membership:
- `getPostById(postId, currentUserId)` (`GET /api/posts/{postId}`) — `postRepository.findByIdAndIsActiveTrue(postId)` only.
- `getPostComments(postId, currentUserId, pageable)` (`GET /api/posts/{postId}/comments`) — same.
- `createComment`, `likeComment`, `unlikeComment` — `postRepository.existsById(postId)` only.

**Concretely:** a non-member of a private group who obtains a `postId` for one of that group's posts
(leaked link, guessed sequential id, cached from before they left the group) can currently read the
post itself, read every comment on it, post a new comment, and like/unlike it — despite having no
membership. The same applies to a `private`-visibility post outside any group: `visibility` is
stored but never checked on any of these single-item paths (separately from the already-documented
`friends`-visibility gap in `post-impl/CLAUDE.md`'s gotchas, which is a different, known limitation —
this one isn't currently documented anywhere).

**Fix approach:** add the same `groupService.isGroupMember` check `getGroupPosts` already uses to
each single-item path, gated on the fetched post's own `groupId` (skip the check when `groupId` is
null — a non-group post). For `visibility='private'`, restrict reads to the post's own `userId`
(`friends` stays unenforced, matching the existing documented limitation — not this ticket's problem
to solve). Likely lands as one shared private helper (e.g. `requirePostVisible(Post, UUID
currentUserId)`) called from all five methods above, rather than five separate inline checks.

**Out of scope:** implementing the `friends`-visibility graph itself (pre-existing, separately
documented limitation); any change to `getGroupPosts`/`getFeed` (already correct); anything in
`modules/session` (SESSION-10 does not reuse this service — see its own design notes on why).

**Tests:** non-member of a private group gets `BadRequestException`/403-equivalent (match this
module's existing 400-not-403 convention) from `getPostById`/`getPostComments`/`createComment`/
`likeComment`/`unlikeComment` on that group's post; a member still succeeds on all five (regression
guard); a `public`/non-group post is unaffected for any caller.

---

### A15 · Drop DB-level FKs on post-impl tables' cross-domain columns
**Status:** `TODO` · **Type:** Enhancement (Architecture) · **Filed:** 2026-08-10, as part of a
repo-wide sweep for cross-domain DB-level FKs, following on from this same module's original A13
(`posts.sport_id`) — A13 was scoped narrowly to the one `sport_id` anomaly found while explaining
sport-relationship tables to the user; this sweep found `posts.sport_id` wasn't the only
cross-domain FK left in this module, just the only `sport_id` one. **A13 has since been merged
into this ticket** (2026-08-10, user decision — the two migrations would touch the same tables in
the same way, no reason to ship them separately) and no longer exists as a standalone entry in
this backlog; everything A13 covered is folded into the list and fix approach below.

**Found:** seven `post-impl`-owned columns carry a real Postgres FK across into a different
domain's table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `posts.sport_id` → `posts_sport_id_fkey` (into `sport-impl`'s `sports`, `ON DELETE SET NULL` —
  absorbed from A13)
- `posts.user_id` → `posts_user_id_fkey` (into `user-impl`'s `users`, `ON DELETE CASCADE`)
- `posts.group_id` → `posts_group_id_fkey` (into `group-impl`'s `groups`, `ON DELETE CASCADE`)
- `comments.user_id` → `comments_user_id_fkey` (`ON DELETE CASCADE`)
- `comment_likes.user_id` → `comment_likes_user_id_fkey` (`ON DELETE CASCADE`)
- `post_likes.user_id` → `post_likes_user_id_fkey` (`ON DELETE CASCADE`)
- `post_shares.user_id` → `post_shares_user_id_fkey` (`ON DELETE CASCADE`)

All predate root `CLAUDE.md`'s "cross-domain references use IDs only" rule (added 2026-07-07) —
`posts`/`comments`/`comment_likes`/`post_likes`/`post_shares` (`V004`) are part of this repo's
initial commit (2026-03-03), confirmed via `git log` (`16a7cd4`). Every *other* cross-domain
`sport_id` column added since — `groups.sport_id`, `locations.sport_id`, `sessions.sport_id` — is
correctly FK-free from day one; `posts.sport_id`'s FK is the one exception, ~4 months older than
the rule and never retrofitted (Liquibase migrations are append-only). Every one of these seven
columns is already a plain `UUID`/`Long` field in its JPA entity, no `@ManyToOne` — the
application layer already complies; only the schema constraint doesn't. Same "predates
`CLAUDE.md`, never retrofitted" story as this module's own A5.

**`post_reports` deliberately excluded:** its two `user_id`-referencing columns
(`reporter_id`/`reviewed_by`) have the exact same cross-domain FK shape, but confirmed via a
repo-wide grep that **no `PostReport` JPA entity, repository, service, or controller exists
anywhere** — `V005__create_social_tables.sql` created the table but it was never wired up, same
"schema exists, no code owns it" pattern as `notifications`/`social_accounts`/`user_blocks`/
`user_sessions` (found in the same sweep, flagged separately, not part of any per-domain ticket
since no domain module actually implements them). Dropping a dead table's FK isn't a "post-impl
architecture" fix in the same sense as the seven above — leave it for whoever decides what to do
with the four other orphaned tables, rather than silently folding it into this module's ticket.

**Why it matters:** a DB-level FK is a hard coupling at the schema level, working against this
repo's "monolith-first, microservice-ready" goal — each of these locks `post-impl`'s tables to
`sport-impl`, `user-impl`, or `group-impl` staying in the same database/schema. Low urgency
(nothing is currently broken; the cascades largely mirror what the service layer would do anyway
on a hard delete, and `posts.sport_id`'s `ON DELETE SET NULL` is benign) but blocks a clean
extraction of any of these domains later unless dropped first.

**Fix approach:**
```sql
ALTER TABLE posts DROP CONSTRAINT posts_sport_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_user_id_fkey;
ALTER TABLE posts DROP CONSTRAINT posts_group_id_fkey;
ALTER TABLE comments DROP CONSTRAINT comments_user_id_fkey;
ALTER TABLE comment_likes DROP CONSTRAINT comment_likes_user_id_fkey;
ALTER TABLE post_likes DROP CONSTRAINT post_likes_user_id_fkey;
ALTER TABLE post_shares DROP CONSTRAINT post_shares_user_id_fkey;
```
Confirm every constraint name via `\d <table>` before writing the migration — Postgres
auto-generates these names conventionally, not guaranteed. One Liquibase changeset (next
sequential `Vxxx` file, registered in `db.changelog-master.xml`) covering all seven. No
entity/service/DTO change — purely schema-level.

**Verify before/after:** confirm no code path relies on any of these `ON DELETE CASCADE`/
`SET NULL` behaviors specifically (vs. the service layer's own explicit delete/cleanup logic) —
`posts.user_id`/`comments.user_id`/etc. cascading away on a hard user-delete is plausible but
unconfirmed; grep `UserServiceImpl` for a hard-delete-user path before assuming the cascade is
redundant. `posts.group_id` cascading on group hard-delete is more clearly redundant —
`GroupServiceImpl.deleteGroup` already exists and its own behavior toward member posts should be
checked directly rather than assumed to match the DB cascade. `posts.sport_id`'s `SET NULL`:
`SportServiceImpl.deleteSport()` never hard-deletes a row (soft-delete via `is_active`), so this
cascade has likely never fired in practice — grep for any test or migration that hard-deletes a
`sports` row before assuming it's dead code.

**Out of scope:** any same-domain (intra `post-impl`) FK, e.g. `comments.post_id`,
`comment_likes.comment_id`, `post_hashtags.post_id`/`hashtag_id`, `post_media.post_id`,
`post_reports.post_id`, `post_shares.post_id` — all correctly scoped, nothing to remove; any
change to any JPA entity, service, or repository in this module.

---
