# CLAUDE.md — post-impl

Social feed: posts, comments, and likes. Hashtag, share, and user-follow entities are defined
in the DB and as JPA entities but have **no service implementation yet**.

## Dependencies

| From | Why |
|---|---|
| `modules/social/post-api` | PostService + CommentService interfaces + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| JTS (via server classpath) | `GeometryFactory` for post geolocation — same pattern as user-impl |
| Spring Security | `@PreAuthorize` for post creation |

**No dependency on `session-api`, by design (SESSION-10/A17).** `session-impl` depends on this
module's `post-api` (to create each session's companion `SESSION_POST` anchor and to call
`CommentService`'s bypass methods) — but not the other way. `PostGate` makes `SESSION_POST`
unconditionally unavailable rather than delegating anywhere; see
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §7's supersession note for why an earlier,
bidirectional version of this design was reverted same-day.

## Key Classes

| Class | Purpose |
|---|---|
| `PostServiceImpl` | Feed, CRUD, likes; enforces ownership on update/delete; does NOT extract hashtags |
| `CommentServiceImpl` | Comments + nested replies; `mapToResponse()` is recursive |
| `PostRepository` | `findPublicPosts()` = `visibility='public' AND groupId IS NULL` |
| `PostGate` (`access/`) | `ResourceGate<Post>` (A14) — availability + visibility for the single-item paths (`getPostById`, `getPostComments`, `createComment`, `likeComment`, `unlikeComment`, `likePost`, `unlikePost`); list endpoints (`getGroupPosts`, feeds) keep their own pre-query membership checks, untouched by this gate. `SESSION_POST` (SESSION-10/A17) is unconditionally unavailable here — not delegated anywhere, since this module has no `session-api` dependency; `session-impl`'s own `SessionGate` is the real gate, reached only via its comment-proxy endpoints |

## What's Implemented vs. Stubbed

| Feature | Status |
|---|---|
| Post CRUD, likes | Done |
| Comments, comment likes, nested replies | Done |
| Hashtag extraction on post create | Entity + table exist; `incrementUsageCount()` defined but **never called** in createPost |
| Post sharing / `shareCount` | DTO field defined; **no logic, no endpoint** |
| `UserFollow` | Entity + table exist; **no service, no endpoints** |
| `friends` visibility filter | Field accepted; **no friend graph** — behaves like private |

## Endpoints

```
POST   /api/posts                              ROLE_USER
GET    /api/posts/{postId}
GET    /api/posts/user/{userId}                paginated
GET    /api/posts/feed                         public posts only (no group posts)
GET    /api/posts/group/{groupId}
PUT    /api/posts/{postId}                     owner only
DELETE /api/posts/{postId}                     owner only
POST   /api/posts/{postId}/like
DELETE /api/posts/{postId}/like
POST   /api/posts/{postId}/comments
GET    /api/posts/{postId}/comments            paginated, root-level only
DELETE /api/posts/comments/{commentId}         owner only
POST   /api/posts/comments/{commentId}/like
DELETE /api/posts/comments/{commentId}/like
```

## Run Tests

```bash
./gradlew :modules:social:post-impl:test
```

## Gotchas

- Double-like is blocked by both a unique DB constraint AND a `BadRequestException` in the service — keep both.
- `PostMedia.thumbnailUrl` is only set when the URL string contains `"video"` — all other media gets a null thumbnail.
- Location uses the same JTS pattern as user-impl: `longitude=X, latitude=Y`, SRID 4326.
- `visibility='friends'` is enforced (A14, via `PostGate` + `UserFriendService.areFriends`) on the 5 single-item paths listed above — but only there. List endpoints (`getPersonalizedFeed`, etc.) don't select on `friends`-visibility at all today, so a `friends`-visibility post never appears in anyone's feed regardless of friendship — it's only reachable by direct link/id.
- **`PostType.SESSION_POST`** (SESSION-10/A17) is a throwaway comment-thread anchor for a `Session` — `PostServiceImpl.createSessionPost` (internal only, spoof-guarded in `createPost`, unconditionally rejected in `updatePost`/`deletePost` same as `GROUP_SYSTEM`) always builds it with `groupId = null`, even for a group-linked session. That's deliberate, not an oversight — it's what keeps it out of every feed/group-post query with zero query changes (`findPublicPosts`/`findPersonalizedFeed` filter on `postType`; `findByGroupIdAndIsActiveTrue` never matches a null `groupId`). Never give it a real `groupId`.
- **`CommentService` has four bypass methods** (`createSessionComment`, `getSessionPostComments`, `likeSessionComment`, `unlikeSessionComment`) that skip `PostGate` entirely — same shape as `createSystemPost` bypassing `createPost`'s validation. They're callable by anything in the Spring context (no framework-level restriction), but are meant only for `session-impl` to call after doing its own authorization. Don't wire a controller to them directly — that would defeat the whole point of `SESSION_POST` being unreachable via `/api/posts/**`. The precheck isn't just "post exists": it requires `postType == SESSION_POST`, and `likeSessionComment`/`unlikeSessionComment` additionally take an explicit `postId` and reject a `commentId` whose real parent post doesn't match it — without that second check, a caller authorized for one session could like/unlike a comment on a *different* session's thread by id alone (a real IDOR caught post-ship, not a hypothetical).
- **`Comment.commentType`** (SESSION-21, `CommentType.USER`/`SESSION_SYSTEM`, `V057`) is the
  comment-level twin of `PostType.GROUP_SYSTEM` — a discriminator so a server-written entry in a
  session's thread is distinguishable from a user's own comment. `CommentService
  .createSystemSessionComment`/`createSystemSessionComments` are the only writers (a fifth and
  sixth bypass method, same `SESSION_POST` precheck; the batch one validates every `postId` in one
  query and inserts in one `saveAll`, for `SessionGenerationService`'s 200-per-pass batches).
  `CreateCommentRequest` deliberately has **no** type field, so unlike `GROUP_SYSTEM` there's
  nothing for a caller to spoof and no `createComment` guard is needed. Three guards do exist, all
  unconditional like their `GROUP_SYSTEM` counterparts: a system entry can't be deleted (checked
  *before* `deleteComment`'s ownership check — its nominal author is the session creator, who would
  otherwise pass), replied to, or liked. The system write path skips `addToPreviewCache` and
  `updateLastInteractionAt` on purpose (both only matter for feed surfaces a `SESSION_POST` can't
  reach, and the former does a cross-domain call per row) but **does** increment the Redis
  comment-count key — that key's DB fallback counts system rows, so skipping it would make the
  cached count disagree with the uncached one.
- **`PostService` has the same bypass shape for the post itself** — `likeSessionPost`/`unlikeSessionPost`, same `requireSessionPost` postType check, same "don't wire a controller to them" rule. No secondary-id cross-check needed there (unlike the comment methods) — there's no second id involved, just `postId`.
