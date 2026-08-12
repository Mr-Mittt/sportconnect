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

## Key Classes

| Class | Purpose |
|---|---|
| `PostServiceImpl` | Feed, CRUD, likes; enforces ownership on update/delete; does NOT extract hashtags |
| `CommentServiceImpl` | Comments + nested replies; `mapToResponse()` is recursive |
| `PostRepository` | `findPublicPosts()` = `visibility='public' AND groupId IS NULL` |
| `PostGate` (`access/`) | `ResourceGate<Post>` (A14) — availability + visibility for the single-item paths (`getPostById`, `getPostComments`, `createComment`, `likeComment`, `unlikeComment`, `likePost`, `unlikePost`); list endpoints (`getGroupPosts`, feeds) keep their own pre-query membership checks, untouched by this gate |

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
