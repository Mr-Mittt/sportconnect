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

## Delta — added real IT coverage (post-merge, same session)

The first pass shipped with unit-only coverage: `PostGateSpec` (mocked `GroupService`/
`UserFriendService`) tests the gate's branch logic in isolation, and the updated
`PostServiceImplSpec`/`CommentServiceImplSpec` mock `PostGate` itself — they prove each service
method *calls* the gate correctly, not that the gate actually rejects/accepts over a real HTTP
request with real Spring wiring. Asked directly whether this ticket had IT coverage; it didn't, so
added `server/src/test/java/com/sportconnect/integration/PostAccessGateIntegrationTest.java` — 19
cases, one `MockMvc` HTTP call per case, through real `PostController`/`PostServiceImpl`/
`CommentServiceImpl`/`PostGate`/`GroupServiceImpl`/`UserFriendServiceImpl` beans and a real H2
round trip. Covers, for each of the 7 gated methods where applicable: non-member of a
`GROUP_POST`'s group → 403, group member → 200/201; non-owner of a `private` post → 403, owner →
200; non-friend of a `friends` post → 403, accepted friend → 200; a soft-deleted post → 404; a post
whose group is itself soft-deleted (B18) → 404 even for the former owner; a non-existent comment on
`unlikeComment` → 404 (previously uncovered anywhere).

Fixtures are inserted directly via `GroupRepository`/`GroupMemberRepository`/`FriendshipRepository`
rather than through `GroupService.addMember` (friendship + invitation-acceptance round trip, B9) or
the friend-request flow — this class tests `PostGate`'s read of that state, not the group/
friendship write paths, which have their own coverage.

**Test-schema gaps this surfaced and fixed** (`server/src/test/resources/schema.sql`, H2, used by
every `:server:test` run — real Postgres migrations were already correct, only the hand-maintained
test mirror had drifted):
- `groups` was missing the five `recurrence_*` columns `GROUP-RECUR-1` (V033/V036) added to the
  `Group` entity — any `@SpringBootTest` persisting a real `Group` row failed outright. Nothing
  had exercised this before since existing group IT tests (`GroupControllerTest`) mock
  `GroupService` entirely rather than touching the DB.
- `comment_likes` had no table at all — only `post_likes` existed. Nothing had exercised
  `likeComment`/`unlikeComment` against a real DB before this ticket.
- `friendships` didn't exist either — nothing had exercised `UserFriendService.areFriends` for
  real in this test profile before. Added mirroring the real `V019` migration (two-row-per-pair
  shape).

None of these are new gaps — they're pre-existing holes in the test-only schema mirror that
happened to never be hit because nothing had previously written a real end-to-end test touching
group persistence, comment likes, or friendships. Fixing them here is a one-time schema catch-up,
not new production risk.

## Verification

- `./gradlew :modules:social:post-impl:test` — green.
- `./gradlew :server:test` — green, including `PostControllerIntegrationTest.shouldCreatePost`,
  `shouldReturnPostsByHashtagWithoutThrowing`, and all 19 new `PostAccessGateIntegrationTest`
  cases, against a real Spring context + real H2 DB + Redis.
- N+1 check: `PostGate`'s cross-domain calls (`isGroupActive`, `isGroupMember`, `areFriends`) only
  run on these single-item paths, never inside a `.map()`/loop over a `Page`/`List` — no new N+1
  introduced. Per-request round-trip cost is accepted at MVP scale per the ADR's open
  questions (§8) — a future caching concern for `group-impl`/`user-impl`'s own `-api`
  implementations if it ever becomes a bottleneck, not something `PostGate` itself should own.

---

**Status:** `DONE` (2026-08-12) · **Summary:**
`modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md`
**Type:** Bug Fix (Security) · **Filed:** 2026-08-08, found while designing
`SESSION-10`'s comment access-gating (`modules/session/docs/BACKLOG_MVP.md`) — comparing how a
session's `SessionParticipant`-status gate would need to work led to checking how the equivalent
post/group-membership gate actually works today, surfacing this gap. **Redesigned 2026-08-11**
against `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` — read the ADR before implementing; this
entry is a summary, not the full design record.

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

