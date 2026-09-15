# CLAUDE.md — session-impl

Scheduled sports activities — group-linked (owner/admin-gated) or standalone (open to any user).
Always references a `Location` (`modules/location`) by id; never carries its own raw location
fields. See `modules/location/location-impl/CLAUDE.md` for that side of the boundary.

## Dependencies

| From | Why |
|---|---|
| `modules/session/session-api` | SessionService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| `modules/social/group-api` | Permission checks (`canManageMembers`/`isGroupMember`), `getGroup` for private-group visibility |
| `modules/social/post-api` | Originally needed only because `group-api`'s `GroupResponse` references `PostResponse` (pinned posts). SESSION-10 gave it a second, real reason: `createSession` calls `PostService.createSessionPost` inline to create each session's companion `SESSION_POST`, and the comment-proxy methods (`createSessionComment` etc.) call `CommentService`'s bypass methods. Plain `@RequiredArgsConstructor` — no `@Lazy` needed, since `post-impl` has no dependency back on this module (unlike `group-impl`'s `postService` field, which mirrors a real bidirectional dependency with `post-impl`) |
| `modules/user/user-api` | Batch `UserService.getUsersByIds` — creator/participant enrichment |
| `modules/sport/sport-api` | Batch `SportService.getSportsByIds` — `sportName` enrichment |
| `modules/location/location-api` | Batch `LocationService.getLocationsByIds`/single `getLocation` — location enrichment + sport-match validation |

## Key Classes

| Class | Purpose |
|---|---|
| `Session` | `groupId` nullable (null = standalone), `postId` (NOT NULL, unique, no DB FK — SESSION-10, id of the companion `SESSION_POST` in `post-impl`, created synchronously by `createSession`), `sessionType` discriminator, `locationId` (NOT NULL, references `locations`), `locationNote` (nullable free text, e.g. "Court 3" — scoped to this session, never written back to the shared `Location`), `status` (`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`), `cancelReason`/`cancelledBy`/`cancelledAt` (set only by `cancelSession`) |
| `SessionParticipant` | Join/leave; row kept (status flipped) on leave, not deleted |
| `SessionServiceImpl` | All business rules below; batch-resolves creator/sport/location/participant-count/cancelledBy in `mapToResponses` — never per-row |
| `SessionGenerationService` | Internal only (not on `session-api`) — drives `SCHEDULED`→`ONGOING`→`COMPLETED` automatically, generates the next recurring occurrence. See SESSION-2 in `docs/BACKLOG_MVP.md`. SESSION-18: `startOngoingSessions` also writes one `session.status.started` outbox row per session it starts, via `SessionOutboxWriter` — the first outbox event with no real actor (a scheduled job, not a user, made the transition), so its payload DTO carries no `actorId`. |
| `SessionGenerationJob` | `@Scheduled`: hourly `generateUpcomingSessions`; every-15-min `startOngoingSessions` and `closePastSessions` |
| System comments (SESSION-21) | No new class — `SessionServiceImpl`'s private `writeSystemComment`/`resolveParticipantName` and one batched call in `SessionGenerationService.startOngoingSessions`, both delegating to `post-api`'s `CommentService.createSystemSessionComment(s)`. See business rule 9 |
| `SessionOutboxWriter` | SESSION-18 — shared `session_outbox_events` row builder/writer, extracted from `SessionServiceImpl`'s own private methods (SESSION-15) once `SessionGenerationService` became a second writer. Both services inject it. |
| `SessionGate` (`access/`) | `ResourceGate<Session>` (SESSION-10) — the sole gate on a session's comment thread *and* its own like; `post-impl` never checks (its own `PostGate` makes `SESSION_POST` unconditionally unavailable). Same shape as `post-impl`'s `PostGate`, no shared logic |

## Endpoints

