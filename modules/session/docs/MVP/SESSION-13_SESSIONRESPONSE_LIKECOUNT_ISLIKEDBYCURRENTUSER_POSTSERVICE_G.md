# SESSION-13 · `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method

**Status:** `DONE` (2026-08-12) · **Full writeup:**
`client/docs/MVP/CLIENT-SESSION-8_SESSION_COMMENTS.md` (this ticket is the backend half of that
client ticket's heart-button follow-up, not a separately-written summary doc)

**Filed:** 2026-08-12, mid-pickup on `CLIENT-SESSION-8` (`client/docs/BACKLOG_MVP.md`) — the user
asked for the session detail modal's heart (like) button, and a real gap surfaced while scoping
it: SESSION-10's "post-ship addition" shipped `POST/DELETE /api/sessions/{id}/like` (write-only)
but never added a way to read back whether a session is already liked or how many likes it has —
`SessionResponse` had no `likeCount`/`isLikedByCurrentUser` fields at all, so a client heart
button could accept a click but never show real state.

**What shipped:**
- `PostLikeInfoResponse` (`post-api`, new DTO): `{ likeCount, isLikedByCurrentUser }`.
- `PostService.getSessionPostLikeInfo(List<Long> postIds, UUID currentUserId)` (`post-api`/
  `post-impl`) — batch method, per this repo's no-N+1 rule applying across domain boundaries
  ("a batch method on a cross-domain -api interface is preferred over N calls to its single-item
  method"). Bypasses `PostGate` same as `likeSessionPost`, silently drops any `postId` that
  doesn't resolve to a real active `SESSION_POST` (same "resolve what you can" precedent as
  `getPostsByIds`). Backed by two new `PostLikeRepository` queries
  (`countGroupedByPostIdIn`/`findLikedPostIdsByUserIdAndPostIdIn`) — a **real batch DB query, not
  the per-post Redis-cache-with-fallback (`getCount`) pattern** `mapToResponse` uses for a
  regular post's own like count. That Redis key is only ever populated by a call through
  `getCount` itself, which nothing in the `SESSION_POST` path ever reaches
  (`likeSessionPost`/`unlikeSessionPost`'s `INCR_IF_EXISTS`/`DECR_IF_EXISTS` are no-ops against a
  key that was never initialized) — a Redis-first lookup would have silently read nothing for
  every session.
- `SessionResponse` gains `likeCount: Long`/`isLikedByCurrentUser: Boolean` (`session-api`), never
  null. `SessionServiceImpl.mapToResponses` batch-resolves them via the new `PostService` method,
  keyed by each session's own `postId`, alongside the existing creator/sport/location/
  participant-count/`callerParticipation` batch resolution.
- Fixed a stale doc comment on `SessionResponse.postId` while in the file — it described the
  pre-SESSION-10-second-pass design (client calling `/api/posts/{postId}/comments` directly),
  which stopped being true when SESSION-10's second pass shipped session-scoped endpoints instead.

**Tests:** new Spock coverage in `PostServiceImplSpec` (batch happy path, silently-dropped
non-`SESSION_POST`/nonexistent ids, empty input, null `currentUserId`) and
`SessionServiceImplSpec` (`mapToResponses` resolves `likeCount`/`isLikedByCurrentUser` from the
batch result, defaults to `0`/`false` when a postId is absent from it) —
`stubBatchEnrichment()`'s shared lenient stub extended with the new call so the other ~20 tests
routing through `mapToResponses` didn't each need updating individually. `:modules:social:
post-impl:test`, `:modules:session:session-impl:test`, and `:server:test` all green.

**Out of scope:** any change to `likeSession`/`unlikeSession` themselves (SESSION-10, unchanged);
an IT test — this isn't a new access-control boundary, just new read-only fields resolved through
an already-gated write path's sibling data.
