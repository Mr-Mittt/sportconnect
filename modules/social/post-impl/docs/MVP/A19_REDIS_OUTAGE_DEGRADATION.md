# A19 · Redis outage must degrade, not fail (post and comment caches)

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none

**Filed:** 2026-10-05, found while verifying group A11's `GroupErrorCodesIntegrationTest`: two pin cases passed locally only because a dev Redis was running on localhost; in CI (no Redis) `PostService.getPostById` returned 500. This is the deferred option from A8 (`MVP/A8_SERVER_TEST_REDIS_TESTCONTAINERS.md`), which chose Testcontainers over making the paths Redis-optional. Tracked with its siblings in `documentation/md/NEXT_TOPICS.md` § Redis resilience.

`PostServiceImpl` and `CommentServiceImpl` treat Redis as a cache (like/comment counters B3, comment-preview cache B4) but have no try/catch around any `StringRedisTemplate` call. With Redis unreachable, the connection failure surfaces as a 500 `INTERNAL_ERROR` on every path that maps a post: post reads, feeds, comments, likes, and any caller of `getPostById` such as group `pinPost`.

Wanted: Redis is a cache, so an outage degrades and does not fail. A failed counter read falls back to the DB count (the existing cache-miss path); a failed INCR/DECR, count `set` or preview-cache write/delete is skipped; each logs a `WARN` that Redis could not be reached. One shared guard helper wrapping the calls, not a try/catch per site (about 10 sites across the two classes: `PostServiceImpl` ~321/351/376/439/471/494-497, `CommentServiceImpl` ~100-103/202/281-284/329/364/369-384). Model the log line on the chat-sync publishers (`GroupServiceImpl`/`UserServiceImpl`/`UserFriendServiceImpl` `publishDomainEvent`), which already catch and `log.warn`. Entry point: every authenticated post/comment read and write; no new endpoint. A deactivated caller is unaffected (no new authenticated path).

**Out of scope:** `TokenRevocationChecker` in auth (its own ticket, auth `A11`: a JWT-filter read/write, so an outage there fails every authenticated request); the chat-sync stream publishes in group/user (verified 2026-10-05: already catch `Exception` and log a `WARN`, not a gap here); Redis HA, alerting, retries or circuit breakers. No client-visible enum or event change.

**Tests:** Spock specs for both services with a `StringRedisTemplate` mock throwing `RedisConnectionFailureException` (counts fall back to the DB, writes skipped, WARN logged); a `:server` IT that reaches post mapping with Redis unreachable and expects 200. Once it lands, `GroupErrorCodesIntegrationTest` no longer needs `RedisBaseIT` for its pin cases (optional cleanup).
