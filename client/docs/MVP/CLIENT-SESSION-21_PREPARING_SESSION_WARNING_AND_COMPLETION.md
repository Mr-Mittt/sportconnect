# CLIENT-SESSION-21 · PREPARING-session warning + completion UI

**Status:** `TODO`
**Type:** Client feature
**Depends on:** backend **SESSION-24** — hard.
**Filed:** 2026-09-14, companion to SESSION-24. Notable finding at scoping time: there is **no
edit-session UI at all today** — `useUpdateSession.ts` exists but is unconsumed ("No edit UI
consumes this yet... provided for a follow-up edit-UI ticket to build against"), so this ticket is
the first thing to build against it, scoped narrowly to the `PREPARING`-completion case rather than
a general session editor.

## Scope

1. `CreateSessionModal`: when location and/or fee are left blank at submission (now optional per
   SESSION-24), show a warning (exact copy/placement TBD at pickup) that the session will be
   created as `PREPARING` and needs completing before its start time, or it will be auto-cancelled.
2. A minimal "complete session setup" surface for a `PREPARING` session the caller created —
   likely a banner/section in `SessionDetailModal` (creator-only, shown only when
   `session.status === 'PREPARING'`) with inputs for whichever of location/fee is still missing,
   submitting via the existing (currently unconsumed) `useUpdateSession` hook. Exact placement/
   component shape TBD at pickup — no prior "edit session" UI pattern exists to follow.
3. After a completion update that still leaves one field missing (partial completion — SESSION-24
   keeps the session `PREPARING` until both are set), re-show the same warning reflecting what's
   still outstanding.

**Out of scope:**
- A general session editor for already-`SCHEDULED` sessions — SESSION-24 makes `locationId`/
  `feeType` immutable outside `PREPARING` anyway, so no such editor is implied by this ticket.
- SESSION-25/CLIENT-SESSION-22's search/filter work.

**Tests:** Vitest for the warning component (missing-location / missing-fee / missing-both
states) and the completion form; MSW handler for a `PREPARING` session fixture + the update flow;
`matches-journey` (or a new) e2e covering create-without-location → warning → complete → status
becomes `SCHEDULED`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
