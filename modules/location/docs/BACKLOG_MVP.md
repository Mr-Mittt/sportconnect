# Location Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/location/location-impl`
**Last updated:** 2026-11-23 (LOC-5 done, LOC-9 filed)

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
| 1 | [LOC-8](MVP/LOC-8_REJECT_COORDINATES_WITH_NO_TIMEZONE.md) | Creating a location with coordinates that match no timezone (out-of-range latitude or longitude) is saved today with a null timezone; reject it with a clear error code instead (a null timezone schedules generated sessions in the wrong zone) | `TODO` |
| 2 | [LOC-9](MVP/LOC-9_FILTER_VENUES_BY_COUNTRY_AND_REGION.md) | Venue search and favourites accept optional `countryId` / `regionId` filters (a region without a country is fine; a mismatched pair is a coded 400 through `ReferenceService.isValidSelection`); venues with no country never match a filter; composite index; cross-module `searchLocations` / `getFavoriteLocations` gain the parameters (census at pickup). Follow-up to LOC-5; client picker is a separate ticket | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [LOC-5](MVP/LOC-5_VENUE_COUNTRY_REGION_LINKS.md) | Venue `Location` gains nullable `country_id`/`region_id` (V102), auto-derived from coordinates on create through `reference-api` (never rejects; a lookup failure cannot fail or roll back the save: `LocationGeoResolver` runs `NOT_SUPPORTED`, proven by an IT that fails without it) + `LocationGeoBackfillRunner` (idempotent, id-cursor paged, guarded update); new `location-impl` to `reference-api` edge. Needed by SESSION-53 | `DONE` (2026-11-23) |
| 2 | [LOC-7](MVP/LOC-7_TIMEZONE_ENGINE_NATIVE_LIBRARY_ON_THE_HARDENED_BOX.md) | **[Production bug]** Saving a location fails on the box: the timezone engine's zstd-jni native library cannot load from the container's `noexec` `/tmp` (INFRA-6 hardening); fixed on the box with a small exec tmpfs `/opt/native` plus `JAVA_TOOL_OPTIONS=-DZstdTempFolder` (no new server image), and the resolver deliberately keeps failing the save when the engine cannot start (a null timezone would schedule generated sessions in the wrong zone); run on the live box 2026-11-10 | `DONE` (2026-11-10) |
| 3 | [LOC-6](MVP/LOC-6_ERROR_CODE_AUDIT.md) | **[Error handling · Phase B]** Error code audit for the location module (2026-10-07) — 6 codes (`LOCATION_NOT_FOUND`, `LOCATION_SPORT_PROFILE_REQUIRED`, `LOCATION_ALREADY_FAVORITED` / `LOCATION_NOT_FAVORITED` moved 400→409, `LOCATION_MAPS_URL_INVALID` / `_UNSUPPORTED`); `*_NOT_FOUND` messages no longer carry the id (also applied to `SPORT_NOT_FOUND`, `COUNTRY_NOT_FOUND`); new `LocationErrorCodesIntegrationTest`. Pairs with CLIENT-ERR-8 | `DONE` |
| 4 | [LOC-4](MVP/LOC-4_LOCATION_TIMEZONE.md) | Location gains a real IANA timezone, auto-derived from coordinates via `net.iakovlev:timeshape` (offline point-in-polygon lookup, no network call) — nullable, best-effort (no coordinates or no polygon match → null, never rejected/defaulted). Foundation for the session-impl location-timezone redesign (`documentation/md/LOCATION_TIMEZONE_DESIGN.md`, session `SESSION-33`/`34`/`35`). `V068` adds `locations.timezone`. Real deviation from plan: `TimeZoneEngine.initialize()`'s memory cost caused `OutOfMemoryError` across `:server:test`'s many Spring contexts when eagerly created as a normal bean — `@Lazy` didn't help (target class is `final`, then even on the non-final wrapping component it still didn't defer in practice) so `LocationTimeZoneResolver` self-manages a double-checked-locking lazy field instead. Also required bumping `commons-lang3` to 3.18.0+ in both `location-impl` and `server` (Spring BOM/an existing explicit pin conflicted with timeshape's `commons-compress` transitive dependency). Verified live end-to-end against real dev Postgres (real HTTP call, real HCMC coordinates → `Asia/Ho_Chi_Minh`). Green: session-impl (34 tests) + `:server:test` (231, only the 6 pre-existing SESSION-22 RabbitMQ-flake failures, confirmed unrelated via isolated re-run) | `DONE` (2026-09-16) |
| 5 | [LOC-3](MVP/LOC-3_DROP_LOCATION_CROSS_DOMAIN_FKS.md) | Drop DB-level FKs on location tables' cross-domain columns | `DONE` |
| 6 | [LOC-2](MVP/LOC-2_FAVORITE_LOCATIONS.md) | Favorite locations | `DONE` |
| 7 | [LOC-1](MVP/LOC-1_LOCATION_DOMAIN_BACKEND.md) | Location domain backend — shared, sport-scoped venue directory | `DONE` |
