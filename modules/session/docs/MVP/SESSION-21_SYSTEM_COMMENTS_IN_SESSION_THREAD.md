# SESSION-21 · System comments in the session discussion thread

**Status:** `DONE` (2026-08-19)
**Type:** New Feature (cross-module — session-impl + post-api/post-impl)
**Scope:** `modules/social/post-api`, `modules/social/post-impl`, `modules/session/session-impl`,
`server` (migration, H2 test schema, IT)

## Origin

Filed 2026-08-19 while closing out SESSION-19, deliberately *additive* to the existing
notifications rather than a replacement: a notification is a one-shot ping to a recipient's bell,
whereas a system comment leaves a durable in-thread record that anyone opening the session later
can read in order. Both are wanted.

Writes server-generated entries into a session's existing discussion thread (SESSION-10's
`SESSION_POST`-anchored comment list) at three moments — **a participant joined**, **a participant
left**, **the session started**. No user entry point, no user input, no new API: entries are
written at the same three call sites that already emit outbox events, and surface through the
existing comment-read endpoint.

## How the ticket's central open question was resolved

The ticket left one thing deliberately unresolved: `Comment.user_id` is `NOT NULL` and **a system
comment has no author**. It listed four candidate resolutions (nullable `user_id`, a sentinel
system UUID, an `isSystem`/type discriminator, or a separate `session_system_comments` table) and
noted the first three are changes to `post-impl`'s table, i.e. cross-domain.

**The answer came from precedent, not from re-deriving it.** This codebase had already solved the
identical problem for group system posts (B9, `modules/social/group-impl/docs/MVP/
B9_GROUP_WELCOME_SYSTEM_POST.md`), and B9's shipped design settles nearly every sub-question here:

| B9's decision (GROUP_SYSTEM post) | Applied here (SESSION-21) |
|---|---|
| **No system-user account, no nullable author** — the post is authored by a *real* user, the group's current owner, resolved dynamically. Nullable `userId` was explicitly rejected as rippling into every ownership check | Authored by `session.getCreatedBy()`. Simpler than B9 — `Session` already carries `createdBy`, so there's no `resolveGroupOwnerId`-style lookup |
| **The discriminator is a type enum**, exposed on the response so the client can branch (`PostType.GROUP_SYSTEM` → `PostResponse.postType`) | New `CommentType.USER`/`SESSION_SYSTEM` → `CommentResponse.commentType` |
| **Additive migration** — drop + re-add the CHECK with one more value (`V027`) | `V057` — same shape, plus the column itself, since `comments` had no type column at all |
| **Content is server-templated**, name baked in at write time via `getUsersByIds` | Same, via `SessionServiceImpl.resolveParticipantName` |
| **Edit/delete blocked unconditionally** — "not even the group owner who nominally authored it" | `deleteComment` rejects a system entry, before the ownership check |
| **Spoofing guard** on the public create path (`createPost` rejects caller-supplied `GROUP_SYSTEM`) | **Not needed** — `CreateCommentRequest` has no type field, so there is nothing to spoof. Called out explicitly so a future reader doesn't think it was forgotten |
| **A rule in the module's CLAUDE.md** so future trigger points don't miss wiring it | `session-impl/CLAUDE.md` business rule 9 |

Two things B9 genuinely didn't decide, settled with the user at pickup:

- **Discriminator granularity.** One `SESSION_SYSTEM` value, not one per event — faithful to B9
  (whose single `GROUP_SYSTEM` value carries no event detail either); the server-templated content
  carries the specifics.
- **Likes and replies.** B9 blocked edit/delete on a `GROUP_SYSTEM` post but left it likeable and
  commentable, so precedent and the ticket's stated expectation ("none of the three") disagreed
  here. Resolved in favour of the ticket: a system entry can't be liked, replied to, or deleted.

Plus the ticket's remaining edge cases: **no dedupe** on repeated join/leave (one entry per genuine
transition — the transitions are already tightly guarded, and a faithful record is the point);
**ordering** needs no change (both kinds carry `createdAt`, the existing read path already sorts
`createdAt DESC`); **comment count** was moot (no `commentCount` exists on `SessionResponse`
today — but see the Redis note below, which is a real correctness constraint, not a preference).

## What was built

### Migration

