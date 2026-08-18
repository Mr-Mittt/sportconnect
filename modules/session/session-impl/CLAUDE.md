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
| `SessionGenerationService` | Internal only (not on `session-api`) — drives `SCHEDULED`→`ONGOING`→`COMPLETED` automatically, generates the next recurring occurrence. See SESSION-2 in `docs/BACKLOG_MVP.md`. |
| `SessionGenerationJob` | `@Scheduled`: hourly `generateUpcomingSessions`; every-15-min `startOngoingSessions` and `closePastSessions` |
| `SessionGate` (`access/`) | `ResourceGate<Session>` (SESSION-10) — the sole gate on a session's comment thread *and* its own like; `post-impl` never checks (its own `PostGate` makes `SESSION_POST` unconditionally unavailable). Same shape as `post-impl`'s `PostGate`, no shared logic |

## Endpoints

```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{sessionId}               ROLE_USER (SESSION-9: caller id now threaded through for callerParticipation)
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced via GroupService.getGroup
GET    /api/sessions/mine                     paginated — caller's STANDALONE sessions only (not group ones they created)
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
2. `locationId` is always required and its `Location.sportId` must equal the session's resolved
   `sportId` — a mismatch is a `BadRequestException`, not silently allowed.
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

## Gotchas

- `SessionType.TOURNAMENT`/`TRAINING` are reserved enum values with **no** supporting logic —
  don't build features against them without a real design pass first.
- `CANCELLED` has **no** notification/cleanup flow attached (e.g. joined participants aren't
  told) — cancelling only changes the row's own status/audit fields.
- A session with no `scheduledEndAt` **skips `ONGOING` entirely** — `findSessionsToStart` never
  matches it (a null `scheduledEndAt` fails the `> :now` comparison in JPQL), so it goes straight
  `SCHEDULED` → `COMPLETED` once `scheduledStart` passes, same as before this lifecycle existed.
- `getSessionsCreatedByUser` (`GET /api/sessions/mine`) only returns **standalone** sessions
  (`findByCreatedByAndGroupIdIsNull`) — a group owner's group-linked sessions are visible via
  `getGroupSessions` instead, not here.
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
