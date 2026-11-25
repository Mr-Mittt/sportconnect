# SESSION-79 · Queue a session for statistics when it completes, and sweep for missed ones only at start-up

**Status:** `TODO`
**Type:** Enhancement (Architecture) · **Depends on:** SESSION-53 (done); touches the same rows as SESSION-75 (pruning), see below
**Filed:** 2026-11-25, `/ticket` from an owner question while reviewing the statistics engine (SESSION-53 / SESSION-78): today every 5-minute nudge runs a query over `sessions` to find completed sessions past the 24-hour guard that have no job row; the owner proposed putting the session in the queue when it completes, and a start-up sweep for what downtime missed.

**Today:** `SessionStatsRunner` first takes due job rows (`RETRY`, `FAILED`, a stale `RUNNING`), then selects `COMPLETED` sessions of sports that have statistics on, with no row in `session_stats_jobs` and `COALESCE(scheduledEndAt, scheduledStart) <= now - 24h`, claims each by an insert and counts it at once. The job row therefore exists only from the moment of counting. Downtime is already covered, because the selection derives from session state, so the first nudge after a restart (at most 5 minutes) picks up everything missed.

**Proposal:**
1. **Queue at completion.** When a session becomes `COMPLETED` (`SessionGenerationService.closePastSessions`, in the same transaction as the status change) insert its job row with a new status `PENDING` and `next_attempt_at = end + 24h` (the end is `COALESCE(scheduledEndAt, scheduledStart)`). The insert is idempotent (the primary key is the session id, a duplicate is absorbed, as `insertClaim` does).
2. **The 5-minute run reads only the job table**: rows `PENDING`, `RETRY`, `FAILED` or a stale `RUNNING` whose `next_attempt_at` has come, through the partial index (extend `idx_session_stats_jobs_due` to include `PENDING`). It no longer queries `sessions`.
3. **A sweep for the rest, run rarely:** at start-up (`ApplicationReadyEvent`, bounded, on the worker thread, never on the startup thread) and when an admin switches a sport's statistics on, it runs today's selection (completed sessions with no job row) and queues them. It is the safety net for every way a session can be `COMPLETED` without the hook: the SESSION-70 import (writes `COMPLETED` directly), sessions completed before this ticket, a failed enqueue, and the old sessions of a sport switched on later.

**What each status means (design review):** `PENDING` = waiting for its 24-hour guard, nothing counted (revivable by nothing, it only moves to `RUNNING`); the others keep their meaning (`RUNNING` claimed, `DONE` counted, `SKIPPED` nothing countable and final, `RETRY` and `FAILED` due again later). A `PENDING` row of a sport whose switch is off at claim time is deleted, as a claimed row of a disabled sport is today (so switching it on later is picked up by the sweep).

**Questions to answer at pickup:**
- **Sports that have statistics off at completion:** enqueue only for enabled sports (then the switch-on sweep is required, as above) or for every sport (then rows pile up for sports that never count, a retention cost, see SESSION-75). The first is proposed.
- **Interaction with SESSION-75 (pruning DONE and SKIPPED rows after about 30 days):** a pruned row leaves a `COMPLETED` session with no job row, which the sweep would select again. The history pointers refuse a second count (`ALREADY_COUNTED`), but the sweep would recreate a job row and a `SKIPPED` or `DONE` result each time; the sweep must stop at the prune horizon (only sessions newer than it) or SESSION-75 must keep a marker. Decide with SESSION-75.
- **Two at once:** the completion hook inserts, the runner claims by compare-and-set (`claimDue`), the sweep inserts idempotently; a runner that finds a `PENDING` row not yet due must not claim it. A session counted by the runner and also swept in the same minute is guarded by the primary key.
- **Failure and visibility:** a failed enqueue inside the completion transaction must not undo the completion (catch and log, the sweep repairs it); a count of swept sessions is logged at INFO.
- **What the tests can prove:** on H2 the status flow, the idempotent insert, the sweep and the disabled-sport deletion; two real instances and the index use on PostgreSQL are not run.

**Edge cases:** a session with no end uses its start for the guard (as today); a session cancelled is never `COMPLETED` and never queued; a deactivated user has no part in this job (no caller); the runner stays bounded (passes of 50, 10 minutes) and on its own thread.

**Out of scope:** pruning (SESSION-75), the rebuild (SESSION-77), the ranking jobs (SESSION-54), changing the 24-hour guard, the group's own switch (SESSION-78).

**Tests:** Spock for the runner (reads only job rows, a not-yet-due `PENDING` row left alone, the sweep queues missed sessions once); an integration test through the real `closePastSessions` (a completed session gets a `PENDING` row with the right `next_attempt_at`, counted after the guard, a repeated completion adds no second row, a disabled sport's row is deleted, the sweep finds an imported `COMPLETED` session); mutation check per rule; update `BACKGROUND_JOBS.md` and rule 22 of `session-impl/CLAUDE.md`.