```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{sessionId}               ROLE_USER (SESSION-9: caller id now threaded through for callerParticipation)
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced via GroupService.getGroup
GET    /api/sessions/upcoming                 paginated (SESSION-27) — JOINED/INVITED, status PREPARING/SCHEDULED/ONGOING, standalone or group-linked; optional date; scheduledStart ASC + PREPARING->SCHEDULED->ONGOING tiebreak, caller's own Pageable sort ignored
GET    /api/sessions/history                  paginated (SESSION-27) — exactly one of date (JOINED-only, CANCELLED/COMPLETED, scheduledStart DESC) or dateCount (distinct history dates + counts, before cursor)
GET    /api/sessions/discover                 paginated (SESSION-25) — standalone, PREPARING/SCHEDULED/ONGOING (default all three) sessions gated to the caller's active sport profiles, excluding sessions they created or joined; optional title/locationId/minOpenSlots/feeType/maxFeeAmountVnd/date/startTimeFilter+startTime/status filters, all AND-combined; scheduledStart >= now() default lower bound unless date/startTimeFilter narrows it; scheduledStart ASC + open-slots ASC + createdAt ASC sort, caller's own Pageable sort ignored
PUT    /api/sessions/{sessionId}               creator (standalone) or owner/admin (group)
POST   /api/sessions/{sessionId}/cancel        same gating; soft — sets status=CANCELLED, never deletes; rejected if already COMPLETED/CANCELLED
POST   /api/sessions/{sessionId}/join          rejected if the session is CANCELLED
DELETE /api/sessions/{sessionId}/leave         JOINED->LEFT, or INVITED->LEFT ("decline")/REQUESTED->LEFT ("cancel my request") — SESSION-9
GET    /api/sessions/{sessionId}/participants  paginated, JOINED-only
GET    /api/sessions/{sessionId}/comments                      participant or group-member (SESSION-10) — see SessionGate
POST   /api/sessions/{sessionId}/comments                      same gating
POST   /api/sessions/{sessionId}/comments/{commentId}/like      same gating
DELETE /api/sessions/{sessionId}/comments/{commentId}/like      same gating
POST   /api/sessions/{sessionId}/like                           same gating — likes the SESSION_POST anchor itself
DELETE /api/sessions/{sessionId}/like                           same gating
```

**Auth-extraction convention:** every endpoint in this controller uses `@PreAuthorize
("hasRole('USER')")` + `Authentication authentication` + `SecurityUtils.extractUserId(authentication)`
— uniform across the whole file, unlike `PostController`'s mixed convention (A1: `@AuthenticationPrincipal`
for "MY OWN"/mutation endpoints, `Authentication`+`SecurityUtils` for "viewing a resource by id"
ones). `@PreAuthorize` and the extraction mechanism are orthogonal — the former is an AOP gate
evaluated *before* the method runs (throws 403 if the caller lacks `ROLE_USER`), the latter is just
how the method reads the already-authenticated principal — so combining
`@PreAuthorize("hasRole('USER')")` with `Authentication`/`SecurityUtils.extractUserId()` instead of
`@AuthenticationPrincipal` is a deliberate, valid choice here for one canonical extraction path
across the file, not a workaround. `@PreAuthorize("hasRole('USER')")` is currently redundant with
`SecurityConfig`'s global `.anyRequest().authenticated()` (every authenticated user gets `ROLE_USER`
today, no separate ADMIN/VENDOR role wired into JWTs yet) but kept everywhere as an explicit,
self-documenting gate per the existing `PostController` precedent.

Deleting a session comment has no proxy endpoint here — `DELETE /api/posts/comments/{commentId}`
(post-impl) already works unchanged, since `deleteComment` was never gated by `PostGate` (it's
ownership-only), so there's nothing this module needs to wrap.

## Run Tests

```bash
./gradlew :modules:session:session-impl:test
```

## Key Business Rules (enforced in `SessionServiceImpl`)

1. `groupId` present → `sportId` inherited from the group if omitted, `sessionType` =
   `GROUP_RECURRING`, requires `groupService.canManageMembers`. `groupId` null → `sportId`
   required in the request, `sessionType` = `STANDALONE`, open to any `ROLE_USER`.
2. `locationId` is optional at creation (SESSION-24) — when supplied, its `Location.sportId` must
   equal the session's resolved `sportId` (a mismatch is a `BadRequestException`, not silently
   allowed); when omitted (along with `feeType`, also now optional), the session starts
   `PREPARING` instead of `SCHEDULED`. See rule 10 below and `SessionStatus`'s own Javadoc for the
   full `PREPARING` lifecycle.
