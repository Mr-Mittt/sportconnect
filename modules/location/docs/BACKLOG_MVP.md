# Location Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/location/location-impl`
**Last updated:** 2026-09-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [LOC-4](MVP/LOC-4_LOCATION_TIMEZONE.md) | Location gains a real IANA timezone, auto-derived from coordinates via `net.iakovlev:timeshape` (offline point-in-polygon lookup, no network call) — nullable, best-effort (no coordinates or no polygon match → null, never rejected/defaulted). Foundation for the session-impl location-timezone redesign (`documentation/md/LOCATION_TIMEZONE_DESIGN.md`, session `SESSION-33`/`34`/`35`). `V068` adds `locations.timezone`. Real deviation from plan: `TimeZoneEngine.initialize()`'s memory cost caused `OutOfMemoryError` across `:server:test`'s many Spring contexts when eagerly created as a normal bean — `@Lazy` didn't help (target class is `final`, then even on the non-final wrapping component it still didn't defer in practice) so `LocationTimeZoneResolver` self-manages a double-checked-locking lazy field instead. Also required bumping `commons-lang3` to 3.18.0+ in both `location-impl` and `server` (Spring BOM/an existing explicit pin conflicted with timeshape's `commons-compress` transitive dependency). Verified live end-to-end against real dev Postgres (real HTTP call, real HCMC coordinates → `Asia/Ho_Chi_Minh`). Green: session-impl (34 tests) + `:server:test` (231, only the 6 pre-existing SESSION-22 RabbitMQ-flake failures, confirmed unrelated via isolated re-run) | `DONE` (2026-09-16) |
| 2 | [LOC-3](MVP/LOC-3_DROP_LOCATION_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on location tables' cross-domain columns | `DONE` |
| 3 | [LOC-2](MVP/LOC-2_FAVORITE_LOCATIONS.md) | Favorite locations | `DONE` |
| 4 | [LOC-1](MVP/LOC-1_LOCATION_DOMAIN_BACKEND.md) | Location domain backend — shared, sport-scoped venue directory | `DONE` |
