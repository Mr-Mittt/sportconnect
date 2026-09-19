# SESSION-38 · Group session generation becomes event-driven instead of an hourly job sweep

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none (touches `SessionGenerationService`/`SessionGenerationJob`, both shipped by
SESSION-2 — no other ticket needs to land first)
**Filed:** 2026-09-19, user request — the current job-based design (`SessionGenerationJob`, every
hour, re-scans **every** group with auto-generate enabled regardless of whether that group's next
occurrence was already generated) does real, if cheap, redundant work on every single run
(discussed and confirmed while exploring `SessionGenerationService` for SESSION-36). This ticket
replaces the periodic sweep with direct, event-triggered generation.

Today, `SessionGenerationJob.generateUpcomingSessions()` runs every hour and calls
`SessionGenerationService.generateUpcomingSessions()`, which fetches **every** group with
auto-generate enabled, recomputes `computeNextOccurrence` for each one, and does an
`existsByGroupIdAndScheduledStart` check to decide whether to create a new session — skipping
groups that already have their next occurrence, but still iterating and querying for every one of
them, every hour, forever. This ticket changes the approach: when a `GROUP_RECURRING` session
completes, generate that group's next occurrence **directly, at that moment** — no periodic
sweep, no re-checking groups that don't need anything.

## Scope

1. **Trigger: on completion.** When a `GROUP_RECURRING` session transitions to `COMPLETED` (in
   `SessionGenerationService.closePastSessions`, currently every 15 minutes), immediately generate
   that group's next occurrence in the same flow — this replaces the hourly job's job of
   eventually noticing the occurrence is missing.
   - **No-N+1 concern to resolve at implementation, not now:** `closePastSessions` processes a
     batch of up to 200 sessions per page; generating each completed `GROUP_RECURRING` session's
     next occurrence must batch-resolve recurrence configs/locations for the whole batch, not call
     out once per session.
2. **Trigger: on recurrence configuration.** When a group's recurrence rule is newly created or
   enabled (`GroupServiceImpl.updateGroupRecurrence`, `group-impl`), generate that group's first
   occurrence directly from there, rather than waiting for any job or event to pick it up.
   - **New cross-domain dependency, not existing today:** this requires `group-impl` to call into
     `session-api` for the first time — currently only `session-impl` depends on `group-api`, never
     the other direction. A new `SessionService` (`session-api`) method needs to be added and
     exposed publicly for this; `SessionGenerationService` is entirely internal today (not part of
     `session-api` at all, per its own Javadoc — "not exposed via session-api").
   - **New `group-api` surface needed too:** `GroupService` only exposes a batch lookup today
     (`getGroupsWithAutoGenerateSessionsEnabled()` — every enabled group at once). A single-group
     recurrence-config lookup doesn't exist yet and needs adding if the event-driven trigger needs
     one (check at pickup whether the completion-trigger path can reuse data already in hand from
     the completing session's own group id, or genuinely needs a fresh per-group lookup).
3. **Remove `SessionGenerationJob.generateUpcomingSessions()` and its `@Scheduled(cron = "0 0 * * * *")`
   entirely** — fully replaced by the two triggers above, no periodic sweep left. The other three
   jobs on that class (`startOngoingSessions`, `closePastSessions`, `cancelUnpreparedSessions`,
   all every 15 minutes) are untouched.
4. **`SESSION-12`'s partial index** (`sessions` scoped to `status = SCHEDULED`, added to speed up
   the generation job's hot queries) may become less relevant once the hourly sweep is gone —
   review at pickup whether it's still earning its keep for the remaining 15-minute jobs, or
   whether it's now dead weight; not assumed either way here.

## Open questions — resolve at pickup, don't guess

- **Cancellation case, explicitly deferred:** does cancelling a `GROUP_RECURRING` session (before
  it completes) also need to trigger "generate the next occurrence now," or does that gap wait for
  whatever the following week's slot would naturally produce? Not decided at filing time — a real
  design call to make before implementing, not to guess at.
- Exact shape of the new `session-api` method `group-impl` will call (name, params, return type)
  and the new `group-api` lookup (if needed) — pick at pickup once the completion-trigger's actual
  data needs are clear.

## Out of scope

Any change to `startOngoingSessions`/`closePastSessions`/`cancelUnpreparedSessions`'s own logic or
schedule beyond adding the new completion-trigger call inside `closePastSessions` — those three
jobs keep running exactly as they do today. Any change to how a **standalone** (non-group) session
is created — this ticket is `GROUP_RECURRING`-only.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
