# A7 · Fix N+1 in CommentServiceImpl.getPostComments

**Status:** DONE
**Module:** `modules/social/post-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation:

1. **`CommentRepository`** — new batch method (plain derived query, no `@Query` needed):
   ```java
   List<Comment> findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(List<Long> parentCommentIds);
   ```
2. **`CommentServiceImpl.mapToResponse`** signature changes to a pure function taking pre-resolved
   maps:
   ```java
   private CommentResponse mapToResponse(Comment comment, UUID currentUserId,
                                          Map<UUID, UserResponse> usersById,
                                          Map<Long, List<Comment>> repliesByParentId)
   ```
   - `userFullName` resolved from `usersById.get(comment.getUserId())` instead of
     `resolveUserFullName()`.
   - `replies` resolved from `repliesByParentId.getOrDefault(comment.getId(), List.of())`, still
     recursing into `mapToResponse` — but now over an **in-memory** list, no DB call per recursive
     step. Since A4 already enforces one-level nesting, a reply's own
     `repliesByParentId.get(replyId)` will always be empty, so recursion still naturally terminates
     after one level.
   - `likeCount`/`replyCount`/`isLikedByCurrentUser` stay exactly as-is (Redis-first / deliberate
     direct-DB, out of scope per the ticket).
3. **`getPostComments`** — fetch the root-comments page, then batch:
   - distinct root comment ids → one `findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(...)`
     call → group into `Map<Long, List<Comment>>` by `getParentCommentId()`
   - collect all user ids (root comments' + all fetched replies') → one
     `userService.getUsersByIds(...)` call → `Map<UUID, UserResponse>`
   - both guarded for empty input (`Map.of()`)
   - `.map(comment -> mapToResponse(comment, currentUserId, usersById, repliesByParentId))`
4. **`createComment`**'s single-item call site — reuses the same batched mapper with inline
   single-element inputs (matching A6/A7/A8's convention):
   `mapToResponse(comment, userId, userService.getUsersByIds(List.of(userId)), Map.of())` — a
   freshly created comment has no replies yet, so the replies map is trivially empty.
5. **Untouched**: `resolveUserFullName()` and `buildPreviewResponse()` — still used by
   `addToPreviewCache` for the single-comment Redis preview path, out of scope.
6. **Tests** — update `CommentServiceImplSpec` wherever `getPostComments` mocks
   `userService.getUserById`/the per-comment replies query to expect the new batched calls instead.

The implementation below matched this plan, with one adjustment: a pre-existing test's premise
broke as a direct consequence of step 4 and was rewritten rather than patched (see Key decisions).

## What was built

`CommentServiceImpl.mapToResponse` — called once per root comment (and recursively once per reply)
in `getPostComments` — did 2 unbatched things per comment: a cross-domain `userService.getUserById()`
call to resolve the author's name, and a fresh DB query to fetch that comment's direct replies.
Fixed by batching both at the page level:

- **New repository method** — `CommentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(List<Long>)`,
  a plain Spring Data derived query (no custom `@Query` needed) — fetches all direct replies for
  every root comment in the page in one call.
- **`mapToResponse` signature changed** to a pure function: `mapToResponse(Comment, UUID,
  Map<UUID, UserResponse> usersById, Map<Long, List<Comment>> repliesByParentId)`. No DB or
  cross-domain calls inside anymore for author/replies resolution — both come from pre-built maps.
- **Recursion still happens**, but now over the in-memory `repliesByParentId` map instead of a
  fresh query per level. It naturally terminates after one level: A4 (`DONE`) already enforces that
  a reply can never itself be replied to, so `repliesByParentId.get(replyId)` is always empty for a
  reply — confirmed by reading `createComment`'s validation before writing this ticket, not assumed.
- **`getPostComments`** now: fetches the root-comment page, collects root comment ids, batches the
  replies query once, collects **all** user ids (root comments' + every fetched reply's) into one
  `userService.getUsersByIds(...)` call, then maps the page using the two resulting maps. Both
  batch calls guarded for empty input (`Map.of()`).
- **`createComment`**'s single-item call site reuses the same mapper with inline single-element
  input: `mapToResponse(comment, userId, userService.getUsersByIds(List.of(userId)), Map.of())` — a
  freshly created comment can never have replies yet, so the replies map is trivially empty (no
  query needed at all, not even a single-item one).

## Key decisions

- **A prior test's premise no longer holds, and was rewritten rather than patched.**
  `"mapToResponse should include nested replies"` exercised the recursive-reply-rendering logic via
  `createComment` — mocking a freshly-created comment as if it already had a reply. That was only
  ever a testing artifact (a comment can't realistically have replies at the moment of its own
  creation); with `createComment` now passing `Map.of()` for replies by design, the artifact no
  longer works. Rewrote it as `"getPostComments should include nested replies, batched not
  per-comment"`, testing the same rendering logic through its real code path instead.
- **`likeCount`/`replyCount`/`isLikedByCurrentUser` untouched** — same finding as A6: the first two
  already go through the Redis-first `getCount()` helper (B3/B4), the third is a deliberate direct
  DB point lookup. Not part of this fix.
- **`resolveUserFullName()`/`buildPreviewResponse()` untouched** — still used by `addToPreviewCache`
  for the single-comment Redis preview-cache path (unrelated to the paginated `getPostComments`
  flow this ticket fixes).

## Non-obvious constraints

- No change to what data is displayed — same fields, same values, same `"Unknown User"` fallback
  (now triggered by a missing entry in the `getUsersByIds` map instead of a caught
  `ResourceNotFoundException`, since `getUsersByIds` never throws — same terminal behavior).
- Recursion depth is bounded by A4's business rule (one-level nesting), not by anything added in
  this ticket — worth knowing if that rule ever changes, since deeper nesting would need the
  replies-map to itself be resolved recursively/iteratively rather than in one flat query.

## Tests

Updated `CommentServiceImplSpec.groovy`:
- `createComment` tests: mock shifted from `userService.getUserById` (mapToResponse's share) to
  `userService.getUsersByIds([userId])`; `buildPreviewResponse`'s `getUserById` call is unchanged.
  Added explicit `0 *` assertions confirming the replies repository methods are never called for
  single-item creation.
- `getPostComments` tests (3): mock shifted from per-comment `getUserById` +
  `findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc` to the batched
  `getUsersByIds`/`findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc`.
- `"getPostComments falls back to Unknown User..."`: mock changed from a throwing `getUserById` to
  `getUsersByIds` returning an empty map (`[:]`) — matches `getUsersByIds`'s real never-throws
  contract instead of simulating an exception path that no longer exists.
- Rewrote the nested-replies test to go through `getPostComments` (see Key decisions above).

Run: `./gradlew :modules:social:post-impl:test` — all pass. `./gradlew
:modules:social:post-impl:compileJava` succeeds. `:server:bootRun` reaches the expected
local-Postgres connection failure (no local Postgres in this sandbox) before Spring Data would
parse the new derived query — same environmental limitation as A6/group-impl's A7/A8. Confidence in
`findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc`'s correctness is high: it's a plain
Spring Data method-name-derived query (no custom JPQL), the simplest and least error-prone kind of
query Spring Data supports — recommend a real Postgres run before merging to confirm regardless.
