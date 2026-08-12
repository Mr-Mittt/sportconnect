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
