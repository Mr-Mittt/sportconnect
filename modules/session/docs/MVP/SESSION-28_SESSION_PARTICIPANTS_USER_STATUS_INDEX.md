# SESSION-28 · Session/session_participants index cleanup — drop redundant, add `(user_id, status)`

**Status:** `TODO` (drop part `DONE`, 2026-09-15; add part still open)
**Type:** Enhancement (Performance)
**Depends on:** none (informed by SESSION-27's index review)
**Filed:** 2026-09-15, found while double-checking every index/query against `sessions`/
`session_participants` at user request, right after SESSION-27 shipped. Originally scoped as just
the `(user_id, status)` addition below; the two redundant-index drops were folded in the same day
after a follow-up review, at user request ("fold these into SESSION-28, drop redundant index keep
created_by and location_id").

## Part 1 — drop redundant indexes (`DONE`, `V066__drop_redundant_session_indexes.sql`)

`idx_sessions_group_id (group_id)` and `idx_session_participants_session_id (session_id)` were fully
redundant, present since the very first session migration (`V031`/`V032`, SESSION-1):
`unique_group_session_start UNIQUE (group_id, scheduled_start)` and `unique_session_user UNIQUE
(session_id, user_id)` already exist with the dropped column as their **leading** column — Postgres's
leftmost-prefix rule means any single-column lookup on `group_id`/`session_id` gets identical index
support from the composite unique index that remains. Two btree structures were being maintained
(and kept in sync on every insert/update) for query coverage one already provided.

`idx_sessions_created_by (created_by)` was also reviewed — its only remaining query consumer,
`getSessionsCreatedByUser`/`GET /sessions/mine`, was removed by SESSION-27 itself, and the sole
surviving reference to `created_by` in a query (`findDiscoverSessions`'s `s.createdBy <> :callerId`)
is a not-equals exclusion an index doesn't meaningfully help. `idx_sessions_location_id
(location_id)` was reviewed too — no query in `SessionRepository` filters `sessions` by
`location_id` at all (it's only ever read off an already-loaded entity and handed to
`LocationService.getLocationsByIds`, a different table). **Both kept, not dropped** — per explicit
user decision, since neither was confirmed unused against `pg_stat_user_indexes` on a real running
DB (only against a static grep of current query code), and dropping something with an undiscovered
consumer is a real, if reversible, production risk not worth taking without that stronger signal.

**What was built:** one Liquibase changeset,
`server/src/main/resources/db/changelog/changes/V066__drop_redundant_session_indexes.sql`:

```sql
DROP INDEX idx_sessions_group_id;
DROP INDEX idx_session_participants_session_id;
```

**Verification:**
- Applied against the real running dev DB via `:server:bootRun` (Liquibase auto-runs on context
  init) — changeset ran successfully in 19ms.
- `\d sessions` / `\d session_participants` on the real dev Postgres confirm both indexes gone;
  `idx_sessions_created_by`/`idx_sessions_location_id` still present, untouched.
- `SET enable_seqscan = off; EXPLAIN SELECT * FROM sessions WHERE group_id = 1;` →
  `Index Scan using unique_group_session_start`. Same for `session_participants WHERE session_id =
  1` → `Index Scan using unique_session_user`. Confirms the planner falls back to the composite
  unique index exactly as expected, no regression.
- `:modules:session:session-impl:test` + `:server:test` — both green (no Java changed by this
  part; pure schema/index change).

## Part 2 — add `session_participants(user_id, status)` (still `TODO`)

`session_participants` currently has only single-column indexes on `session_id` (now just the
`unique_session_user` composite, per Part 1) and `user_id`. Every "my sessions"-shaped query in
this module filters that table by **`user_id` AND `status`** in a subquery — `getJoinedSessions`'s
two repository methods and `discoverSessions`'s `NOT IN` subquery (both pre-existing), plus
SESSION-27's four new methods (`findUpcomingSessions`, `findUpcomingSessionsByDate`,
`findHistorySessionsByDate`, `findHistoryDateCounts`). None of them can narrow to (this caller, this
status) in one index lookup today — Postgres narrows by `user_id` via the existing index, then
applies `status` as a residual filter on whatever rows come back for that user.

`JOINED` is the status nearly every one of these queries filters on; `findUpcomingSessions`/
`findUpcomingSessionsByDate` additionally need `INVITED`. Rows are never deleted from this table — a
leave/decline/reject flips `status` to `LEFT` rather than removing the row (this module's own
established convention) — so each user's row count only grows over their lifetime, the same
unbounded-growth shape `idx_sessions_scheduled_status_only` (`V052`, SESSION-12) and
`idx_session_outbox_events_pending_created` (`V056`, SESSION-17) were filed to address elsewhere in
this module.

**Not urgent today** — a single user's own participant history is naturally small (tens to low
hundreds of rows even for a very active user), so the residual status filter costs little in
practice at current scale.

### Proposed shape (not decided — pick one at implementation time)

1. A straight composite `(user_id, status)` index — covers every consumer above, including the
   `INVITED`-inclusive ones, at the cost of indexing every historical status (`LEFT` included).
2. A partial index scoped to `status = 'JOINED'` (mirroring `idx_sessions_scheduled_status_only`'s
   technique exactly) — covers the `JOINED`-only majority of consumers; `findUpcomingSessions`'s
   `IN (JOINED, INVITED)` would still fall back to the existing plain `user_id` index for its
   `INVITED` half, which is fine since pending invites per user are typically very few.

## Out of scope

Any change to query logic, entity shape, or endpoint behavior — index-only, same as SESSION-17.
Row-level archival/deletion of old `CANCELLED`/`COMPLETED` sessions to save storage — a real
product question raised alongside this ticket (partial indexes can't express a moving "older than
a month" cutoff; the real options are archival/deletion or partitioning, both bigger decisions than
an index shape) — deliberately not folded in here; not yet filed as its own ticket pending which
direction is wanted.

**Tests (Part 2, when built):** `EXPLAIN` verification the new index is actually picked up (same
technique as Part 1's own verification above), plus confirming
`:modules:session:session-impl:test`/`:server:test` stay green with no Java changes.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
