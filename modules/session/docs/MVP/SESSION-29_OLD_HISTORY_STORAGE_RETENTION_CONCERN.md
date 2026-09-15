# SESSION-29 · Old CANCELLED/COMPLETED session storage — retention concern (not scoped)

**Status:** `TODO` (documentation only — no direction decided yet)
**Type:** Concern / Future enhancement (Performance / Storage)
**Depends on:** none
**Filed:** 2026-09-15, raised during SESSION-27/SESSION-28's index review: users rarely look far
back into history, so old `CANCELLED`/`COMPLETED` `sessions` rows (and their `session_participants`
rows) are mostly dead weight — could their storage/index footprint be reduced? User asked to
document the concern and revisit later rather than scope it now.

## Why this isn't a simple index tweak

The instinctive fix — "exclude sessions older than a month from the index" — doesn't work as a
partial index: Postgres partial-index predicates must be `IMMUTABLE`, and `now() - interval '1
month'` isn't (the DDL is rejected outright). Even if it were allowed, the predicate would freeze
at creation time — rows crossing the one-month boundary the next day wouldn't retroactively
join/leave the index. A partial index can express "`status = 'JOINED'`" (static) fine, but not "a
month old" (a moving target).

## The three real options (none decided, none scoped)

1. **A rolling partial index**, rebuilt on a schedule (e.g. monthly `DROP`/`CREATE INDEX ... WHERE
   scheduled_start > now() - interval '1 month'`). Cheapest to build, but needs a new
   scheduled-maintenance mechanism this app has no precedent for, and only shrinks an *index* — the
   `sessions` table itself keeps growing regardless.
2. **Table partitioning** by date. The only option that actually bounds both index and table
   storage (old partitions can be detached/archived/dropped cheaply). Real architectural change —
   works against this repo's monolith-first/simplicity bias unless the table is demonstrably large
   enough to need it.
3. **An actual retention/archival policy** — delete or archive `CANCELLED`/`COMPLETED` sessions
   past some cutoff. The only option that saves real table storage, not just index storage. Directly
   interacts with SESSION-27's own `/history?dateCount`+`before` cursor, which exists specifically
   so a caller can page arbitrarily far back through their own history — a retention cutoff would
   silently cap that. This is a product decision (how far back does history need to work?), not a
   performance one.

## Why not decided now

`/upcoming`/`/history` are brand new (SESSION-27, 2026-09-15) — there's no real usage or storage
data yet to say whether this is actually worth solving, or which option fits. Revisit once there is
(real row counts/table size on a running environment, and/or actual evidence users don't page back
far).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
