# SESSION-10 — Session Post (comment-thread anchor, one-way reuse of post-impl)

**Status:** DONE (2026-08-12)
**Type:** New Feature (cross-module — session-impl + post-impl)
**Scope:** `modules/session/session-api`, `modules/session/session-impl`,
`modules/social/post-api`, `modules/social/post-impl`, `server` (migrations, H2 test schema, IT)

## Origin and two design reversals

SESSION-10 was originally specced in `documentation/md/vision/SESSION_COMMENTS_VISION.md`
(2026-08-07) as a brand-new, domain-scoped `SessionComment`/`SessionCommentLike` entity pair in
`session-impl`. `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §7 (2026-08-10) reconsidered and
re-rejected reusing `post-impl`'s `Comment` entity in a stronger form (modeling a whole session as
a `Post`), mainly because it would require a **bidirectional** cross-domain dependency and weld
`session-impl` to `post-impl` at the schema level.

This ticket reverses both decisions — twice, in direct discussion with the user:

**First pass (bidirectional):** `PostGate` (post-impl) delegated a `SESSION_POST`'s
availability/visibility to new `session-api` methods, and `session-impl` called `post-api` to
create the anchor post. Justified at the time because `group-impl ↔ post-impl` already has the
identical bidirectional shape (B3 + B9), so it wasn't unprecedented. This pass *worked* — and, as
predicted, triggered a real circular Spring bean dependency (`PostGate → SessionServiceImpl →
PostServiceImpl → PostGate`) on the first `:server:test` run, fixed with `@Lazy` on
`SessionServiceImpl`'s `PostService` dependency (mirroring `GroupServiceImpl`'s existing fix for
the same shape).

**Second pass (one-way, what actually shipped):** the user asked for something stricter than "not
unprecedented" — a `SESSION_POST` invisible via `/api/posts/**` for *every* caller, reachable only
through `session-api`, with `post-impl` carrying zero dependency back on `session-api`. This is the
final design documented below. It also happens to be a nicer outcome than the first pass: no
circular bean dependency to work around, and `session-impl` finally gets the standalone
`SessionGate implements ResourceGate<Session>` the ADR originally specced in §6.

## What was built

### The anchor: one `SESSION_POST` per `Session`, created synchronously (unchanged from pass one)

- **`PostType.SESSION_POST`** (post-api) — a fifth post type, alongside `USER_FEED`/`GROUP_POST`/
  `GROUP_BROADCAST`/`GROUP_SYSTEM`.
- **`PostService.createSessionPost(UUID authorUserId, String content)`** (post-api) → returns the
  new post's `Long` id. Internal only — not REST-reachable. `PostServiceImpl.createPost` rejects a
  caller-supplied `postType == SESSION_POST` outright, same spoofing guard B9 added for
  `GROUP_SYSTEM`. `updatePost`/`deletePost` reject `SESSION_POST` unconditionally too.
- **`Session.postId`** (`Long`, `NOT NULL`, unique, no DB-level FK) — the reverse link.
  `SessionServiceImpl.createSession` calls `postService.createSessionPost(userId, "Session: " +
  title)` inline, before persisting the `Session`, in the same `@Transactional` method — a
  post-creation failure rolls back the whole session creation.
- `session-impl → post-api` is now the **only** cross-domain edge this feature adds between the two
  modules — `post-impl` has no dependency on `session-api` at all.

### `SESSION_POST` is unconditionally invisible via `/api/posts/**`

`PostGate.isAvailable` returns `false` for `SESSION_POST`, unconditionally — not viewer-dependent,
no delegation anywhere:

```java
if (post.getPostType() == PostType.SESSION_POST) {
    return false;
}
```

Since `ResourceGate.require()` checks availability before visibility, this alone 404s every
`/api/posts/**` path for a `SESSION_POST` id — `getPostById`, `getPostComments`, `createComment`,
`likeComment`/`unlikeComment`, `likePost`/`unlikePost` — for every caller, including the session's
own creator/participants. `isVisibleTo`'s `SESSION_POST` case also returns `false` (dead code in
practice, since `isAvailable` short-circuits first, but kept for safety in case something ever
calls `isVisibleTo` directly).

### `CommentService` bypass methods (post-api/post-impl) — reuse without the public gate

`post-api`'s `CommentService` gained four methods that skip `PostGate` entirely:

```java
CommentResponse createSessionComment(Long postId, UUID userId, CreateCommentRequest request);
Page<CommentResponse> getSessionPostComments(Long postId, UUID currentUserId, Pageable pageable);
void likeSessionComment(Long postId, Long commentId, UUID userId);
void unlikeSessionComment(Long postId, Long commentId, UUID userId);
```

Same shape as B9's `createSystemPost` bypassing `createPost`'s validation — internal only, intended
only for `SessionServiceImpl` to call, after it has already done its own authorization.
`CommentServiceImpl` was refactored to extract each method's shared body (`doCreateComment`,
`doGetPostComments`, `doLikeComment`, `doUnlikeComment`) so the public gated method and its bypass
twin share one implementation, differing only in the precheck.

**The precheck is two things, not one — both closing a real gap, not just defensive style:**
1. **`postType == SESSION_POST`**, not just active/exists (`requireSessionPost`). Without it, these
   bypass methods could act on *any* post's comments — a `USER_FEED`/`GROUP_POST`/etc.'s — as long
   as the id happened to resolve, since nothing else about the bypass restricts which post types
   it's meant for.
2. **`likeSessionComment`/`unlikeSessionComment` take `postId` as an explicit parameter and verify
   `comment.getPostId().equals(postId)`** before touching the like. Caught during a post-ship
   review question ("should these add a post type check too?") that surfaced a sharper gap than
   the type check alone would close: `session-api`'s `likeSessionComment(sessionId, commentId,
   userId)` takes a client-supplied `commentId` independent of `sessionId`. Before this fix, a
   caller legitimately authorized against session A (a real `JOINED` participant) could call `POST
   /api/sessions/{sessionA}/comments/{anyCommentId}/like` with a comment id belonging to a
   *different* session's thread — `SessionServiceImpl` only ever checked access to `sessionA`, never
   that the comment actually belonged to it, and the bypass method (pre-fix) only checked the
   comment's real parent post existed. Classic IDOR (insecure direct object reference), not merely
   a missing type check. `SessionServiceImpl.likeSessionComment`/`unlikeSessionComment` now pass
   `session.getPostId()` (their own resolved value, never client-supplied) as `postId`, and
   `CommentServiceImpl` rejects any `commentId` whose real parent post doesn't match, with
   `NotFoundException` (not `ForbiddenException` — a mismatched comment simply doesn't exist from
   this session's point of view, no existence leak). `createSessionComment`/`getSessionPostComments`
   didn't have this exposure — their `postId` is always `session.getPostId()` directly, never a
   client-supplied id resolved indirectly through something else.

### `SessionGate` — the real `ResourceGate<Session>` the ADR originally specced

`session-impl` gained `com.sportconnect.session.access.SessionGate`, a `@Component implements
ResourceGate<Session>`, same shape as `post-impl`'s `PostGate`, no shared logic:

```java
public boolean isAvailable(Session session) {
    return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
}

public boolean isVisibleTo(Session session, UUID viewerId) {
    boolean isParticipant = /* JOINED/REQUESTED/INVITED via SessionParticipantRepository */;
    return isParticipant
            || (session.getGroupId() != null && groupService.isGroupMember(session.getGroupId(), viewerId));
}
```

This is the **only** gate standing between a caller and a session's comment thread — `post-impl`
never checks, since `SESSION_POST` is already unconditionally unavailable there.

### `session-api`'s comment-proxy methods and new endpoints

```java
// SessionService (session-api) — new dependency on post-api, to reference CommentResponse/
// CreateCommentRequest in these signatures (same precedent as group-api → post-api for
// PinnedPostResponse)
CommentResponse createSessionComment(Long sessionId, UUID userId, CreateCommentRequest request);
Page<CommentResponse> getSessionComments(Long sessionId, UUID callerId, Pageable pageable);
void likeSessionComment(Long sessionId, Long commentId, UUID userId);
void unlikeSessionComment(Long sessionId, Long commentId, UUID userId);
```

`SessionServiceImpl`'s implementation: resolve the `Session`, call `sessionGate.require(session,
callerId, ...)`, then delegate to `commentService`'s bypass method using `session.getPostId()`.
New `SessionController` endpoints:

```
GET    /api/sessions/{sessionId}/comments
POST   /api/sessions/{sessionId}/comments
POST   /api/sessions/{sessionId}/comments/{commentId}/like
DELETE /api/sessions/{sessionId}/comments/{commentId}/like
```

No `deleteComment` proxy — the existing `DELETE /api/posts/comments/{commentId}` already works
unchanged for a session comment, since `deleteComment` was never gated by `PostGate` in the first
place (ownership-only check, a pre-existing post-impl characteristic, not something this ticket
introduced or needed to touch).

### Liking a session (post-ship addition, same day) — same bypass shape, applied to the post itself

Same pattern extended to the `SESSION_POST` anchor's own like/unlike, not just its comments.
`PostService` (post-api) gained `likeSessionPost(Long postId, UUID userId)`/`unlikeSessionPost(...)`
— `PostServiceImpl.likePost`/`unlikePost` were refactored the same way `CommentServiceImpl` already
was (extracted `doLikePost`/`doUnlikePost` shared bodies), and the bypass twins check `postType ==
SESSION_POST` via their own `requireSessionPost` (a duplicate of `CommentServiceImpl`'s, kept
separate per this codebase's convention of not sharing cross-cutting logic between classes). No
secondary-id cross-check is needed here (unlike `likeSessionComment`'s `commentId`) — there's no
second id involved, just `postId` itself, always `session.getPostId()`.

`SessionService` gained `likeSession(Long sessionId, UUID userId)`/`unlikeSession(...)`,
implemented the same way as the comment-proxy methods: `requireSessionAccess` (renamed from
`requireSessionCommentAccess` now that it gates more than comments) via `SessionGate`, then
delegate with `session.getPostId()`. New endpoints:

```
POST   /api/sessions/{sessionId}/like
DELETE /api/sessions/{sessionId}/like
```

`/api/posts/{postId}/like` remains unconditionally unreachable for a `SESSION_POST`, same as every
other `/api/posts/**` path — `PostGate.isAvailable` already covers it, no separate check needed.

### No more circular bean dependency

With `post-impl → session-api` gone, `SessionServiceImpl` reverted from the first pass's explicit
`@Lazy`-carrying constructor back to plain `@RequiredArgsConstructor` — there's no cycle to break.

### Migrations (unchanged from pass one)

- `V050__add_session_post_type.sql` — additive `posts.post_type` CHECK constraint update.
- `V051__add_session_post_id.sql` — `TRUNCATE sessions, session_participants CASCADE;` then adds
  `sessions.post_id BIGINT NOT NULL UNIQUE` (no dev data worth a backfill).

## Non-obvious constraints

- **`Post.content` for a `SESSION_POST` is never rendered anywhere** — set to `"Session: " + title`
  purely for DB-readability, the column is just `NOT NULL`.
- **`likePost`/`unlikePost`/`getPostById` on a `SESSION_POST` id are now fully blocked**, for
  everyone — a side effect of `isAvailable` being unconditionally `false`, not something specially
  built for this.
- **`SessionRepository.findByPostId` does not exist** — the final design never needs a
  postId-to-session reverse lookup from outside `session-impl` (the first pass added one for
  `PostGate`'s delegated calls; removed once that delegation was removed).
- Thread never locks on `SessionStatus`, per the original vision doc — unchanged.

## Tests

- **Spock** — `PostGateSpec` (SESSION_POST is unconditionally unavailable/invisible, no
  collaborator calls), `PostServiceImplSpec` (spoof-guard, `createSessionPost`, update/delete
  rejection, plus `likeSessionPost`/`unlikeSessionPost` bypass happy paths and wrong-`postType`
  rejection), `CommentServiceImplSpec` (+10: the four bypass methods' happy paths, wrong-`postType`
  rejection for `createSessionComment`/`getSessionPostComments`, and the cross-post-mismatch
  `NotFoundException` for `likeSessionComment`/`unlikeSessionComment`), `SessionServiceImplSpec`
  (companion-post creation; the six comment/like-proxy methods delegating through a mocked
  `SessionGate`, asserting `session.getPostId()` is what's passed downstream), new `SessionGateSpec`
  (isAvailable/isVisibleTo branch coverage, including the ADR §6 widened rule and the
  short-circuit-before-groupService-call case).
- **`SessionPostAccessGateIntegrationTest`** (server, real `MockMvc` + Spring wiring + H2) — proves
  a `SESSION_POST` 404s via `/api/posts/{postId}` (including `/like`) and its comments/
  create-comment paths, even for the session's own creator/participant; proves the new
  `/api/sessions/{sessionId}/like` and `/api/sessions/{sessionId}/comments`
  endpoints correctly gate on participant/group-member status, including the group-linked widened
  rule and a soft-deleted parent group; proves the IDOR fix directly — a legitimate participant of
  session A gets `404` liking a comment id that belongs to session B's thread, and separately for a
  comment on an unrelated non-`SESSION_POST` post. This class's first version (targeting the pass-one
  design) is what caught the circular bean dependency; it's been rewritten twice since.
- H2 test schema.sql gained `sessions`/`session_participants` tables (didn't exist before).
- `./gradlew :modules:social:post-impl:test`, `:modules:session:session-impl:test`, and
  `:server:test` all green.

## Out of scope

- Client work (`CLIENT-SESSION-8` stays a separate, unbuilt ticket in `client/docs/BACKLOG_MVP.md`)
  — it now targets the `session-api` comment-proxy endpoints, not `post-impl`'s directly.
- Notifications on a new session comment — open question, logged in
  `documentation/md/NOTIFICATION_USE_CASES.md` (NOTIF-1).
- Blocking `likePost`/`getPostById` on a session-post id specifically — moot, `isAvailable` already
  blocks all of `/api/posts/**` for it.
