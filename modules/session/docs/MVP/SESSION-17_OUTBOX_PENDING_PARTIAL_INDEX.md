# SESSION-17 · Partial index on `session_outbox_events` scoped to `status = 'PENDING'`

**Status:** DONE
**Module:** `modules/session`
**Migration:** `V056__replace_session_outbox_events_status_index_with_partial.sql`

## Context

Filed while walking through SESSION-15's sequence diagram with the user — asked whether the outbox
table's hot query had a partial index the way `B16`/`SESSION-12` had already established as this
codebase's pattern for exactly this shape of problem. It didn't: SESSION-15's own
`idx_session_outbox_events_status_created` (`V054`) is a full composite index over
`(status, created_at)`, covering every row regardless of status.

`SessionOutboxRelayJob.drain()` is the only reader of this index, and it only ever queries
`status = 'PENDING'` (`SessionOutboxEventRepository.findTop50ByStatusOrderByCreatedAtAsc`). Nothing
deletes or archives `SENT` rows, so the table's `SENT` history grows unbounded for as long as the
app runs, while the `PENDING` slice stays near-empty in steady state — cleared within one 10s relay
tick under normal operation. A composite index that includes every historical `SENT` row keeps
growing right along with the table, even though the relay never looks at any of them.

## What was built

One Liquibase changeset, `V056__replace_session_outbox_events_status_index_with_partial.sql`,
registered in `db.changelog-master.xml`:

```sql
DROP INDEX idx_session_outbox_events_status_created;

CREATE INDEX idx_session_outbox_events_pending_created ON session_outbox_events(created_at)
    WHERE status = 'PENDING';
```

A straight replacement, not "kept alongside" — unlike `SESSION-12` (where the unscoped composite
index still serves a second query, `findSessionsToComplete`'s `status IN (SCHEDULED, ONGOING)`),
nothing else queries `session_outbox_events` by status. The dropped index has no other consumer.

No entity/service/controller change — `SessionOutboxEventRepository`'s derived query method
already matched this predicate exactly; only the underlying index changed.

## Verification

- Applied against the running dev DB via `:server:bootRun` (Liquibase auto-runs on context init) —
  changeset ran successfully in 29ms.
- Confirmed via `\d session_outbox_events`: `idx_session_outbox_events_status_created` gone,
  `idx_session_outbox_events_pending_created` present with the exact
  `WHERE status::text = 'PENDING'::text` predicate.
- `SET enable_seqscan = off; EXPLAIN SELECT * FROM session_outbox_events WHERE status = 'PENDING'
  ORDER BY created_at LIMIT 50;` — planner picks `Index Scan using
  idx_session_outbox_events_pending_created`, confirming the index is well-formed and usable (same
  verification technique as `B16`).
- `./gradlew :modules:session:session-impl:test` — pass (no Java changed, confirms nothing broke).
- `./gradlew :server:test` — pass (90 tests, no regressions).

## Out of scope (unchanged)

Any change to `SessionOutboxEventRepository`, `SessionOutboxRelayJob`, or the outbox mechanism's
behavior — this ticket only swaps one index definition for another with no behavioral change. The
same unscoped-composite-index gap likely exists (or will exist) in every other domain's outbox
table built on C3's shape (`post_outbox_events`, `group_outbox_events`, etc.) once those tickets
ship — worth checking each one against this same pattern when it's built, not retrofitting now.

---

**Status:** `DONE` — see `modules/session/docs/MVP/SESSION-17_OUTBOX_PENDING_PARTIAL_INDEX.md`
**Type:** Performance (DB only)
**Migration:** `V056__replace_session_outbox_events_status_index_with_partial.sql`

**Filed:** 2026-08-17, found while explaining SESSION-15's sequence diagram — SESSION-15's own
`idx_session_outbox_events_status_created` (V054) is a full composite index over every row
regardless of status, but `SessionOutboxRelayJob.drain()` only ever queries
`status = 'PENDING'`, and `SENT` rows are never deleted or archived — same shape as `SESSION-12`
and `B16`, both already fixed with a partial index instead of an unscoped one.

**Fix:** dropped the V054 index, replaced with
`CREATE INDEX idx_session_outbox_events_pending_created ON session_outbox_events(created_at)
WHERE status = 'PENDING'` — no other query needs the dropped index, so it's a straight
replacement, not kept alongside (unlike SESSION-12, where the unscoped composite index still
serves a second query).

---
