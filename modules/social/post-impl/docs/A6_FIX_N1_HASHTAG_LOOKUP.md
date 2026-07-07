# A6 · Fix N+1 hashtag lookup in feed mappers

**Status:** DONE
**Module:** `modules/social/post-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation:

1. **`PostHashtagRepository`** — new batch query:
   ```java
   @Query("SELECT ph.post.id, ph.hashtag.tag FROM PostHashtag ph WHERE ph.post.id IN :postIds")
   List<Object[]> findTagsByPostIds(@Param("postIds") List<Long> postIds);
   ```
2. **`HashtagService`** (api) — new method: `Map<Long, List<String>> getTagsForPosts(List<Long> postIds)`.
3. **`HashtagServiceImpl`** — implement via `Collectors.groupingBy` on the batch query's
   `(postId, tag)` rows, guarded for empty input (`Map.of()`). Existing single-item
   `getTagsForPost(Long)` stays untouched (still tested, still used for single-item call sites).
4. **`PostServiceImpl.mapToResponse`** — signature gains one parameter:
   `mapToResponse(Post post, UUID currentUserId, List<String> hashtags)` — the mapper takes the
   already-resolved tag list directly (not a `Map`), so there's no duplicated mapper body between
   single-item and paginated cases:
   - 4 single-item call sites (`createPost`, `getPostById`, `updatePost`,
     `updateBroadcastEndTime`): pass `hashtagService.getTagsForPost(post.getId())` directly —
     unchanged behavior, still one call each.
   - 5 paginated methods (`getUserPosts`, `getPersonalizedFeed`, `getGroupPosts`,
     `getPostsByHashtag`, `getActiveBroadcasts`): each collects distinct post ids from
     `page.getContent()`, calls `hashtagService.getTagsForPosts(postIds)` once (guarded for empty),
     then `.map(post -> mapToResponse(post, currentUserId, hashtagsByPostId.getOrDefault(post.getId(), List.of())))`.
5. **Tests** — update `PostServiceImplSpec` wherever the 5 paginated methods mock
   `hashtagService.getTagsForPost(_)` to instead mock `getTagsForPosts(_)`; add a case for
   `HashtagServiceImplSpec` covering the new batch method (multiple posts, some with no tags).

**Divergence from the plan:** step 4's "each collects distinct post ids... calls...once" was factored
into one shared private helper, `getHashtagsForPage(Page<Post>)`, during implementation rather than
being repeated inline in all 5 methods — not called out explicitly in the original design, but a
natural refinement since all 5 methods needed the identical 3-line pattern. No other divergence.

## What was built

`PostServiceImpl.mapToResponse` — shared by all 5 paginated feed methods (`getUserPosts`,
`getPersonalizedFeed`, `getGroupPosts`, `getPostsByHashtag`, `getActiveBroadcasts`) — called
`hashtagService.getTagsForPost(post.getId())` once per post in the page, an unbatched DB query per
item. Fixed by adding a batch path:

- **New repository query** — `PostHashtagRepository.findTagsByPostIds(List<Long> postIds)`:
  `SELECT ph.post.id, ph.hashtag.tag FROM PostHashtag ph WHERE ph.post.id IN :postIds`, returning
  `(postId, tag)` pairs for the whole page in one query.
- **New service method** — `HashtagService.getTagsForPosts(List<Long>)` → `Map<Long, List<String>>`
  (api), implemented via `Collectors.groupingBy` over the batch query's rows, guarded for empty
  input (`Map.of()`, no query).
- **`mapToResponse` signature changed** to take an already-resolved `List<String> hashtags`
  parameter directly (not a `Map`) — avoids duplicating the ~35-line mapper body across a
  single-item vs. batched overload; only the *resolution* of that one field differs by call site.
- **New private helper `getHashtagsForPage(Page<Post>)`** — collects distinct post ids from the
  page, calls the batch method once, shared by all 5 paginated methods.
- **4 single-item call sites** (`createPost`, `getPostById`, `updatePost`,
  `updateBroadcastEndTime`) — unchanged behavior, still call `hashtagService.getTagsForPost(id)`
  directly and pass the result straight into `mapToResponse`.

Net effect: hashtag resolution for a page of N posts goes from N queries to 1.

## Key decisions

- **Scope corrected from the initial N+1 audit.** The audit's first pass flagged `likeCount`,
  `commentCount`, and `isLikedByCurrentUser` as per-item DB calls too. Verified directly against
  the code before ticketing: `likeCount`/`commentCount` already go through `getCount()`, a
  Redis-first helper added by B3/B4 (DB is only a cache-miss fallback); `isLikedByCurrentUser` is a
  deliberate direct-DB point lookup per B3's own documented note ("indexed point lookup, cheap
  enough"). None of those three were touched here — the hashtag lookup was the one genuinely
  unaddressed gap.
- **Single mapper signature, not two overloads.** Considered giving the batched call sites a
  `Map<Long, List<String>>`-based overload (mirroring group-impl's A7/A8 mappers, which do take the
  whole map). Instead, `mapToResponse` takes a plain `List<String>` — the caller (single-item or
  batched) resolves that one value before calling, avoiding a near-duplicate ~35-line mapper body
  for a one-field difference.
- **User-confirmed: batched SQL query over per-post Redis cache.** Both approaches would fix the
  N+1; a Redis-per-post cache (matching the existing `getCount()`/preview-comments style) was
  considered and would have been safe (hashtags are immutable post-creation — only set once via
  `extractAndSaveHashtags`, only cleared via `decrementHashtagsForPost` on delete, no update path to
  invalidate). Chose the batched-SQL approach instead: true O(1) query count regardless of page
  size, no new Redis keys/invalidation to reason about, matches the group-module A7/A8 convention.

## Non-obvious constraints

- No change to what data is displayed — same `hashtags` field, same values, same empty-list default
  for posts with no hashtags.
- The existing single-item `getTagsForPost(Long)` method and its test were left untouched — still
  used by the 4 non-paginated call sites and by any other future single-post consumer.

## Tests

- `HashtagServiceImplSpec`: 2 new tests for `getTagsForPosts` — groups tags by post id and omits
  posts with none; returns an empty map without querying when given an empty id list.
- `PostServiceImplSpec`: added a loose `hashtagService.getTagsForPosts(_) >> [:]` default stub in
  `setup()` (alongside the existing `getTagsForPost(_) >> []`) — no paginated-method test needed a
  per-test hashtag stub, so no existing test assertions changed.

Run: `./gradlew :modules:social:post-impl:test` — all pass (including the 2 new cases).
`./gradlew :modules:social:post-impl:compileJava` and `:modules:social:post-api:compileJava`
succeed. `:server:bootRun` reaches the expected local-Postgres connection failure (no local Postgres
running in this sandbox) — the same environmental limitation noted in group-impl's A7/A8, so the new
JPQL (`findTagsByPostIds`) couldn't be validated against a live Hibernate instance here. Confidence
comes from it being structurally identical to the existing, already-proven `findTagsByPostId` (same
`FROM PostHashtag ph WHERE ph.post.id ...` shape, just `IN` instead of `=` and selecting `ph.post.id`
alongside the tag) — recommend a real Postgres run before merging to confirm.
