# Chat ↔ monolith sync design

**Status:** implemented and live-verified end-to-end (2026-07-27) — a real profile update on the
monolith was confirmed to land on the Redis Stream, get consumed by a running chat service
instance, and update `user_profiles_cache`, with no manual step in between.
**Go side:** `internal/sync/` (`types.go`, `consumer.go`, `bootstrap.go`, `cache.go`).
**Java side:** publish calls in `GroupServiceImpl`, `UserFriendServiceImpl`, `UserServiceImpl`, the
`/internal/sync/**` endpoints (`InternalGroupSyncController`, `InternalUserSyncController`), and the
`SecurityConfig` filter chain gating them. See the punch list at the end for what's still deferred
(none of it blocks running the chat service locally).

**Real bug found and fixed during live verification, worth knowing if you ever touch
`InternalServiceAuthFilter`:** it was originally a `@Component`. Spring Boot auto-registers *any*
bean implementing `Filter` (which `OncePerRequestFilter` does) as a global servlet filter applied
to every request, completely independent of which `SecurityFilterChain.addFilterBefore(...)` it's
also wired into. That auto-registered copy ran ahead of the intended `/internal/**`-scoped one and
rejected every request in the entire app — including plain public endpoints like
`/api/auth/register` — not just internal ones. Fixed by removing `@Component` entirely and
constructing it directly inside `SecurityConfig` (`new InternalServiceAuthFilter(secret)`) instead
of injecting it as a bean. **Never re-add `@Component`/`@Bean` to a filter that's meant to be
scoped to one specific `SecurityFilterChain`** — construct it inline in the config class instead,
or explicitly disable Boot's auto-registration via a `FilterRegistrationBean` with
`setEnabled(false)` if it genuinely needs to remain a managed bean for some other reason.

## Why this exists

The chat service authorizes every conversation open/message-send/history-read/WebSocket-connect
against its own local cache tables (`group_members_cache`, `friendships_cache`,
`user_profiles_cache`) — never a live call to the Java monolith at request time. That cache has to
come from somewhere and has to stay current. Two mechanisms, working together:

1. **Ongoing deltas** — the monolith publishes an event to a Redis Stream every time membership,
   friendship, or displayable profile data changes. The chat service consumes it continuously.
2. **Cold-start bootstrap** — a Redis Stream alone can't seed state for entities that already
   existed before the chat service ever ran. A one-time (or resumable) HTTP pull against new
   internal-only Spring endpoints fills that gap.

## Why Redis Streams, not plain Pub/Sub or a Postgres outbox

Plain Redis Pub/Sub has no persistence — a subscriber that's down (a real risk on a rebootable
t3.micro) silently misses whatever was published while it was offline, which here means stale group
access (someone removed from a group keeps chat access until their token happens to expire). Redis
Streams persist (Redis's own AOF/RDB) and support consumer-group semantics
(`XREADGROUP`/`XACK`/`XAUTOCLAIM`) — an entry stays in the stream and in the consumer group's
pending list until acked, so a restart resumes exactly where it left off.

A Postgres outbox was considered and rejected: it would require the chat service to either open a
second connection pool directly into the monolith's own database (a tighter cross-service coupling
than an event contract — the opposite of what extracting a service is supposed to buy) or have
Spring push outbox rows somewhere else anyway, at which point it isn't simpler than just using
Redis — which already runs on the box and is already used this way elsewhere in this app
(`PostServiceImpl`/`CommentServiceImpl` use `StringRedisTemplate` for counters today).

## Stream & envelope

**Stream:** `sportconnect:domain-events` (one stream for every domain, not one per domain — simpler
to operate at this project's scale; ordering across domains isn't a requirement, only per-entity
idempotency, which upserting on primary key already gives).

**Consumer group:** `chat-service`.

**Envelope** (the value of each stream entry's `payload` field is this JSON, alongside plain
`event_type` on the same entry for fast dispatch without decoding the payload first):

