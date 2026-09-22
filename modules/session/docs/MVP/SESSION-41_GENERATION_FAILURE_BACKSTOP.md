# SESSION-41 · No retry/backstop for a failed eager group-session generation attempt

**Status:** `TODO`
**Type:** Enhancement (Reliability)
**Depends on:** SESSION-38 (`IN PROGRESS`) — this ticket exists because of a gap SESSION-38's
design deliberately accepts, not a bug in it.
**Filed:** 2026-09-21, user request during SESSION-38's pickup.

SESSION-38 replaces the hourly full-group-scan sweep with three direct triggers (session
completion, `updateGroupRecurrence`, `updateGroupSettings`). Each trigger's generation attempt is
**failure-isolated** — a transient error (e.g. a `LocationService` lookup failure) is logged and
the enclosing request/job continues, on purpose, so a generation-side problem never rolls back a
group owner's settings save or blocks the completion job's other work.

The real cost of that isolation: **there is no periodic sweep left to retry a missed group.**
Before SESSION-38, the old hourly job would eventually notice a group missing its next occurrence
and pick it back up on its very next run (worst case, up to an hour later). After SESSION-38, if
the one eager attempt for a given group fails, that group's next occurrence may never get generated
until *some* other trigger fires for it again — another one of its sessions completing (which won't
happen if there's no scheduled session to complete), or the owner happening to touch the recurrence
config or settings again. For a group whose owner never revisits either screen, this could be an
indefinite silent gap.

## Scope

Not decided at filing time — needs a real design pass, not a guess. Candidates to evaluate at
pickup (not a commitment to any of them):

- A much-lower-frequency reconciliation sweep (e.g. daily, not hourly) that only catches groups
  with auto-generate enabled and no next occurrence yet — a narrow safety net, not a reintroduction
  of the removed hourly full-scan.
- Retry via the existing `session_outbox_events`-style pattern this domain already uses for
  at-least-once delivery elsewhere (SESSION-15/18), if a retry-with-backoff shape fits better than a
  scheduled reconciliation pass.
- Just alerting/observability (a log-based metric or alert on a failed generation attempt) without
  automatic retry, if manual follow-up is judged sufficient given how rare a `LocationService`
  failure actually is in practice.

## Out of scope

Re-adding the removed hourly full-group-scan sweep itself (SESSION-38 explicitly removed it as
wasteful, redundant work) — any backstop here must be narrower than that.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
