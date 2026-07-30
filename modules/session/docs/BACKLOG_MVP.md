# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-07-30

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | SESSION-1 | Session domain core — manual create/join/leave, group or standalone | `DONE` |
| 2 | SESSION-2 | Scheduled auto-generation job for group-recurring sessions | `DONE` |
| 3 | SESSION-3 | Full status lifecycle (ONGOING, CANCELLED) + cancel reason/who/when | `DONE` |

---

## SESSION-1 — Session domain core (manual only)

New `modules/session` domain. A `Session` is a scheduled sports activity — group-linked
(`groupId` set, owner/admin-gated) or standalone (`groupId` null, open to any user). Always
references a `Location` (`modules/location`) by id, validated to be for the same sport as the
session, plus an optional free-text `locationNote` (e.g. "Court 3") scoped to the session itself.
Minimal `SessionParticipant` join/leave. Deliberately excludes recurrence/auto-generation — see
SESSION-2. See `documentation/md/SESSION_LOCATION_DESIGN.md` for the full design context.

**Endpoints:**
```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{id}
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced
GET    /api/sessions/mine                     paginated, caller's standalone sessions
PUT    /api/sessions/{id}                     creator (standalone) or owner/admin (group)
POST   /api/sessions/{id}/cancel               same gating; soft — see SESSION-3
POST   /api/sessions/{id}/join
DELETE /api/sessions/{id}/leave
GET    /api/sessions/{id}/participants        paginated, JOINED-only
```

**Deferred (not part of SESSION-1):** recurrence/auto-generation (SESSION-2), full status
lifecycle/cancellation (SESSION-3), `TOURNAMENT`/`TRAINING` session types (enum values reserved
only), session capacity/waitlist, geo-proximity/nearby session search.

## SESSION-2 — Scheduled auto-generation job

Adds `SchedulingConfig` (`@EnableScheduling`, in `server/`, sibling to the existing
`AsyncConfig`), `SessionGenerationService` (internal, not exposed via `session-api` — generates
the single next occurrence per group with `autoGenerateSessions` enabled via
`GroupService.getGroupsWithAutoGenerateSessionsEnabled()`, copying `recurrenceLocationNote` into
the new `Session.locationNote`, and closes past `SCHEDULED` sessions to `COMPLETED`), and
`SessionGenerationJob` (`@Scheduled`: hourly generate, every-15-min close). No distributed lock
— single-instance deployment today; the `unique_group_session_start` DB constraint is the
idempotency backstop for a race.

## SESSION-3 — Full status lifecycle (ONGOING, CANCELLED)

`SessionStatus` gains `ONGOING` (automatic, via `SessionGenerationJob.startOngoingSessions`,
every 15 min — `SCHEDULED` → `ONGOING` once `scheduledStart` arrives, only for sessions with a
`scheduledEndAt`; no-duration sessions skip straight to `COMPLETED` as before) and `CANCELLED`
(manual only, via the new `POST /api/sessions/{id}/cancel`, same creator/owner-admin gating as
`updateSession`). `Session` gains `cancelReason` (optional free text), `cancelledBy`,
`cancelledAt`. **`deleteSession`/`DELETE /api/sessions/{id}` was removed entirely** — cancel is
now the only way to remove a session from active use, always soft (row kept). `joinSession`
rejects joining a `CANCELLED` session. No notification/cleanup flow on cancel (joined
participants aren't told) — not requested, not built.
