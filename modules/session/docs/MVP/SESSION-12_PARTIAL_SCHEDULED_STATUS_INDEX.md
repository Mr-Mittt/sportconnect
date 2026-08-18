# SESSION-12 — Partial index on `sessions` scoped to `status = SCHEDULED`

**Status:** `DONE` (2026-08-12) · **Backlog entry:** `modules/session/docs/BACKLOG_MVP.md`

## Problem

`V031__create_sessions_table.sql` indexes `(status, scheduled_start)` —
`idx_sessions_status_scheduled_start` — a plain composite covering all four `SessionStatus`
values. Its real hot consumer is `SessionRepository.findSessionsToStart` (`status = :status AND
scheduledStart <= :now AND scheduledEndAt > :now`, always called with `status=SCHEDULED`), driven
by `SessionGenerationJob.startOngoingSessions` on a fixed 15-minute `@Scheduled` cadence.

Sessions are never deleted or purged — cancelled sessions stay soft-deleted rows (`SESSION-3`),
completed ones stay rows forever — so the `COMPLETED`/`CANCELLED` share of the table only grows
over time, while the fraction still `SCHEDULED` at any moment stays comparatively small and
roughly constant. The existing index grows with the whole table's history even though the job
only ever touches the `SCHEDULED` slice.

## Design (approved plan)

1. New Liquibase migration adding a partial index:
   ```sql
   CREATE INDEX idx_sessions_scheduled_status_only ON sessions(scheduled_start)
       WHERE status = 'SCHEDULED';
   ```
2. Register in `db.changelog-master.xml`.
3. No entity/repository/service/controller changes.
4. No new Spock tests (no new logic) — verified via `EXPLAIN` against the running dev DB instead.

Two decisions confirmed with the user before implementing (both diverge slightly from the
original ticket sketch):
- **Keep the existing `idx_sessions_status_scheduled_start` index as-is**, rather than dropping
  it — it still serves `findSessionsToComplete`'s `status IN (SCHEDULED, ONGOING)` query, which a
  `status = 'SCHEDULED'`-only partial index can't cover.
- **Index on `scheduled_start` alone**, not `(scheduled_start, scheduled_end_at)` as originally
  sketched — the `scheduled_end_at > :now` predicate stays a cheap in-memory filter on an
  already-small partial result set; not worth the extra column.

## What was built

- `server/src/main/resources/db/changelog/changes/V052__add_sessions_scheduled_status_partial_index.sql`
  — the index above.
- Registered in `db.changelog-master.xml` after `V051`.

No other files changed.

## Verification

- `./gradlew :server:bootRun` against the dev Postgres (`sportconnect_dev`) — `V052` changeset
  ran successfully, application started clean.
- `\d sessions` confirms both `idx_sessions_scheduled_status_only` and
  `idx_sessions_status_scheduled_start` exist side by side.
- `EXPLAIN SELECT * FROM sessions WHERE status = 'SCHEDULED' AND scheduled_start <= now() AND
  scheduled_end_at > now();` — planner picks `Index Scan using idx_sessions_scheduled_status_only`,
  with `scheduled_end_at > now()` applied as a `Filter` on the (small) matched set, confirming the
  design decision to leave it out of the index columns.
- `./gradlew :modules:session:session-impl:test` — `BUILD SUCCESSFUL` (unaffected, no code
  changed).
- `./gradlew :server:test` — `BUILD SUCCESSFUL`, including all `SessionPostAccessGateIntegrationTest`
  cases (unaffected by this change, run as the mandatory full-suite check).

## Out of scope (unchanged from the ticket)

- Any change to `SessionServiceImpl`/`SessionRepository`/entities.
- Dropping or altering `idx_sessions_status_scheduled_start`.
- `findSessionsToComplete`'s `status IN (SCHEDULED, ONGOING)` query — still served by the
  existing unscoped composite index; a dedicated partial index for that query shape is a separate
  future ticket if it's ever needed.

---

**Status:** `DONE` (2026-08-12) · **Full writeup:**
`modules/session/docs/MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md`

**Filed:** 2026-08-12. `V031__create_sessions_table.sql` indexes `(status, scheduled_start)` —
`idx_sessions_status_scheduled_start` — a plain, unscoped composite covering all four
`SessionStatus` values. Confirmed by reading the migration directly (see SESSION-1's entry above),
not assumed.

The index's real hot consumer is `SessionRepository.findSessionsToStart` (`status = :status AND
scheduledStart <= :now AND scheduledEndAt > :now`, called with `status=SCHEDULED` only), driven by
`SessionGenerationJob.startOngoingSessions` on a fixed **15-minute** `@Scheduled` cadence per
`session-impl`'s `CLAUDE.md`. Sessions are never deleted or purged — cancelled sessions are kept
soft (`SESSION-3`), completed ones stay rows forever — so the table's `COMPLETED`/`CANCELLED` share
only grows over time while the fraction still `SCHEDULED` at any moment stays comparatively small
and roughly constant. A plain index across all four statuses grows with the whole table's history;
a partial index scoped to `status = 'SCHEDULED'` would instead track only the live/pending slice
this query actually cares about, same "partial index on the actual hot query" reasoning as
SESSION-7 (`sport_id`, standalone-only) and SESSION-4's discover index.

**Migration (sketch, confirm exact shape at pickup):**
```sql
CREATE INDEX idx_sessions_scheduled_status_only ON sessions(scheduled_start, scheduled_end_at)
    WHERE status = 'SCHEDULED';
```
Register in `db.changelog-master.xml` per the usual convention, next sequential `Vxxx` file.
Whether the existing unscoped `idx_sessions_status_scheduled_start` should be dropped once this
ships, or left in place (it still serves the `status IN (SCHEDULED, ONGOING)`
`findSessionsToComplete` query, which a `status = 'SCHEDULED'`-only partial index can't fully
cover — that query is explicitly out of scope for this ticket, not overlooked) is this ticket's
call at pickup, not decided here.

**No code changes** — pure index addition/possible-drop, nothing in `SessionServiceImpl`/
`SessionRepository` changes.

**Verification:** no new Spock tests (no new logic). `EXPLAIN ANALYZE` `findSessionsToStart`'s
generated query against a populated `sessions` table (real mix of terminal and `SCHEDULED` rows,
not just fixture-sized) and confirm the planner picks the new partial index over the existing
composite or a seq scan.

**Delta (2026-08-12, at pickup):** both open calls above resolved. Existing
`idx_sessions_status_scheduled_start` **kept**, not dropped — still serves
`findSessionsToComplete`. Index shipped as **`scheduled_start` alone**, not
`(scheduled_start, scheduled_end_at)` as sketched — `scheduled_end_at > :now` stays a cheap
in-memory `Filter` on the already-small partial match set, confirmed via `EXPLAIN`. Shipped as
`V052__add_sessions_scheduled_status_partial_index.sql`. Full writeup:
`modules/session/docs/MVP/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md`.
