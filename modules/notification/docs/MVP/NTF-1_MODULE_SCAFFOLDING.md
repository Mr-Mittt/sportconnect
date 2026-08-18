# NTF-1 · Module scaffolding — entity, aggregation logic, read REST endpoints

**Status:** DONE
**Module:** `modules/notification` (new — `notification-api` + `notification-impl`)
**Related:** `documentation/md/vision/NOTIFICATION_MODULE_VISION.md` (origin), C3
(`modules/common` — this ticket's dependency, `modules/common/docs/MVP/C3_TRANSACTIONAL_OUTBOX.md`)

## Design (approved plan, restated)

New `notification-api`/`notification-impl` modules, following the existing `-api`/`-impl` split.
`Notification` replaces the dead `V005` `notifications` table (zero owning code, cross-domain FKs
straight to `users(id)`) with a clean, ID-only version: `id`, `recipientUserId` (UUID, no FK),
`type`, `entityType`, `entityId`, `actorIds` (bounded, last 3), `actorCount`, `isRead`,
`createdAt`/`updatedAt`. Aggregation is an upsert keyed on
`(recipientUserId, type, entityType, entityId)` scoped to `isRead = false` — a match bumps
`actorCount`/`actorIds`/`updatedAt`; no match inserts a new row; marking read closes the group so
the next matching event starts fresh. Three read/write endpoints: `GET /api/notifications`,
`GET /api/notifications/unread-count`, `PUT /api/notifications/{id}/read`.

Three scope decisions were locked in with the user before design, since none were resolved by the
ticket text or existing precedent alone:

1. **No explicit `isActive` re-check.** The ticket's own Tests section said "read endpoints reject
   a deactivated caller," but no endpoint anywhere in the app does an explicit re-check today
   (`AuthService.refreshToken` is the only reactive one) — CLAUDE.md documents this as a known,
   accepted gap (U12). Matching the vision doc's literal "no new logic needed" phrasing, NTF-1
   inherits the existing gap rather than being the first module to close it. **Delta on this
   ticket's own text:** the "reject a deactivated caller" test line doesn't apply as originally
   written — see Verification below for what actually got tested instead.
2. **`entityId` is a `String`, not a typed FK.** The entities this can point at span domains with
   incompatible id types — `Post`/`Group`/`Session` use `Long`, `FriendRequest`/`Friendship`
   (`user-impl`) use `UUID` — confirmed by reading those entities directly, not assumed.
3. **`recordEvent` lives on the public `NotificationService` interface**, not a separate
   internal-only interface — one service interface per domain module, consistent with every other
   `-api` in this codebase. NTF-2's RabbitMQ consumer will be its first real caller.

## What was built

Exactly per the approved plan, plus one design refinement made during implementation (see Key
decisions):

**Migration** — `V053__create_notification_module.sql`: drops the old `notifications` table,
recreates it with the ID-only schema above plus three indexes (`recipient_user_id, updated_at` for
the list endpoint; `recipient_user_id, is_read` for unread-count; the full aggregation key for
`recordEvent`'s upsert lookup).

**`notification-api`**: `NotificationResponse` DTO; `NotificationService` interface —
`getNotifications`, `getUnreadCount`, `markAsRead`, `recordEvent`.

**`notification-impl`**:
- `Notification` entity (`Long`/`IDENTITY`) + `UuidListConverter` (a small
  `AttributeConverter<List<UUID>, String>` — no array-column precedent exists anywhere in this
  codebase, and 3 UUIDs never approach the 500-char limit, so a comma-joined string is simpler
  than a native Postgres array type here).
- `NotificationRepository` — the three derived-query methods the design called for.
- `NotificationGate implements ResourceGate<Notification>` — `isAvailable` is trivially always
  `true` (no soft-delete concept for a notification; `ResourceGate.require()`'s own null-check
  already covers nonexistence), `isVisibleTo` checks `recipientUserId.equals(viewerId)`.
- `NotificationServiceImpl` — `recordEvent`'s upsert dedupes/prepends the actor into the bounded
  3-entry list and bumps `actorCount` unconditionally (documented explicitly as *total matched
  events*, not distinct-actor count, since the vision doc doesn't pin this down); `markAsRead`
  goes through `NotificationGate.require(...)`, idempotent if already read.
- `NotificationController` — the three endpoints, `@PreAuthorize("hasRole('USER')")` +
  `@AuthenticationPrincipal String userIdStr`, same convention as `LocationController`. No
  `SecurityConfig` change was needed — `/api/notifications/**` already falls under the existing
  `.anyRequest().authenticated()` default.

**Cross-cutting**: `settings.gradle` + `server/build.gradle` gained the two new module includes.
No change to `common` or `auth-impl`.

**Tests**:
- `NotificationGateSpec` (3 cases) — the gate's own branch logic in isolation.
- `NotificationServiceImplSpec` (11 cases, mocked repository + gate) — new-group creation,
  actor-bump on an existing open group, dedup-and-reorder on a repeat actor, bounding to 3 entries,
  a read row never being matched by the upsert lookup, `markAsRead` ownership delegation
  (success/idempotent/`NotFoundException`/`ForbiddenException` propagation), pagination/ordering
  delegation, unread-count delegation.
- `NotificationAccessGateIntegrationTest` (new, `server/src/test/java/com/sportconnect/integration/`,
  4 cases) — real `MockMvc` + H2 round trip for `PUT /api/notifications/{id}/read`: owner → 200,
  non-owner → 403, nonexistent → 404, unauthenticated → 401. This is what actually replaced the
  ticket's original "reject a deactivated caller" line — real ownership-boundary coverage, just
  not an `isActive` check (see Delta above). Required adding a `notifications` table to
  `server/src/test/resources/schema.sql`.

## Key decisions

- `entityId` was made `NOT NULL` (the ticket/vision doc didn't specify) — every real event type in
  the vision doc's v1 scope references a concrete entity, and a nullable `entityId` would silently
  break the derived-query equality match in `findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse`
  (`NULL = NULL` is never true in SQL), which would have made the aggregation upsert never match an
  existing group for any notification with a null `entityId`.
- `isRead`/`actorCount` are `Boolean`/`Integer` wrapper types on the entity, not primitives —
  matches this codebase's existing convention for nullable-looking boolean/int JPA fields (e.g.
  `Group.isActive`/`isPrivate`), including the `Boolean.TRUE.equals(...)` null-safe check style
  used in `markAsRead`.
- No cross-domain `-api` dependency at all (unlike `location-impl`'s `sport-api` dependency for
  name enrichment) — NTF-1's endpoints return raw `actorIds`/`entityId`, no actor-name/avatar
  enrichment. That's explicitly out of scope here.

## Out of scope (unchanged from ticket)

The RabbitMQ consumer itself and real event-type values (NTF-2), actor-name/avatar enrichment,
STOMP live delivery (NTF-3), notification preferences.

## Verification

- `./gradlew :modules:notification:notification-impl:test` — all 14 tests pass (3 gate + 11 service).
- `./gradlew build -x test` — full multi-module build compiles clean with the two new modules wired
  into `settings.gradle`/`server/build.gradle`.
- `./gradlew :server:test` — full suite passes including the 4 new
  `NotificationAccessGateIntegrationTest` cases, no regressions.
- `./gradlew :server:bootRun` against the real dev Postgres — `V053` applied cleanly (`Rows
  affected: 1`, changeset logged), server started, `GET /api/notifications` and
  `GET /api/notifications/unread-count` both returned a clean `401 Unauthorized` for an
  unauthenticated request (correct behavior, confirms the app boots and serves the new routes).
- N+1 check: `getNotifications`'s `.map(this::toResponse)` makes no per-item repository/service
  calls — no cross-domain enrichment in this ticket's scope, so nothing to batch.

No divergence from the approved design beyond the documented isActive-gating Delta (a scope
decision made *before* implementation, not a mid-implementation deviation) and the `entityId`
`NOT NULL` refinement made during implementation.

---

**Status:** `DONE` — see `modules/notification/docs/MVP/NTF-1_MODULE_SCAFFOLDING.md`
**Type:** New Feature
**Depends on:** `C3` (`modules/common` — generic transactional-outbox mechanism)

**Delta (2026-08-17):** the Tests line below ("read endpoints reject a deactivated caller") was
scoped out before implementation, confirmed with the user — no endpoint anywhere in this app does
an explicit `isActive` re-check today (CLAUDE.md's U12 gap), and NTF-1 inherits that same gap
rather than being the first module to close it. What actually shipped instead:
`NotificationAccessGateIntegrationTest` (owner/non-owner/nonexistent/unauthenticated coverage for
`markAsRead`'s ownership gate). `entityId` also ended up a plain `String`, not implied by this
ticket's original text — `Post`/`Group`/`Session` use `Long` ids, `FriendRequest`/`Friendship` use
`UUID`, so a typed FK-like column wasn't viable across the entity types this can point at.

New `notification-api` (service interface + read-side DTOs) and `notification-impl` modules,
following the existing `-api`/`-impl` split convention.

**`Notification` entity** — replaces the dead `V005` `notifications` table (zero owning code today;
FKs reference `users(id)` directly, violating the ID-only cross-domain rule; `type`/`entity_type`
hardcoded to a stale enum). New migration drops the old table and creates a domain-owned
replacement:

- `id`, `recipientUserId` (UUID, no FK), `type`, `entityType`, `entityId` (ID-only, no FK)
- `actorIds` (bounded list, last 3 — the "X, Y and N others" data), `actorCount`
- `isRead` (boolean), `createdAt`, `updatedAt`

**Aggregation logic:** upsert keyed on `(recipientUserId, type, entityType, entityId)` where
`isRead = false` — bump `actorCount`/`actorIds`/`updatedAt` on a match; insert a new row otherwise.
Marking a row read closes that aggregation group; the next matching event starts a fresh row.

**Endpoints** (`ApiResponse<T>`, `ROLE_USER`, same `isActive` gating as every other authenticated
endpoint):
```
GET  /api/notifications                paginated, newest first
GET  /api/notifications/unread-count
PUT  /api/notifications/{id}/read
```

**Tests:** aggregation upsert (unread match bumps existing row; read row + new event starts a new
row); pagination/ordering. ~~read endpoints reject a deactivated caller~~ — see Delta above.

---
