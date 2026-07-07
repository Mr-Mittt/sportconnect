# B2 · Personalized Main Feed

**Status:** DONE  
**Date:** 2026-07-01

## What was built

Replaced the unauthenticated public feed (`GET /api/posts/feed`) with an authenticated, personalized feed. The feed now returns a ranked mix of the caller's own posts, their friends' USER_FEED posts, and GROUP_POSTs from groups that match their sport profiles — all ordered by `last_interaction_at DESC`.

## Key decisions

- **`last_interaction_at` updated only on `createComment()`** — not on likes or deletes. A new comment is the only event that re-surfaces a post in the feed.
- **Empty-list sentinel values** — JPQL `IN ()` is invalid SQL. Empty `friendIds`/`groupIds` lists are replaced with `[UUID(0,0)]` / `[-1L]` at the service layer before calling the repository query. These sentinel values will never match a real record.
- **`getGroupIdsBySportProfiles()` in `GroupServiceImpl`** — uses existing `userSportProfileService.getUserProfiles()` to get sport IDs, then a new JPQL query joining `GroupMember` and `Group` to find the caller's sport-matched groups. `groupRepository.findGroupIdsByUserAndSportIds()` was added for this.
- **`UserFriendService` injected into `PostServiceImpl`** — cross-domain through the `user-api` interface only; `user-api` added as an explicit Gradle dependency alongside the pre-existing `user-impl` dep.
- **Unauthenticated callers get 401** — `@PreAuthorize("hasRole('USER')")` on the controller endpoint; no fallback to a public feed.
- **Default pageable sort changed** to `lastInteractionAt DESC` in the controller.

## Files created or modified

- `server/src/main/resources/db/changelog/changes/V020__add_last_interaction_at_to_posts.sql` — new migration
- `server/src/main/resources/db/changelog/db.changelog-master.xml` — registered V020
- `modules/social/post-impl/src/main/java/com/sportconnect/social/post/entity/Post.java` — added `lastInteractionAt` field
- `modules/social/group-api/src/main/java/com/sportconnect/group/api/service/GroupService.java` — added `getGroupIdsBySportProfiles()`
- `modules/social/group-impl/src/main/java/com/sportconnect/group/repository/GroupRepository.java` — added `findGroupIdsByUserAndSportIds()`
- `modules/social/group-impl/src/main/java/com/sportconnect/group/service/GroupServiceImpl.java` — implemented `getGroupIdsBySportProfiles()`
- `modules/social/post-api/src/main/java/com/sportconnect/social/post/api/service/PostService.java` — renamed `getPublicFeed()` → `getPersonalizedFeed()`
- `modules/social/post-impl/src/main/java/com/sportconnect/social/post/repository/PostRepository.java` — added `findPersonalizedFeed()` and `updateLastInteractionAt()`
- `modules/social/post-impl/src/main/java/com/sportconnect/social/post/service/PostServiceImpl.java` — implemented `getPersonalizedFeed()`, injected `UserFriendService`
- `modules/social/post-impl/src/main/java/com/sportconnect/social/post/service/CommentServiceImpl.java` — `createComment()` now calls `updateLastInteractionAt()`
- `modules/social/post-impl/src/main/java/com/sportconnect/social/post/controller/PostController.java` — feed endpoint requires auth, uses `@AuthenticationPrincipal`
- `modules/social/post-impl/build.gradle` — added explicit `user-api` dependency
- `modules/social/post-impl/src/test/groovy/com/sportconnect/social/post/service/PostServiceImplSpec.groovy` — replaced `getPublicFeed` test with 4 `getPersonalizedFeed` tests