`V057__add_comment_type.sql` — `ALTER TABLE comments ADD COLUMN comment_type VARCHAR(32) NOT NULL
DEFAULT 'USER'` plus `chk_comment_type CHECK (comment_type IN ('USER','SESSION_SYSTEM'))`. The
default backfills every existing row, so no truncation (unlike SESSION-10's `V051`). H2
`schema.sql` mirrors the column. Verified applied against the real dev Postgres, not just H2.

### post-api

- `CommentType { USER, SESSION_SYSTEM }`. Naming a session concept in a `post-api` enum is
  consistent with existing precedent — `PostType` already contains both `GROUP_SYSTEM` and
  `SESSION_POST`.
- `CommentResponse.commentType` — additive field.
- `SystemSessionCommentRequest { postId, authorUserId, content }` — batch input DTO.
- `createSystemSessionComment(postId, authorUserId, content)` and
  `createSystemSessionComments(List<SystemSessionCommentRequest>)`; the single delegates to the
  batch. Internal-only and `void`, like `createSystemPost`.

### post-impl

- `Comment.commentType`, `@Enumerated(STRING)`, `@Builder.Default = USER`.
- The system write path is **lean and separate** from `doCreateComment`, mirroring how
  `createSystemPost` is leaner than `createPost`. One `findByIdInAndIsActiveTrue` validates every
  `postId` (all-or-nothing, same `SESSION_POST` invariant as `requireSessionPost`), one `saveAll`
  inserts every row. Two deliberate omissions, both documented at the method:
  - **No `addToPreviewCache`** — its `buildPreviewResponse` does a per-call
    `userService.getUserById`, i.e. a cross-domain call per row, which in a 200-session batch is
    exactly the N+1 the batch method exists to avoid; and the preview cache is only read by feed
    surfaces a `SESSION_POST` can't reach (`PostGate` makes it unconditionally unavailable).
  - **No `updateLastInteractionAt`** — nothing orders a `SESSION_POST` by it, and it would be one
    UPDATE per session in the batch.
- **The Redis comment-count increment is not optional.** That key's DB fallback
  (`countByPostIdAndIsActiveTrue`, `PostServiceImpl.java:546`) counts system rows too, so skipping
  the increment would make the cached count differ from the uncached one depending only on whether
  the key happened to be warm. It increments once per *row*, not per distinct post, so two entries
  landing on one session in a single batch move the count by two.
- Three guards, all unconditional:
  - `deleteComment` rejects a system entry **before** the ownership check — its nominal author is
    the session creator, who would otherwise pass that check and be able to delete
    "X left the session" from their own thread.
  - `doCreateComment` rejects a `parentCommentId` pointing at one. This changed the existing parent
    check from `existsById` to `findById` (same single query, but the guard needs the type).
  - like/unlike reject one. `doLikeComment`/`doUnlikeComment` now take the already-loaded `Comment`
    instead of its id, so one guard covers all four entry points (public × session, like × unlike)
    with no extra query.

### session-impl

- `SessionServiceImpl` — private `writeSystemComment(session, content)` and
  `resolveParticipantName(userId)`, wired into exactly the three genuine-transition branches that
  already write outbox rows: `joinSession`'s `targetStatus == JOINED`, `approveParticipant`, and
  `leaveSession`'s `previousStatus == JOINED`. Content: `"{fullName} joined the session"` /
  `"{fullName} left the session"` / `"The session has started"`. An unresolvable name falls back to
  `"A participant"` rather than throwing, so a missing user can never fail an otherwise valid join.
- `requireRequestedParticipant` now takes the already-resolved `Session` instead of a `sessionId`,
  so `approveParticipant` — which needs the session for the system comment — doesn't fetch it
  twice. `rejectParticipant` updated to match; its behaviour is unchanged.
- `SessionGenerationService.startOngoingSessions` — gained a `CommentService` dependency; builds one
  `SystemSessionCommentRequest` per session in the **same loop** that already builds outbox events,
  then makes one batched call per pass.
- **No `session.comment.created` on any of these paths.** That event stays exclusively in
  `createSessionComment`. Verified explicitly rather than assumed — every new Spock test asserts
  `0 * sessionOutboxWriter.record("session.comment.created", _)`, and one test asserts a *real*
  user comment still does emit it, so the suppression is provably scoped to system entries.

## Decisions the plan didn't cover, settled during implementation

The approved plan specified *which* three branches get a system comment and what
`writeSystemComment` does; it was silent on the two points below. Neither is a divergence from an
approved decision — both are choices made while implementing, recorded here because the reasoning
isn't obvious from the diff.

1. **`requireRequestedParticipant` takes a `Session`, not a `sessionId`.** `approveParticipant`
   needs the session for the system comment, but that helper was already resolving it internally
   and returning only the participant. The first implementation just called `findSessionOrThrow` a
   second time, reasoning that Hibernate's first-level cache makes the second lookup free in
   production — true, but it made the mocked unit test see two `findById` calls, which is a fair
   signal. Changed to pass the resolved `Session` in: one fetch, no reliance on L1-cache behaviour,
   and the test asserts the single call. `rejectParticipant` updated to match, behaviour unchanged.
2. **Two pre-existing `CommentServiceImplSpec` tests were updated**, not because they were wrong,
   but because the reply guard genuinely replaced `existsById` with `findById` on the parent-comment
   check. Both were stubbing the old call. Noted here rather than silently rewritten.

## Tests

- **`CommentServiceImplSpec`** (+11): single and batch write happy paths (asserting
  `SESSION_SYSTEM` type, the passed author, no preview-cache write, no cross-domain call); an empty
  batch is a no-op; one validation query for a three-session batch; count increments once per row
  rather than per distinct post; all-or-nothing rejection when any id isn't an active
  `SESSION_POST`; delete refused for the nominal author; reply refused; like/unlike refused on both
  the session-proxy and public variants; a normal comment still reports `commentType = USER`.
- **`SessionServiceImplSpec`** (+9): a system comment on `joinSession`→`JOINED`, on
  `approveParticipant`, on `leaveSession` from `JOINED`; **none** on `REQUESTED`, on the
  already-`JOINED` early return, on `INVITED`/`REQUESTED`→`LEFT`, or on `rejectParticipant`; the
  unresolvable-name fallback; and a real user comment still emitting `session.comment.created`.
- **`SessionGenerationServiceSpec`** (+2): one batched call carrying one correctly-authored request
  per started session, and no call at all on an empty batch.
- **`SessionSystemCommentIntegrationTest`** (new, server, real MockMvc + Spring wiring + H2): a real
  join writes a creator-authored system row; it comes back through
  `GET /api/sessions/{id}/comments` in correct chronological order alongside a real user comment
  (with the author contrast visible — user comment authored by its writer, system entry by the
  session creator); and the delete/like/reply guards return real 400s through
  `GlobalExceptionHandler`.
- `:modules:social:post-impl:test` (152), `:modules:session:session-impl:test` (128), and
  `:server:test` (100) all green.

## Non-obvious constraints

- **`authenticateAs` only takes effect before the first `MockMvc` request of a test method.** Every
  later request in that method keeps running as that principal no matter how many times it's
  called again. This is pre-existing `BaseIT` behaviour, not something this ticket introduced, but
  it was found the hard way here: an earlier version of the ordering IT switched identity mid-test,
  silently kept the previous one, and passed for the wrong reason. Documented on
  `BaseIT.authenticateAs` and in the IT's class Javadoc; the test that genuinely needs the *other*
  identity now builds its row as a fixture instead of over HTTP.
- **The system entry's `userId` is the session creator, not the participant it describes.** A client
  rendering `userFullName`/avatar from a comment row will show the creator on every system entry —
  which is exactly why `commentType` exists and why the client ticket must branch on it.
- **Baked-in names go stale.** A participant who renames later still appears under their old name in
  past entries — the same trade-off B9's welcome post already accepts, chosen over composing the
  sentence client-side.
- The three trigger paths are existing endpoints, so this adds **no** new account-lifecycle
  (`isActive`) exposure — no new authenticated endpoint was introduced.

## Out of scope

- **All client work** — rendering a system entry distinctly from a user comment is a separate client
  ticket, matching this repo's consistent split (SESSION-10 → `CLIENT-SESSION-8`, SESSION-19 →
  `CLIENT-NOTIF-3`, B9 → its own follow-up). `CommentResponse.commentType` is the field it will
  branch on. **Not yet filed as a ticket.**
- Any event beyond the three named (cancelled, completed, join-request rejected, invitation
  accepted) — several have no outbox event today and would each need a new trigger point.
  `rejectParticipant` has a test asserting it writes *nothing*, to pin that boundary.
- Backfilling system comments for existing sessions; moderation of system entries.

---

**Filed:** 2026-08-19, user request while closing out SESSION-19. **Delivered:** 2026-08-19.