**Fix approach — implement `ResourceGate<Post>` (`common`'s C2), don't hand-roll another inline
check:**
```java
class PostGate implements ResourceGate<Post> {
    private final GroupService groupService; // group-api — post-impl already depends on it

    public boolean isAvailable(Post post) {
        if (!post.getIsActive()) return false;
        return post.getGroupId() == null || groupService.isGroupActive(post.getGroupId()); // B18
    }

    public boolean isVisibleTo(Post post, UUID viewerId) {
        return switch (post.getPostType()) {
            case USER_FEED -> isOwnerOrPublicOrFriend(post, viewerId); // 'friends' stays unenforced, see below
            case GROUP_POST, GROUP_BROADCAST, GROUP_SYSTEM -> groupService.isGroupMember(post.getGroupId(), viewerId);
        };
    }
}
```
Called from all five methods above via `postGate.require(post, currentUserId, "Post not found",
"You don't have access to this post")` — one call site per method, not five separate inline checks.
`isAvailable` also closes a related, previously undocumented gap: a post in a since-deactivated
group currently stays reachable via these same paths (see `group-impl`'s **B18**, filed alongside
this redesign — `PostGate.isAvailable` depends on B18's new `GroupService.isGroupActive()` method,
so land B18 first).

**`ForbiddenException`, not `BadRequestException`:** `ResourceGate.require()` standardizes on
`ForbiddenException` for "available but not visible" — this ticket's own denial cases move off the
`BadRequestException` this module used inconsistently elsewhere (see ADR §5.2); existing call sites
outside this ticket's five methods are not required to migrate in the same pass.

**Out of scope:** implementing the `friends`-visibility graph itself (pre-existing, separately
documented limitation — `isOwnerOrPublicOrFriend` above still treats `friends` as private, matching
current behavior, not a new gap); any change to `getGroupPosts`/`getFeed` (already correct, keeps
gating the known scope before querying rather than routing through `PostGate`); anything in
`modules/session` (`SESSION-10` implements its own `SessionGate` against the same `ResourceGate<T>`
shape, no shared logic — see the ADR §7 for why a session's discussion thread is not a reused
`Post`).

**Tests:** non-member of a private group gets `ForbiddenException` (403-equivalent — see above, this
is a change from the ticket's original 400-convention note) from `getPostById`/`getPostComments`/
`createComment`/`likeComment`/`unlikeComment` on that group's post; a member still succeeds on all
five (regression guard); a `public`/non-group post is unaffected for any caller; a post whose group
has been soft-deleted (B18) now 404s via `isAvailable` instead of remaining reachable.

**Resolution (2026-08-12):** implemented exactly as designed above — `PostGate`
(`com.sportconnect.social.post.access`) implements `ResourceGate<Post>`, applied to all 5 methods.
Two deltas beyond this entry's own text, both confirmed with the user before implementing: (1)
`likeComment`/`unlikeComment` also gate the comment's own availability (new
`CommentRepository.findByIdAndIsActiveTrue`) before the parent-post `PostGate` check — closes a
gap this entry didn't call out, where a comment on an unavailable/invisible post stayed likeable,
and where `unlikeComment` had no comment-existence check at all; (2) `friends`-visibility is now
genuinely enforced (`UserFriendService.areFriends`), not left deferred as this entry's "out of
scope" originally said — the dependency already existed with zero new coupling, so the user chose
to close it in the same pass rather than file a follow-up; (3) `PostServiceImpl.likePost`/
`unlikePost` — never named anywhere in this entry or the ADR — turned out to have the identical
unguarded pattern (`likePost` checked existence only, `unlikePost` checked nothing at all about
the post). Spotted after the initial pass shipped; the user asked to fix it in the same branch
rather than file a separate ticket. Actual shipped scope is 7 single-item paths, not the 5
originally named. (4) the first pass had unit-only coverage (mocked `PostGate`/`GroupService`/
`UserFriendService`) — asked whether IT coverage existed, it didn't, so added a 19-case real-HTTP
`PostAccessGateIntegrationTest`, which in turn surfaced and fixed three pre-existing gaps in
`server/src/test/resources/schema.sql` (missing `groups.recurrence_*` columns, missing
`comment_likes` table, missing `friendships` table — none previously exercised by any IT test).
Full detail: `modules/social/post-impl/docs/MVP/A14_POST_RESOURCE_GATE.md`.

---
