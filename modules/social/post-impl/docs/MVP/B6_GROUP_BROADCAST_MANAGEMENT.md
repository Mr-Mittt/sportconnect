# B6 · GROUP_BROADCAST Management

**Status:** DONE
**Module:** `modules/social/post-impl` + `modules/social/post-api`
**Date:** 2026-07-01

## What was built

A group can now run exactly one active `GROUP_BROADCAST` post at a time, auto-expiring after a
configurable duration (default 24h), visible in a dedicated section separate from the main feed.

- **One active broadcast per group**: `PostServiceImpl.createPost()` calls the new
  `PostRepository.existsActiveGroupBroadcast(groupId)` query before creating a `GROUP_BROADCAST`
  post; a second concurrent broadcast is rejected with `BadRequestException`.
- **`broadcastEndTime`**: new nullable `LocalDateTime` column on `posts` (migration `V023`). Defaults
  to `now() + 24h` when the client omits it; both on create and on the new extend-end-time endpoint,
  the value must be strictly after `now()` or the request is rejected.
- **Broadcast content edits**: `updatePost()` previously allowed only the original creator to edit
  content. For `GROUP_BROADCAST` specifically, group owner/admin can now also edit the content
  (moderator-override branch, mirroring the existing `deletePost()` permission pattern). This override
  is scoped strictly to `GROUP_BROADCAST` — `USER_FEED`/`GROUP_POST` edits remain creator-only, and the
  check short-circuits before calling `GroupService` for those types.
- **New endpoints**:
  - `GET /api/posts/broadcast` — active (non-expired) broadcasts across the caller's sport-matched
    groups, via the existing `GroupService.getGroupIdsBySportProfiles()` (already used by the B2
    personalized feed).
  - `PATCH /api/posts/{postId}/broadcast-end-time` — group owner/admin only; extends/changes the
    broadcast's end time; body is `UpdateBroadcastEndTimeRequest { broadcastEndTime }`.
- Creation permission (only group owner/admin may create a `GROUP_BROADCAST`) already existed prior
  to this ticket and was not changed.

## Key decisions

- **Lazy expiry, no scheduled job** — both `existsActiveGroupBroadcast` and `findActiveBroadcasts`
  filter on `broadcast_end_time > CURRENT_TIMESTAMP` at query time. An expired broadcast simply stops
  appearing in results and stops blocking new broadcasts; `is_active` is not flipped automatically.
- **Composite partial index** (`idx_posts_broadcast_active` on `(group_id, broadcast_end_time)` where
  `post_type = 'GROUP_BROADCAST' AND is_active = true`) serves both new queries since they both filter
  by `group_id` first.
- **Empty group-list sentinel** — `getActiveBroadcasts()` reuses the same `[-1L]` sentinel pattern
  established in B2/B5 to keep the JPQL `IN` clause valid when the caller has no sport-matched groups.

## Non-obvious constraints

- No frontend work in this ticket (backend-only, matching the ticket's dependency graph — no
  associated F-ticket, unlike B2 → F1).
- No new `GroupService` methods were needed — `isGroupOwner`, `isGroupAdmin`, and
  `getGroupIdsBySportProfiles` already existed on the `group-api` interface and were already injected
  into `PostServiceImpl`.
- `chk_post_type` (added in migration `V016`) already allowed `GROUP_BROADCAST` — no constraint change
  needed in `V023`.

## Tests

17 new Spock cases added to `PostServiceImplSpec.groovy` (49 total in the file, all passing):
active-broadcast conflict, default/explicit/invalid `broadcastEndTime` on create, moderator-edit
permission (owner/admin/neither, plus a regression guard proving `GROUP_POST` edits stay
creator-only), `getActiveBroadcasts` (with and without sport-matched groups), and
`updateBroadcastEndTime` (owner/admin success, permission failure, past-time rejection, wrong
post-type rejection, not-found).

Run with: `./gradlew :modules:social:post-impl:test`

## Not verified in this session

No local Postgres/Redis instance was available, so the Liquibase migration and the new endpoints
were not exercised against a running server. Verify manually before considering this fully
production-ready:
1. `./gradlew :server:bootRun` — confirm `V023` applies cleanly.
2. Create a `GROUP_BROADCAST` as group owner, attempt a second one in the same group → 400.
3. `GET /api/posts/broadcast` as a user with a matching sport profile.
4. `PATCH /api/posts/{postId}/broadcast-end-time` with a future vs. past timestamp.

---

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
