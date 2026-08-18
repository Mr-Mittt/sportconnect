# Post Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/social/post-impl`  
**Last updated:** 2026-08-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon post mvp` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [B7](MVP/B7_NOTIFICATION_OUTBOX_WIRING.md) | Notification outbox wiring — post liked/commented/replied, thread-participant fan-out | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A14](MVP/A14_POST_RESOURCE_GATE.md) | Enforce post visibility/group-membership on single-item paths (getPostById, comments, likes) — not just list endpoints | `DONE` |
| 2 | [A16](MVP/A16_CONSUME_GROUP_IMPL_S_CANMANAGEPOSTS_INSTEAD_OF_COMPOSING.md) | Consume `group-impl`'s new `canManagePosts` instead of composing `isGroupOwner`/`isGroupAdmin` | `DONE` |
| 3 | [A17](MVP/A17_SESSION_POST.md) | `SESSION_POST` — post-impl side of SESSION-10's comment-thread reuse (`PostType`, `createSessionPost`, `PostGate` delegation to session-api) | `DONE` |
| 4 | [A15](MVP/A15_DROP_POST_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on post-impl tables' cross-domain columns (user_id chain, posts.group_id, and posts.sport_id — absorbs A13) | `DONE` |
| 5 | [A11](MVP/A11_BROADCAST_TIMEZONE_INVESTIGATION.md) | Broadcast-expiry timezone mismatch — investigated 2026-08-10, not reproducible, no code change | `DONE` |
| 6 | [A12](MVP/A12_REMOVE_POSTRESPONSE_SPORTNAME.md) | Revisit A9's `sportName` join — sports are static reference data, client may not need it server-resolved | `DONE` |
| 7 | [A10](MVP/A10_FIX_HASHTAG_ENDPOINT_500.md) | Fix `GET /api/posts/hashtag/{tag}` — always 500s (conflicting `ORDER BY`) | `DONE` |
| 8 | [A9](MVP/A9_POSTRESPONSE_MISSING_FIELDS.md) | Fix `PostResponse` never populating `userFullName`/`sportName`/`shareCount` | `DONE` |
| 9 | [A8](MVP/A8_SERVER_TEST_REDIS_TESTCONTAINERS.md) | `server:test` needs Redis — `PostControllerIntegrationTest.shouldCreatePost` fails without it | `DONE` |
| 10 | [A6](MVP/A6_FIX_N1_HASHTAG_LOOKUP.md) | Fix N+1 hashtag lookup in feed mappers | `DONE` |
| 11 | [A7](MVP/A7_FIX_N1_COMMENT_MAPPER.md) | Fix N+1 in CommentServiceImpl.getPostComments (cross-domain user lookup + per-comment replies query) | `DONE` |
| 12 | [A5](MVP/A5_FIX_CROSS_DOMAIN_VIOLATION.md) | Fix cross-domain violation in CommentServiceImpl (UserRepository/User → UserService) | `DONE` |
| 13 | [A3](MVP/A3_GROUP_POSTS_MEMBERSHIP_GATE.md) | Group posts membership gate | `DONE` |
| 14 | [A4](MVP/A4_COMMENT_FIXES.md) | Comment fixes (depth + post-active check) | `DONE` |
| 15 | [B2](MVP/B2_PERSONALIZED_FEED.md) | Personalized main feed | `DONE` |
| 16 | [B3](MVP/B3_REDIS_COUNTERS.md) | Redis like counters | `DONE` |
| 17 | [B6](MVP/B6_GROUP_BROADCAST_MANAGEMENT.md) | GROUP_BROADCAST management | `DONE` |
| 18 | [A1](MVP/A1_JWT_BASED_IDENTITY.md) | JWT-based identity | `DONE` |
| 19 | [A2](MVP/A2_FIX_POST_DELETE_PERMISSION.md) | Fix post delete permission (group owner/admin) | `DONE` |
| 20 | [B1](MVP/B1_FRIENDSHIP_SYSTEM.md) | Friendship system | `DONE` |
| 21 | [B4](MVP/B4_REDIS_COMMENT_PREVIEW_CACHE.md) | Redis comment preview cache | `DONE` |
| 22 | [B5](MVP/B5_HASHTAG_SERVICE.md) | Hashtag service | `DONE` |

---

**Note:** F1 (Frontend — personalized feed) moved to `client/docs/BACKLOG_MVP.md`.
