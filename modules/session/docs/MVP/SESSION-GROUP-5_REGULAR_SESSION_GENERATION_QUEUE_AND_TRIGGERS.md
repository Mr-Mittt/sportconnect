# SESSION-GROUP-5 · Regular group sessions: the generation queue, its triggers and retry

**Status:** `TODO`
**Type:** New Feature (replaces SESSION-38's generation) · **Depends on:** SESSION-GROUP-1, SESSION-GROUP-4
**Filed:** 2026-11-19, from the owner's specification ("Generation"). Closes **SESSION-41** (the retry/backstop gap) and supersedes the single-rule path of SESSION-38.

**Data** (one changelog):
- `sessions` gains `recurrence_id` (null = custom session) and `occurrence_date` (the local date of the slot). A partial unique index `(recurrence_id, occurrence_date) WHERE recurrence_id IS NOT NULL` is the duplicate guard that replaces the dropped `unique_group_session_start`.
- `group_session_generation_queue`: `id`, `recurrence_id`, `target_start` (instant, orders the queue), `status` PENDING|DONE|FAILED, `attempts`, `next_attempt_at`, `last_error`, timestamps; unique `(recurrence_id, target_start)`.

**Time model (owner, 2026-11-19).** A config is a wall-clock slot read in the **location's timezone**. The session is saved as a UTC instant plus the location's timezone (as a standalone session); "today", "nearest day" and "already ended" are judged on that wall clock; UTC is only the stored form and the queue order. A monthly config on a day the month lacks (29 to 31) **skips that month**.

**Resolver.** An event listener drains the queue ordered by `target_start`; each item runs `REQUIRES_NEW` so one failure cannot poison another. It reuses `SessionGenerationService`'s title, companion post (`createSessionPost`) and author (the group's current owner) code, and fills the session from the config (fee, location, duration, game mood, attributes, `autoApprove = true`, `isPublic = false`, the audience snapshot). Status by the clock: `SCHEDULED` when the start is ahead, `ONGOING` when now is inside the slot, **skipped** when the slot has already ended. Retry: up to 5 attempts, backoff 1, 5, 15, 60 minutes, then `FAILED` (kept for inspection; the startup job and the next trigger re-queue a group's nearest day, so a `FAILED` item never strands a group). The audience is notified with `session.group.created` at generation (all members or the config's specific ones, active members only; a member who left is filtered out at that moment).

**Producers** (only for a group that is ON, using non-draft configs of the active mode):
1. **Startup** (`ApplicationReadyEvent`, down-time recovery): for each such group, push the configs of the nearest day (including today's not-yet-ended slots); if anything was pushed, fire the resolver.
2. **The last regular session of a day** reaching `COMPLETED` or `CANCELLED` (`closePastSessions` and `cancelSession`): "last" = no other regular session of that group with the same `occurrence_date` is `PREPARING`, `SCHEDULED` or `ONGOING`; push the next nearest day. **Custom sessions never trigger.** A cancel while the group is **OFF** (or the config deleted or inactive) triggers nothing, so "cancel everything" cannot regenerate.
3. **Owner/admin actions** ON, add a config, edit a config, switch mode: generate today's slots not yet ended now; then for the nearest configured day, if a regular `SCHEDULED`/`ONGOING` session exists between now and that day let it trigger generation, otherwise enqueue.

**Concurrency (the spec's "2check").** Producers 1 and 2 can race for the same slot; both go through the queue's unique key and the sessions' `(recurrence_id, occurrence_date)` key, so the loser is a no-op. Prove it with a two-thread IT.

**Replaces.** `GroupServiceImpl.triggerSessionGenerationIfEligible` and its two calls, the single-rule branch of `SessionGenerationService`, `SessionGenerationJob`'s generation part (the 15-minute status jobs stay). The old columns remain until GROUP-1, but nothing reads them after this ticket. Existing generated sessions stay as custom sessions (no `recurrence_id`).

**Open at pickup:** a deactivated owner (the author): proposal, skip and log, because the generator acts as the owner (new-interaction rule). **Account lifecycle:** no endpoint added; the producers run in the owner/admin request or as jobs.

**Consumer census:** `SessionGenerationService`, `SessionGenerationJob`, `GroupServiceImpl` trigger calls, `GroupSessionGenerationIntegrationTest` and the failure-isolation IT (rewritten), `closePastSessions`, `cancelSession`, SESSION-38/41 tickets, `session-impl/CLAUDE.md` (stale hourly-job text), `NOTIFICATION_USE_CASES.md`.

**Tests:** Spock for the occurrence maths (weekly, monthly, skipped months, timezone edges, today's ongoing and ended slots), the "last of the day" rule, retry/backoff; ITs: startup recovery, completion and cancel triggers, OFF/inactive cancel does not regenerate, the admin actions, the duplicate race, a failure isolated and retried, notification to ALL and SPECIFIC audiences. Mutation check each requirement.

---
