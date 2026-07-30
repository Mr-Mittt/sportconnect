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
| 2 | SESSION-2 | Scheduled auto-generation job for group-recurring sessions | `TODO` |

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
DELETE /api/sessions/{id}                     same gating; rejected if already COMPLETED
POST   /api/sessions/{id}/join
DELETE /api/sessions/{id}/leave
GET    /api/sessions/{id}/participants        paginated, JOINED-only
```

**Deferred (not part of SESSION-1):** recurrence/auto-generation (SESSION-2), `TOURNAMENT`/
`TRAINING` session types (enum values reserved only), `CANCELLED` status, session
capacity/waitlist, geo-proximity/nearby session search.

## SESSION-2 — Scheduled auto-generation job

Not started. Depends on SESSION-1 (this ticket) and GROUP-RECUR-1
(`modules/social/group-impl/docs/BACKLOG_MVP.md`) both landing first. Adds `SchedulingConfig`
(`@EnableScheduling`, in `server/`), `SessionGenerationService` (generates the single next
occurrence per group with `autoGenerateSessions` enabled, closes past `SCHEDULED` sessions to
`COMPLETED`), and `SessionGenerationJob` (`@Scheduled`, hourly generate / 15-min close).
