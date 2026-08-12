# A14 · Enforce post visibility/group-membership on single-item paths

**Status:** `DONE` (2026-08-12)
**Type:** Bug Fix (Security)
**Design record:** `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md`

## Problem

`getGroupPosts` (the list endpoint) already gated on `groupService.isGroupMember` before
returning anything. Every single-item path only checked the post existed and was active — never
`visibility`, never group membership:

- `getPostById` (`GET /api/posts/{postId}`)
- `getPostComments` (`GET /api/posts/{postId}/comments`)
- `createComment` (`POST /api/posts/{postId}/comments`)
- `likeComment` / `unlikeComment` (`POST`/`DELETE /api/posts/comments/{commentId}/like`)

A non-member of a private group with a `postId` (leaked link, guessed id, cached from before
they left) could read the post, read/post comments, and like/unlike it. A `private`-visibility
`USER_FEED` post had the identical gap. `unlikeComment` additionally had **no existence check at
all** — not even for the comment itself. (`PostServiceImpl.likePost`/`unlikePost` turned out to
have the same gap too, just not caught by the original audit — see delta below.)

## Design (as approved)

Implemented the ADR's `ResourceGate<Post>` (`common`'s `ResourceGate<T>`, already shipped as a
prior ticket) via a new `PostGate` in `post-impl`:

- **`isAvailable(post)`** — not soft-deleted, and (if group-scoped) the parent group is still
  active (`groupService.isGroupActive`, B18). Checked explicitly rather than relying on
  `isGroupMember`'s own internal active-group check, so an inactive group's post 404s
  ("doesn't exist") instead of 403ing ("exists but you can't see it").
- **`isVisibleTo(post, viewerId)`** — a `switch` on `postType`: `USER_FEED` → owner, or
  `visibility == 'public'`, or (`visibility == 'friends'` and
  `userFriendService.areFriends(owner, viewer)`); `GROUP_POST`/`GROUP_BROADCAST`/`GROUP_SYSTEM` →
  `groupService.isGroupMember`. An unauthenticated (`null`) viewer never passes the group branch
  and only passes the `USER_FEED` branch for `public` posts.

All five call sites now fetch the entity by plain `findById` and call
`postGate.require(entity, viewerId, "...not found", "...not visible")`, which throws
`NotFoundException` or `ForbiddenException` in that fixed order. This replaces the ad hoc
`findByIdAndIsActiveTrue`/`existsById` checks that used to guard each method individually.

## Delta — likePost/unlikePost were never in the original scope

Neither this backlog entry (filed 2026-08-08) nor the ADR (written 2026-08-10) ever mention
`PostServiceImpl.likePost`/`unlikePost` — only `getPostById`, `getPostComments`, `createComment`,
`likeComment`, `unlikeComment` were audited when the gap was first found. Spotted after the
initial implementation landed: `likePost`/`unlikePost` have the identical unguarded pattern
(`likePost` only checked `postRepository.existsById(postId)` — no `isActive`, no visibility, no
group membership; `unlikePost` had **no post-existence check at all**, only
`postLikeRepository.existsByPostIdAndUserId`). Same bug class, just never in the original
audit's list. Fixed in the same pass, same pattern as the other five:

```java
public void likePost(Long postId, UUID userId) {
    postGate.require(postRepository.findById(postId).orElse(null), userId,
            "Post not found", "You don't have access to this post");
    ...
}
```

This makes the actual shipped scope **7** single-item paths, not the 5 originally named.

## Delta from the ADR's original text — comment-level gating

The ADR's `PostGate` example only mentions post-level checks. During scoping, the user explicitly
asked for `likeComment`/`unlikeComment` to gate on **both** the comment's own availability and the
parent post's `PostGate` result, not the post alone:

```java
Comment comment = commentRepository.findByIdAndIsActiveTrue(commentId)
        .orElseThrow(() -> new NotFoundException("Comment not found"));
postGate.require(postRepository.findById(comment.getPostId()).orElse(null), userId,
        "Post not found", "You don't have access to this post");
```