3. `joinSession` rejects a `CANCELLED` session outright, then (for `GROUP_RECURRING` only)
   requires `groupService.isGroupMember`; `STANDALONE` is otherwise open. It upserts — an
   existing `LEFT` row flips back to `JOINED` rather than inserting a duplicate (the unique
   constraint on `(session_id, user_id)` is the backstop).
4. `cancelSession` rejects `status IN (COMPLETED, CANCELLED)` — a soft action, the row is kept
   with `status=CANCELLED` plus `cancelReason`/`cancelledBy`/`cancelledAt`; there is no hard
   delete anywhere in this service.
5. `getGroupSessions` calls `groupService.getGroup(groupId, currentUserId)` first — this reuses
   the *existing* private-group membership gate rather than reimplementing it.
6. **SESSION-10:** `createSession` calls `postService.createSessionPost(userId, "Session: " + title)`
   inline, before persisting the `Session`, in the same `@Transactional` method — a post-creation
   failure rolls back the whole session creation. The returned id becomes `Session.postId`.
   Comments are `post-impl`'s real `Comment` entity, reused via `CommentService`'s bypass methods
   (`createSessionComment` etc., which skip `post-impl`'s own `PostGate`) — but the client only
   ever calls **this module's** `GET/POST /api/sessions/{sessionId}/comments` endpoints, never
   `post-impl`'s directly (those 404 unconditionally for a `SESSION_POST`, for every caller).
   `SessionServiceImpl`'s comment-proxy methods gate via `SessionGate.require(session, callerId,
   ...)` (participant status, widened to group membership for a group-linked session) before
   delegating — this module is the **only** place that check happens. The same shape extends to
   `likeSession`/`unlikeSession` (liking the `SESSION_POST` anchor itself, delegating to `PostService
   .likeSessionPost`/`unlikeSessionPost`) — both share the private `requireSessionAccess` helper
   with the comment-proxy methods. See `modules/session/docs/MVP/SESSION-10_SESSION_POST_COMMENTS.md`.
7. **SESSION-9:** every `SessionResponse`-returning method resolves `callerParticipation` — the
   caller's own `SessionParticipant` row for that session (null if none), batch-resolved in
   `mapToResponses` via `findBySessionIdInAndUserId`. Drives the client's action button
   (Join/Accept/Decline/Cancel/Leave) on both the session card and `SessionDetailModal`. `null`
   userFullName/userAvatarUrl inside it are intentional — it's always the caller's own identity,
   which the client already has. `leaveSession` doubles as decline/cancel for this reason — see
   its Javadoc.
8. **SESSION-14:** `leaveSession` rejects a **standalone** session's own creator
   (`BadRequestException`) — they're auto-`JOINED` at creation (`createSession`'s seed-participant
   block) but have no way out via this endpoint; `cancelSession` is the only way to relinquish a
   standalone session they created. Not enforced for a group-linked session's creator — they aren't
   auto-joined, and `joinSession` never blocks them from joining like a normal member, so they can
   leave like one too if they choose to join.

9. **SESSION-21:** every path that produces a genuine **`JOINED`** transition (`joinSession`'s
   auto-approve/INVITED branch, `approveParticipant`), a genuine **`JOINED`→`LEFT`** one
   (`leaveSession`), or a **`SCHEDULED`→`ONGOING`** one (`SessionGenerationService
   .startOngoingSessions`) must also write a system comment into the session's thread, via
   `CommentService.createSystemSessionComment`/`createSystemSessionComments`. Flagged here the same
   way `group-impl/CLAUDE.md`'s rule 7 flags B9's welcome post, so a future new join/leave
   mechanism doesn't silently skip it. Three things are load-bearing: the entry is authored by
   `session.getCreatedBy()` (never the participant it's about — a system comment has no real
   author, and `comments.user_id` is NOT NULL); it must **not** emit `session.comment.created`
   (each of the three moments already notifies via its own event, so a comment notification would
   double-ping); and it fires only on a *genuine* transition, matching the outbox events'
   existing guards exactly (SESSION-16's already-`JOINED` early return, SESSION-19's
   `JOINED`-only leave). Batch call sites use `createSystemSessionComments` — one query and one
   `saveAll` for the whole batch, never a call per session.

10. **SESSION-24 — `PREPARING` status.** `locationId`/`feeType` are the only fields
    `updateSession` allows changing while the session is `PREPARING`; once genuinely `SCHEDULED`
    (or beyond), both are immutable via this endpoint — a request touching either while not
    `PREPARING` is a `BadRequestException`, checked before any field is applied. Completing both
    flips the session to `SCHEDULED`; completing only one leaves it `PREPARING`. A `PREPARING`
    session is fully joinable — identical to `SCHEDULED` everywhere else (join/leave/comment/like,
    and `SessionEventsConsumer.ACTIVE_SESSION_STATUSES` in `notification-impl`). If
    `scheduledStart` passes while still `PREPARING`, `SessionGenerationJob.cancelUnpreparedSessions`
    auto-cancels it (no real actor, `cancelledBy` stays null) — see that job's Javadoc. Every
    successful `updateSession` call (regardless of which field changed) also fans out a
    `session.details.updated` notification to the session's currently-`JOINED` participants.
11. **Session filtering — check on every `Session` field change.** Whenever a field is added to
    `Session` (schema, entity, or `Create`/`UpdateSessionRequest`), check whether
    `GET /api/sessions/discover`'s search/filter query params (SESSION-25, and its follow-ups)
    need a corresponding filter — a new session attribute a caller would plausibly want to narrow
    Discover results by shouldn't require rediscovering this gap from scratch each time a field is
    added. Not every field needs one (e.g. `postId`, audit columns) — the test is "would a caller
    browsing Discover plausibly want to filter/search by this?", not "does every column need one."
    SESSION-24's own `PREPARING` status is the concrete example that prompted this rule: adding a
    field can also mean an existing filter (here, `/discover`'s status inclusion) needs revisiting,
    not just that a new filter param is needed.
12. **SESSION-27 — `/upcoming`/`/history` replace `/mine`, and their sort is non-negotiable.**
    Both are scoped by the caller's own `SessionParticipant` row (`JOINED`/`INVITED` for upcoming,
    `JOINED`-only for history), not `createdBy` — unlike the removed `/mine`, a group-linked
    session is included exactly like a standalone one. `getUpcomingSessions`/`getSessionHistory`
    both strip any client-supplied `Pageable.sort` down to just `page`/`size` before querying (see
    `SessionServiceImpl.unsorted`) — the static `ORDER BY` in `SessionRepository.findUpcomingSessions`
    et al. (`scheduledStart ASC`, then a `PREPARING`→`SCHEDULED`→`ONGOING` tiebreak for `/upcoming`;
    `scheduledStart DESC` for `/history`) is not caller-overridable, since this ticket exists
    specifically because `/mine`'s old implicit, unrequested ordering silently dropped sessions past
    page 0. `GET /api/sessions/history?dateCount=` is pagination over **distinct dates**, not
    sessions — its own repository method (`findHistoryDateCounts`) is this module's second native
    query (`ProcessedMessageRepository.insertIfAbsent` in `notification-impl` is the first;
    `GROUP BY`/`LIMIT` on a date cast has no portable JPQL form).

## Gotchas

- `SessionType.TOURNAMENT`/`TRAINING` are reserved enum values with **no** supporting logic —
  don't build features against them without a real design pass first.
- `CANCELLED` has **no** notification/cleanup flow attached (e.g. joined participants aren't
  told) — cancelling only changes the row's own status/audit fields.
- A session with no `scheduledEndAt` **skips `ONGOING` entirely** — `findSessionsToStart` never
  matches it (a null `scheduledEndAt` fails the `> :now` comparison in JPQL), so it goes straight
  `SCHEDULED` → `COMPLETED` once `scheduledStart` passes, same as before this lifecycle existed.
- `GET /api/sessions/mine`/`getSessionsCreatedByUser` (standalone-only, creator-scoped) was
  **removed** by SESSION-27 in favor of `getUpcomingSessions`/`getSessionHistory(Dates)`, both
  participant-scoped (own `SessionParticipant` row, not `createdBy`) and covering standalone +
  group-linked alike. A group owner/admin's group-linked sessions they manage but never personally
  joined are still not covered by either — same pre-existing gap SESSION-27 flagged rather than
  fixed; still visible via `getGroupSessions`.
- Recurrence/auto-generation does **not** live in `SessionServiceImpl` — it's
  `SessionGenerationService`/`SessionGenerationJob` (SESSION-2), which never re-validates a
  `recurrenceLocationId`'s sport match — that's checked once when the group's recurrence is
  configured (`GroupServiceImpl.updateGroupRecurrence`), not on every generated occurrence.
- `SchedulingConfig` (`@EnableScheduling`) lives in `server/src/main/java/com/sportconnect/config/`,
  not in this module — app-wide `@EnableX` toggles are bootstrap-level config owned by the
  assembly module, while the `@Scheduled` job class itself lives here.
- `SessionGenerationService.generateUpcomingSessions()` always computes exactly the single next
  occurrence (`TemporalAdjusters.nextOrSame`, rolling forward a week if today's slot already
  passed) — there's no "generate N weeks ahead" window, by design.
- **A JPQL `(:param IS NULL OR ...)` optional-filter clause needs the `IS NULL` side cast too**
  (`CAST(:param AS <type>) IS NULL`, not bare `:param IS NULL`) — `SessionRepository
  .findDiscoverSessions` (SESSION-25) hit `"ERROR: could not determine data type of parameter $N"`
  against real Postgres for its `LocalDateTime` lower-bound param with only the comparison side
  cast; the `GroupRepository.searchPublicGroupsWithCounts` precedent this pattern is copied from
  happens not to trip it for its `String` param (verified live — temporal types are apparently a
  sharper edge for Postgres's parameter-type inference than `String`), but that's not a guarantee
  for every type. Only caught by an actual HTTP call against real Postgres — a mock-based Spock
  test proves the service calls the repository correctly, never that the JPQL itself is valid SQL.
  Cast every optional param's `IS NULL` check defensively when adding a new one here (SESSION-26).
- **Never apply a SQL date/time function (`CAST(... AS date/time)`, `EXTRACT(...)`) directly to
  `Session.scheduledStart` (or any `LocalDateTime`-mapped column) in a query — it silently reads
  the wrong value on this app.** This app sets `hibernate.jdbc.time_zone: UTC` (root
  `application.yml`), which shifts every stored `LocalDateTime` by the JVM's default-zone offset
  on write, but that shift is only *reapplied by Hibernate on a plain attribute read* — confirmed:
  `SELECT s.scheduledStart` correctly returns the intended wall-clock value, but
  `EXTRACT(HOUR FROM s.scheduledStart)` on that same row returned a value 7 hours off (this
  ICT/UTC+7 dev host), and `CAST(s.scheduledStart AS date)` on an early-morning session returned
  the **previous** calendar day. Confirmed on both H2 and real Postgres, and via a raw native
  query bypassing Hibernate entirely — this is not a Postgres-specific quirk. Found by
  `SessionDiscoverIntegrationTest` while building SESSION-25's `date`/`startTime` discover filters
  (three other time-typed/string-typed comparison strategies were tried first and each failed a
  different way — full history in `SessionRepository.findDiscoverSessions`'s Javadoc); a
  **pre-existing, already-shipped instance of the same bug** was found in `findHistoryDateCounts`
  (SESSION-27, a native query) and filed as **SESSION-31**, not fixed inline. The two safe patterns
  in this file: a plain `LocalDateTime`/`LocalDate` comparison (`>=`/`<`/`=` against the bare path
  expression — proven correct, e.g. `findUpcomingSessionsByDate`'s `[dayStart, dayEnd)` range), or,
  when a genuine time-of-day-regardless-of-date comparison is unavoidable, `EXTRACT` combined with
  a `MOD`-based correction using the JVM's current zone offset (see `findDiscoverSessions`'s
  `startTimeBeforeOrEqual`/`startTimeAfterOrEqual` clauses) — never a bare `CAST`/`EXTRACT` result
  compared directly.
