# B5 — Hashtag Service

## What was built

Auto-extraction of `#word` patterns from post content, hashtag usage count tracking, and three read endpoints for hashtag discovery.

### New files

| File | Purpose |
|---|---|
| `post-api/dto/HashtagResponse.java` | `{id, tag, usageCount}` DTO |
| `post-api/service/HashtagService.java` | Service interface |
| `post-impl/repository/HashtagRepository.java` | Trending + prefix suggest queries |
| `post-impl/repository/PostHashtagRepository.java` | Post-hashtag link queries including visibility-aware hashtag post search |
| `post-impl/service/HashtagServiceImpl.java` | Extraction logic, upsert, decrement |
| `post-impl/controller/HashtagController.java` | `/api/hashtags/trending` and `/api/hashtags/suggest` |
| `V022__add_hashtag_pattern_index.sql` | `varchar_pattern_ops` index on `hashtags.tag` for prefix LIKE |

### Modified files

- `CreatePostRequest` — removed manual `List<String> hashtags` field
- `PostService` — added `getPostsByHashtag(tag, userId, pageable)`
- `PostServiceImpl` — injects `HashtagService`, calls on create/delete, populates `hashtags` in `mapToResponse`
- `PostController` — added `GET /api/posts/hashtag/{tag}` (public)
- `GroupService` — added `getGroupIdsForMember(UUID userId)`
- `GroupServiceImpl` — implemented via `groupMemberRepository.findByUserId()`
- `SecurityConfig` — permitted `GET /api/hashtags/**` and `GET /api/posts/hashtag/**`

## Endpoints

```
GET /api/hashtags/trending?page=&size=10     public — top hashtags by usageCount DESC
GET /api/hashtags/suggest?q=prefix&size=10   public — prefix match, ordered by usageCount DESC
GET /api/posts/hashtag/{tag}?page=&size=20   public — posts tagged with #tag
```

## Key decisions

**Lowercase normalization at write time** — tags stored as lowercase (`football` not `Football`). Exact lookup uses `=`, no ILIKE. Consistent with Instagram/Twitter's approach. The `varchar_pattern_ops` index still needed for prefix `LIKE 'foo%'` in suggest.

**One `save()` per hashtag** — new hashtags are built with `usageCount(1)` directly; existing ones increment then save once. Avoids redundant double-save.

**`getPostsByHashtag` on `PostService`** — not on `HashtagService`, to avoid a dependency cycle (`HashtagService` would need `PostService`'s mapping logic). `PostController` calls one service.

**Visibility in hashtag post search** — `USER_FEED + public` OR `GROUP_POST in caller's member groups`. Uses new `groupService.getGroupIdsForMember()`. Unauthenticated callers get public-only results (empty group list → sentinel `-1L` for JPQL IN safety).

**`orphanRemoval` is safe** — `Post.hashtags` collection is never loaded in `PostServiceImpl`. Hibernate only applies orphan removal when the collection is initialized in the same session and entities are removed from it.

## Non-obvious constraints

- `PostHashtag` saves bypass the `@OneToMany` cascade on `Post.hashtags`. This is intentional: `HashtagServiceImpl` owns hashtag persistence; `PostServiceImpl` owns post persistence. They don't load each other's collections.
- `decrementHashtagsForPost` uses `JOIN FETCH ph.hashtag` to avoid N+1 when loading hashtag entities for mutation.
- Regex `#(\w+)` matches `[a-zA-Z0-9_]` — underscores and digits are valid in hashtags.
