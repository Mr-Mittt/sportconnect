# B16 · Partial index on `groups.sport_id` for public-group search

**Status:** DONE (2026-08-10)
**Type:** Performance (DB only)
**Migration:** `V047__add_groups_sport_id_public_active_partial_index.sql`

## Context

Filed 2026-08-01, found auditing `sport_id`-as-filter indexing across the app. `V015` added
`groups.sport_id` with no index at all, and it still had none — confirmed by reading every
migration touching `groups`. The two real consumers, `GroupRepository.searchPublicGroupsWithCounts`
and `searchPublicGroupsAnon` (A10's `getPublicGroups`, both branches), both filter the exact same
`g.isActive = true AND g.isPrivate = false AND (:sportIds IS NULL OR g.sportId IN :sportIds)`
shape — confirmed by reading `GroupRepository.java` directly.

## What was built

One Liquibase changeset, `V047__add_groups_sport_id_public_active_partial_index.sql`, registered
in `db.changelog-master.xml`:

```sql
CREATE INDEX idx_groups_sport_id_public_active ON groups(sport_id)
    WHERE is_active = true AND is_private = false;
```

A **partial** index, not a plain one — it excludes private/inactive groups entirely rather than
indexing every row and filtering afterward, matching the query predicate exactly (same technique
as `idx_sessions_status_scheduled_start`).

**Also removed** (flagged in the ticket as "worth confirming/removing while in this file, not a
required part of this ticket" — confirmed dead by grep, no callers anywhere in `src/main` or
`src/test`, so removed): the superseded derived query method
`GroupRepository.findByIsActiveTrueAndIsPrivateFalseAndSportId(Long, Pageable)`, made redundant by
A10's list-based `searchPublicGroups*` queries.

No entity/service/controller change otherwise — the consuming queries already filtered exactly
what the partial predicate covers.

## Verification

- Applied against the running dev DB via `:server:bootRun` (Liquibase auto-runs on context
  init) — changeset ran successfully in 24ms, recorded in `databasechangelog`. Confirmed via
  `\d groups`: `idx_groups_sport_id_public_active` present with the exact `WHERE is_active = true
  AND is_private = false` predicate.
- `EXPLAIN ANALYZE` against the live dev data (25 rows in `groups`, 23 matching sport 1): the
  planner picks a **sequential scan**, not the new index. This is expected, correct cost-based
  behavior at this row count — a seq scan over 25 rows is cheaper than an index scan's extra I/O,
  and Postgres correctly recognizes that. It is not evidence the index is broken or unused; it
  will be picked automatically once the table grows past the point where an index scan is
  cheaper (the standard planner crossover, not something to force at MVP data volumes).
- To confirm the index is valid and actually usable (not just present), re-ran with
  `SET enable_seqscan = off`: the planner then picks
  `Index Scan using idx_groups_sport_id_public_active on groups g` with `Index Cond: (sport_id =
  1)` — the `is_active`/`is_private` predicate doesn't need to appear as a separate filter because
  it's already baked into the partial index definition. Confirms the index is well-formed and will
  do the right thing once table size makes it the cheaper plan.
- `./gradlew :modules:social:group-impl:test` — pass (also confirms removing the dead repository
  method didn't break compilation or any existing test).
- `./gradlew :server:test` — pass.

## Out of scope (unchanged)

Any change to `GroupServiceImpl`, `GroupController`, or the shape of the search queries
themselves — this ticket only adds an index (and removes one confirmed-dead method) with no
behavioral change.

---

**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/social/group-impl/docs/MVP/B16_GROUPS_SPORT_ID_PARTIAL_INDEX.md`
**Type:** Performance (DB only — no service/entity/controller changes)

**Filed:** 2026-08-01, found auditing `sport_id`-as-filter indexing across the app (client-side
discussion, `client/docs/BACKLOG_MVP.md`). `V015__add_sport_id_to_groups.sql` added the column with
**no index at all**, and it still has none today — confirmed by reading every migration touching
`groups`, not assumed. Meanwhile every real consumer of it — `GroupRepository.searchPublicGroupsWithCounts`/
`searchPublicGroupsAnon` (A10's `getPublicGroups`, both branches) — filters the exact same
`g.isActive = true AND g.isPrivate = false AND (:sportIds IS NULL OR g.sportId IN :sportIds)` shape.
(The older derived method `findByIsActiveTrueAndIsPrivateFalseAndSportId` still exists in the
repository but appears superseded by A10's list-based queries — worth confirming/removing as dead
code while in this file, not a required part of this ticket.)

**Migration:**
```sql
CREATE INDEX idx_groups_sport_id_public_active ON groups(sport_id)
    WHERE is_active = true AND is_private = false;
```
A **partial** index, not a plain one — it excludes private/inactive groups entirely rather than
indexing every row and filtering afterward, matching the query's actual predicate exactly (same
technique already precedented by `idx_sessions_status_scheduled_start`'s shape). Register in
`db.changelog-master.xml` per the usual convention.

**No code changes** — the query methods already filter exactly what the partial predicate covers;
this is a pure index addition, nothing to change in `GroupRepository`/`GroupServiceImpl`.

**Verification (no new Spock tests — there's no new logic to unit-test):** run against a real
Postgres instance, `EXPLAIN ANALYZE` the actual `searchPublicGroupsWithCounts`/`searchPublicGroupsAnon`
SQL with a populated `groups` table and confirm the planner picks the new index (bitmap or plain
index scan) rather than a sequential scan.
