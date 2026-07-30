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
| `modules/social/post-api` | Not used directly — needed only because `group-api`'s `GroupResponse` references `PostResponse` (pinned posts) and `group-api` doesn't expose that dependency transitively (`implementation`, not `api`); Groovy's compiler needs it resolvable to compile Spock specs against `GroupResponse` |
| `modules/user/user-api` | Batch `UserService.getUsersByIds` — creator/participant enrichment |
| `modules/sport/sport-api` | Batch `SportService.getSportsByIds` — `sportName` enrichment |
| `modules/location/location-api` | Batch `LocationService.getLocationsByIds`/single `getLocation` — location enrichment + sport-match validation |

## Key Classes

| Class | Purpose |
|---|---|
| `Session` | `groupId` nullable (null = standalone), `sessionType` discriminator, `locationId` (NOT NULL, references `locations`), `locationNote` (nullable free text, e.g. "Court 3" — scoped to this session, never written back to the shared `Location`), `status` (`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`), `cancelReason`/`cancelledBy`/`cancelledAt` (set only by `cancelSession`) |
| `SessionParticipant` | Join/leave; row kept (status flipped) on leave, not deleted |
| `SessionServiceImpl` | All business rules below; batch-resolves creator/sport/location/participant-count/cancelledBy in `mapToResponses` — never per-row |
| `SessionGenerationService` | Internal only (not on `session-api`) — drives `SCHEDULED`→`ONGOING`→`COMPLETED` automatically, generates the next recurring occurrence. See SESSION-2 in `docs/BACKLOG_MVP.md`. |
| `SessionGenerationJob` | `@Scheduled`: hourly `generateUpcomingSessions`; every-15-min `startOngoingSessions` and `closePastSessions` |

## Endpoints

```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{sessionId}
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced via GroupService.getGroup
GET    /api/sessions/mine                     paginated — caller's STANDALONE sessions only (not group ones they created)
PUT    /api/sessions/{sessionId}               creator (standalone) or owner/admin (group)
POST   /api/sessions/{sessionId}/cancel        same gating; soft — sets status=CANCELLED, never deletes; rejected if already COMPLETED/CANCELLED
POST   /api/sessions/{sessionId}/join          rejected if the session is CANCELLED
DELETE /api/sessions/{sessionId}/leave
GET    /api/sessions/{sessionId}/participants  paginated, JOINED-only
```

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