This closes two gaps beyond the ADR's original framing:
- A comment on a since-soft-deleted (or now-invisible-to-this-viewer) post was previously still
  likeable/unlikeable — `likeComment`/`unlikeComment` never looked at the parent post at all.
- `unlikeComment` had zero existence check on the comment itself before this ticket; it now 404s
  correctly (`CommentRepository.findByIdAndIsActiveTrue`, new repository method) for a
  missing/soft-deleted comment before even reaching the like/unlike logic.

## Delta — real `friends`-visibility enforcement, not deferred

The ADR listed the `friends`-visibility graph as explicitly out of scope ("pre-existing,
separately documented limitation"). Since B1's `UserFriendService.areFriends(UUID, UUID)` already
existed with zero new dependency needed, the user decided to close this gap in the same pass
rather than filing a follow-up. `post-impl/CLAUDE.md`'s gotcha is updated accordingly — `friends`
visibility is now real on the single-item paths this ticket covers, but list endpoints (the
personalized feed, etc.) still don't select on it, so a `friends` post is only reachable by
direct link/id, never surfaced in a feed.

## What changed

- **New:** `com.sportconnect.social.post.access.PostGate` (`post-impl`), implements `ResourceGate<Post>`
  from `common`. Depends on `GroupService` and `UserFriendService`, both pre-existing `post-impl`
  dependencies — no Gradle change.
- **`CommentRepository`:** added `Optional<Comment> findByIdAndIsActiveTrue(Long id)`.
- **`PostServiceImpl`:** `getPostById`, `likePost`, `unlikePost` now gated via `PostGate` (the
  latter two added after the initial pass — see delta above).
- **`CommentServiceImpl`:** `getPostComments`, `createComment` gated via `PostGate` on the parent
  post; `likeComment`, `unlikeComment` gated on comment availability + parent-post `PostGate`.
- **Exceptions:** all five call sites now throw `ForbiddenException` (not `BadRequestException`)
  for "exists but you can't see it" — consistent with the ADR's §5.2 convention. Existing
  `BadRequestException` call sites elsewhere in this module (A2's owner/moderator checks, etc.)
  are untouched, per the ADR's "opportunistic migration" note.

## Out of scope (unchanged from the ADR)

- `getGroupPosts`/feed endpoints — already correct, gate before querying, not touched.
- `friends`-visibility in list/feed queries — still not selected on; see delta above.
- `session-impl`'s `SessionGate` (`SESSION-10`) — separate ticket, same `ResourceGate<T>` shape,
  no shared logic.

## Tests

- **New:** `PostGateSpec` — direct unit coverage of `isAvailable`/`isVisibleTo` for every
  `PostType`/`visibility` combination, including unauthenticated-viewer edge cases.
- **Updated:** `PostServiceImplSpec` (`getPostById`, `likePost`, `unlikePost`) and
  `CommentServiceImplSpec` (`getPostComments`, `createComment`, `likeComment`, `unlikeComment`) —
  swapped mocked repository calls to match the new fetch-then-gate shape (`PostGate` mocked as a
  collaborator, not re-exercised — its own logic is covered by `PostGateSpec`), added
  `ForbiddenException` cases for all seven methods, added `NotFoundException` cases for
  `unlikeComment`'s and `unlikePost`'s previously-uncovered existence checks.

## Verification

- `./gradlew :modules:social:post-impl:test` — green.
- `./gradlew :server:test` — green, including `PostControllerIntegrationTest.shouldCreatePost`
  and `shouldReturnPostsByHashtagWithoutThrowing` against a real Spring context + Redis.
- N+1 check: `PostGate`'s cross-domain calls (`isGroupActive`, `isGroupMember`, `areFriends`) only
  run on these five single-item paths, never inside a `.map()`/loop over a `Page`/`List` — no new
  N+1 introduced. Per-request round-trip cost is accepted at MVP scale per the ADR's open
  questions (§8) — a future caching concern for `group-impl`/`user-impl`'s own `-api`
  implementations if it ever becomes a bottleneck, not something `PostGate` itself should own.
