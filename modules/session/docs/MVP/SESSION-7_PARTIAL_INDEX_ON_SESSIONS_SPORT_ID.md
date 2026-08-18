# SESSION-7 · Partial index on `sessions.sport_id`

**Filed:** 2026-08-01, found auditing `sport_id`-as-filter indexing across the app (client-side
discussion, `client/docs/BACKLOG_MVP.md`) — `V031__create_sessions_table.sql` indexes `group_id`,
`created_by`, `(status, scheduled_start)`, and `location_id`, but **`sport_id` has no index at
all**, confirmed by reading the migration directly, not assumed.

No query filters by `sport_id` server-side today — `MatchesPage`/`UpcomingMatches` filter by sport
client-side after fetching. This index is filed **ahead of** its real consumer: SESSION-4
(standalone session discovery, `TODO` above) will need exactly this once it's picked up — "browse
standalone sessions for sport X" is the query this index targets.

**Migration:**
```sql
CREATE INDEX idx_sessions_sport_id_standalone ON sessions(sport_id) WHERE group_id IS NULL;
```
Partial, not plain — scoped to standalone sessions only (`group_id IS NULL`), since a group-linked
session is already found via `idx_sessions_group_id` and never needs a sport-scoped lookup of its
own. Deliberately just `sport_id` alone, not a composite with `status` — SESSION-4's exact query
shape (whether it also needs `status` or `scheduled_start` in the same index) isn't written yet;
extending this index is SESSION-4's call once its real query exists, not a guess made here ahead of
time (same "don't design for hypothetical future requirements" reasoning as everywhere else in this
codebase). Register in `db.changelog-master.xml` per the usual convention.

**No code changes** — pure index addition, nothing in `SessionServiceImpl`/`SessionRepository`
uses `sport_id` as a filter yet.

**Verification:** no new Spock tests (no new logic). Once SESSION-4 exists, `EXPLAIN ANALYZE` its
real query against a populated `sessions` table and confirm the planner uses this index (extending
it first if SESSION-4's query needs more than a bare `sport_id` equality/`IN` check).

**Delta (2026-08-02):** bundled into SESSION-4 rather than picked up separately, once SESSION-4's
real query shape was known. Shipped as the composite `(sport_id, status, scheduled_start)`, not the
bare `sport_id` sketched above — SESSION-4's query filters on `sportId IN (...)`, `status =
SCHEDULED`, and sorts by `scheduledStart`, so the composite serves it directly. See
`modules/session/docs/MVP/SESSION-4_STANDALONE_DISCOVERY.md`.
