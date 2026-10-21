# Redis keys in use

The one list of every Redis key the repo reads or writes, who owns it, how long it lives and what happens when Redis is down.
Written 2026-10-19 (U24) from a grep of every `StringRedisTemplate` / `opsFor*` use in the Java modules and every `redis.` call in
`services/chat`. It replaces the Redis-usage sections of `REDIS_RESEARCH.MD` (a 2026-07-01 research note that is now stale: refresh tokens
are Keycloak's, no longer ours). **Add a row here in the same change that adds a key**, same rule as `infra/documentation/PORTS.md`.

One Redis instance, no key namespaces per environment (dev Compose `redis:7-alpine`, volume `sportconnect_dev_redis`). Spring talks to it
through Lettuce with a 1 s connect and 2 s command timeout (`application.yml`). No key is a token that can be used to sign in; the one
that holds a Keycloak refresh token (the reactivation ticket) keeps it behind a hashed key for 5 minutes.

**Kind** says what an outage means: **cache** = rebuildable from Postgres, the request still works (slower); **state** = no copy anywhere, the
feature fails with a retryable `503 SERVICE_UNAVAILABLE`; **stream** = a message queue, producers log and move on, consumers catch up later.

## Keys

| Key pattern | Type | Owner (class) | TTL | Kind | Contents and rules |
|---|---|---|---|---|---|
| `user:access-state:{userId}` | string | user-impl `UserAccessStateCache` | `app.user.access-state-ttl`, 60 s | cache | `1\|USER,ADMIN`: is the account active, and its roles. Read on **every authenticated request** by `JwtAuthenticationFilter` (A25); evicted after commit by deactivate and reactivate; only existing users are cached, never an absence. Goes through `CacheGuard` (Redis down: one DB query per request, throttled WARN). A reader racing a commit can re-cache the old state for at most the TTL. |
| `auth:reactivation-ticket:{sha256(ticket)}` | string | auth-impl `ReactivationTicketStore` | `app.auth.reactivation-ticket-ttl`, 5 min | state | `userId\|keycloakRefreshToken` of a deactivated password user whose Keycloak session is open but not yet confirmed (A26). The ticket (256 random bits) is only in the response; Redis keeps its hash. Taken out once with `GETDEL` by `/reactivate` or `/reactivate/cancel`. Redis down: sign-in of that user answers 503 and the Keycloak session is ended (known gap, auth A30). **The only key that holds a Keycloak token.** |
| `user:confirm:code:{PURPOSE}:{userId}` | string | user-impl `ConfirmationCodeStore` | `app.user.confirmation-code-ttl`, 15 min | state | U24: SHA-256 of `userId:purpose:code` for the 6-digit code emailed to confirm `DEACTIVATE`, `CHANGE_PASSWORD` or `CHANGE_EMAIL` (to the current address), and `NEW_EMAIL` (U26, to the new address: the hash also holds that exact address, so the code works for it only). Replaced by a new code, deleted on the first success (the `DEL` result decides a race) or after too many wrong tries. |
| `user:confirm:attempts:{PURPOSE}:{userId}` | string (counter) | same | the code's TTL, refreshed per wrong try | state | U24: wrong tries on the pending code; the 5th burns it. Deleted with the code. |
| `user:confirm:resend:{PURPOSE}:{userId}` | string | same | `app.user.confirmation-resend-interval`, 60 s | state | U24: set with `SETNX`; while it exists a new code is refused (`VERIFICATION_RESEND_TOO_SOON`, `seconds` = its remaining TTL). |
| `user:confirm:email-verify-resend:{userId}` | string | same | `app.user.confirmation-resend-interval`, 60 s | state | A33: set with `SETNX` when the caller asks Keycloak for its verification email (`POST /api/users/me/email-verification`); while it exists another request is refused (`VERIFICATION_RESEND_TOO_SOON`, `seconds` = its remaining TTL). Deleted when the request to Keycloak fails, so an outage does not cost the user their wait. Redis down: 503 (the mail is not sent). |
| `user:confirm:new-email-day:{userId}` | string (counter) | same | 24 h from the first code (set with `EXPIRE` when the counter reaches 1) | state | U26: new-address codes (`POST /api/users/me/email-change-code`) mailed today; at `app.user.new-email-daily-limit` (10) another is refused (`NEW_EMAIL_CODE_LIMIT_REACHED`, `seconds` = its remaining TTL). An abuse cap, not a security check: a failed increment is ignored, a failed read is a 503. |
| `user:confirm:pw-fail:{userId}` | string (counter) | same | `app.user.password-attempt-window`, 15 min (set on the first failure) | state | U24: wrong current passwords; at `app.user.password-max-attempts` (5) the backend stops asking Keycloak (`PASSWORD_ATTEMPTS_EXCEEDED`) so Keycloak's brute-force lock is not tripped by us. Cleared by a right password. |
| `post:{postId}:likes` | string (counter) | post-impl `PostServiceImpl` | none | cache | Like count. Written `INCR`/`DECR` only if the key exists (Lua `INCR_IF_EXISTS`), so a missing key is rebuilt from Postgres (`getCount`) on the next read and stays correct. |
| `post:{postId}:comments` | string (counter) | post-impl `PostServiceImpl`, `CommentServiceImpl` | none | cache | Active comment count, same rules. |
| `comment:{commentId}:likes` | string (counter) | `CommentServiceImpl` (read also by `PostServiceImpl`) | none | cache | Like count of a comment, same rules. |
| `comment:{commentId}:replies` | string (counter) | `CommentServiceImpl` | none | cache | Active reply count, same rules. |
| `post:{postId}:comments:preview` | sorted set | `CommentServiceImpl` (write), `PostServiceImpl` (read, rebuild, delete) | none | cache | The 3 newest root comments of a post as JSON, scored by creation time (trimmed with `ZREMRANGEBYRANK 0 -4`). Deleted when a comment is deleted (`CommentServiceImpl`) and when the post is deleted (`PostServiceImpl`); rebuilt from Postgres on a miss. Entries are not rewritten when an author renames or changes avatar, so they hold the name and avatar from when they were cached until they roll off (A36). |
| `sportconnect:domain-events` | stream | **producers:** user-impl `UserServiceImpl` (`user.profile_updated`), `UserFriendServiceImpl` (`user.friend_request.created`, `.accepted`), group-impl `GroupServiceImpl` (`group.member_added`, `.member_removed`, `.deleted`). **consumer:** `services/chat` | none, **never trimmed** | stream | Fields `event_id`, `event_type`, `schema_version` (1), `occurred_at`, `payload` (JSON). The one-way sync that keeps chat's own cache tables (`group_members_cache`, `friendships_cache`, `user_profiles_cache`) current; contract in `services/chat/docs/SYNC_DESIGN.md`. A publish failure is logged and ignored: chat's cold-start bootstrap recovers the gap. Chat reads it as consumer group `chat-service` (`XGROUP CREATE ... 0`, `XREADGROUP` blocking 5 s, `XACK` after applying; pending entries of its own id are re-read at start) and keeps its resume position in **its Postgres** table `sync_state`, not in Redis. The stream grows without bound (no `MAXLEN`/`XTRIM`): chat ticket **CHAT-21**. |

## Not in Redis

Easy to assume, so stated: **Keycloak sessions and refresh tokens** (Keycloak's own database; the refresh token is in the browser's httpOnly cookie),
**access tokens** (browser memory only; verified against the realm keys, which the JWT decoder caches in process memory), **notifications and
STOMP** (RabbitMQ), **the transactional outboxes** (one Postgres table per domain, for example `post_outbox_events`, relayed to RabbitMQ), **chat messages and conversations** (the chat
service's Postgres), **sessions, groups, users, sports** (Postgres). The one Spring Cache is the in-process `"sports"` map in `sport-impl` (`CacheConfig`, a `ConcurrentMapCacheManager`, no TTL): it is not Redis.

## Rules for a new key

1. Name it `<owner>:<what>:<id>` (the post counters predate this and keep their `post:`/`comment:` names).
2. Decide the kind first and write it in the table: a cache goes through `CacheGuard` (`modules/common`) and has a Postgres fallback; state needs its own `ServiceUnavailableException` handling and a ticket if an outage is not acceptable (see auth A30).
3. Give it a TTL unless it is a counter that can be rebuilt; never store a usable credential in clear (hash the key or the value, as the ticket and code stores do).
4. A test that touches it extends `RedisBaseIT` (real Redis through Testcontainers), and cleans its own keys.
