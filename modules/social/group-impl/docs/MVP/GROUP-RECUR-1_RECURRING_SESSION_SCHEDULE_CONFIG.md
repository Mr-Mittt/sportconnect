# GROUP-RECUR-1 · Recurring-session schedule config

**Status:** `DONE`
**Type:** Feature (part of a larger effort — see `documentation/md/SESSION_LOCATION_DESIGN.md`)
**Scope:** `Group` entity (+4 nullable structured recurrence fields, `schedule` TEXT untouched),
`GroupSettings.autoGenerateSessions`, three new `GroupService` methods
(`getGroupRecurrence`/`updateGroupRecurrence`/`getGroupsWithAutoGenerateSessionsEnabled`),
`GET`/`PUT /api/groups/{groupId}/recurrence`, migrations V033–V034.

Adds a structured, machine-readable recurring-session rule to `Group` (day-of-week, time,
duration, `recurrenceLocationId`) alongside the existing free-text `schedule` — `schedule` stays
as owner-editable prose, these new fields are what the session-generation job (SESSION-2, not yet
built — see `modules/session/docs/BACKLOG_MVP.md`) reads. `updateGroupRecurrence` validates (via
a new, narrow `location-api` dependency) that `recurrenceLocationId`'s sport matches the group's
`sportId` — the same sport-match rule `SessionServiceImpl` enforces at session creation, just
checked once at configuration time. `getGroupsWithAutoGenerateSessionsEnabled` is internal-only
(not exposed via the controller), batch-resolves groups + owners in two queries (no N+1) via a
new `GroupMemberRepository.findByGroupIdInAndRoleId` batch method.

---