```json
{
  "event_id": "uuid",
  "event_type": "group.member_added",
  "schema_version": 1,
  "occurred_at": "2026-07-26T10:15:00Z",
  "payload": { "group_id": 42, "user_id": "..." }
}
```

`schema_version` lives on the envelope, not per field — a breaking payload shape change is a
version bump the consumer switches on (see `internal/sync/consumer.go`'s `handle` method), no schema
registry needed at this scale.

## Event catalogue

| `event_type` | Payload | Cache effect | Java publish site (not yet wired) |
|---|---|---|---|
| `group.member_added` | `{group_id, user_id, role?}` | Upsert `group_members_cache` | `GroupServiceImpl.finalizeMembership` (`modules/social/group-impl/.../GroupServiceImpl.java:1709`) + the owner-member path in `createGroup` |
| `group.member_removed` | `{group_id, user_id}` | Delete from `group_members_cache` | `GroupServiceImpl.removeMember` (`:440`), `leaveMember` (`:565`) |
| `group.deleted` | `{group_id}` | Delete all rows for that group from `group_members_cache` | `GroupServiceImpl.deleteGroup` (`:365`) |
| `friendship.accepted` | `{user_id, friend_id}` | Upsert both directions in `friendships_cache` | `UserFriendServiceImpl.establishFriendship` (`modules/user/user-impl/.../UserFriendServiceImpl.java:117`) |
| `friendship.removed` | `{user_id, friend_id}` | Delete both directions from `friendships_cache` | `UserFriendServiceImpl.removeFriend` (`:178`) |
| `user.profile_updated` | `{user_id, full_name, username, avatar_url}` | Upsert `user_profiles_cache` | `UserServiceImpl.updateProfile`, only when a displayable field actually changed |

**Deliberately not published:** role changes (`transferOwnership`/`updateMemberRole`) — chat
authorization only needs "member or not." Documented in `CLAUDE.md`'s "Known gaps," not silently
missing.

## Cold-start bootstrap

New internal-only, cursor-paginated Spring endpoints (keyset pagination, not offset — a full-table
dump degrades badly with offset pagination at any real scale):

```
GET /internal/sync/group-members?cursor=&limit=500  -> { items: [{group_id, user_id, role}], next_cursor }
GET /internal/sync/friendships?cursor=&limit=500     -> { items: [{user_id, friend_id}], next_cursor }
GET /internal/sync/users?cursor=&limit=500           -> { items: [{user_id, full_name, username, avatar_url}], next_cursor }
```

**Auth:** header `X-Internal-Service-Secret` checked against env var `INTERNAL_SERVICE_SECRET` (no
dev default — fails loudly, same posture as every other secret in this stack) via a new Spring
Security filter chain that is **not** the JWT chain — this is service-to-service, not user auth.

**Must be network-unreachable from outside the Docker network in prod** — an Nginx/Caddy
`location`-block deny or a security-group rule, not application code. This is an infra ticket this
plan depends on, tracked separately (see root `CLAUDE.md`'s services row / `PROGRESS.md`).

**Resumability:** the chat service only runs the bootstrap pull when it has never successfully
consumed from the stream before (`sync_state` empty — see `cmd/chat/main.go`'s startup sequence). A
restart after the first successful bootstrap resumes the consumer group from its last acked offset
instead — Redis Streams' own persistence makes re-bootstrapping unnecessary.

## Punch list

Done (Java side, verified live):
1. ~~Add `spring-boot-starter-data-redis` to `group-impl`/`user-impl` build.gradle.~~
2. ~~Add `StringRedisTemplate`-based `XADD` calls at the six publish sites.~~
3. ~~Add the three `/internal/sync/**` endpoints plus the `SecurityConfig` filter chain.~~
4. ~~Add the required `INTERNAL_SERVICE_SECRET` env var to `application.yml`/`application-prod.yml`/
   `application-dev.yml` (dev-only literal default, same treatment as `app.jwt.secret`)/
   `application-test.yml`.~~

Still deferred (infra — doesn't block running the chat service locally):
5. Block `/internal/**` from external access at the reverse-proxy/security-group layer in prod.
