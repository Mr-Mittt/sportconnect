# SESSION-2 · Scheduled auto-generation job

Adds `SchedulingConfig` (`@EnableScheduling`, in `server/`, sibling to the existing
`AsyncConfig`), `SessionGenerationService` (internal, not exposed via `session-api` — generates
the single next occurrence per group with `autoGenerateSessions` enabled via
`GroupService.getGroupsWithAutoGenerateSessionsEnabled()`, copying `recurrenceLocationNote` into
the new `Session.locationNote`, and closes past `SCHEDULED` sessions to `COMPLETED`), and
`SessionGenerationJob` (`@Scheduled`: hourly generate, every-15-min close). No distributed lock
— single-instance deployment today; the `unique_group_session_start` DB constraint is the
idempotency backstop for a race.
