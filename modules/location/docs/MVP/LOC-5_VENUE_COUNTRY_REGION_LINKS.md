# LOC-5 · Venue `Location` gains Country / Region links, auto-derived + one-time backfill

**Status:** `DONE` (2026-11-23)
**Type:** Enhancement (schema + additive API fields + new cross-domain dependency)
**Depends on:** REF-1, REF-2 (`resolveByCoordinates`)
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md`) — "Location also needs to be linked to Country and zone", resolved to mean
the **venue** `Location` entity. Filed in `location` so `/workon location` sees it.

## What

Same shape as LOC-4's timezone: venues gain a **nullable, best-effort** country and region, derived from coordinates,
**never rejected and never defaulted**.

- **Migration:** `locations.country_id`, `locations.region_id` — `BIGINT`, nullable, no FK (cross-domain IDs only).
- **`LocationServiceImpl.createLocation`:** after the LOC-4 timezone step, when coordinates are present call
  `ReferenceService.resolveByCoordinates` and set both ids from the result (empty → leave null). Never blocks creation.
- **`LocationResponse`** (`location-api`): add `countryId`, `regionId` (additive; names are not added — callers batch
  via `reference-api` if they need them).
- **`LocationGeoBackfillRunner`** (`ApplicationRunner`): idempotent, batched — selects locations with coordinates and
  null `country_id`, resolves, saves. Guarded by `app.location.geo-backfill.enabled` (on by default; **off under the
  test profile** so it never forces resolver initialisation in `:server:test`). Rows where nothing resolves stay null
  and are re-tried on the next start; make sure that cannot loop forever within one run.
- **Wiring:** `location-impl` gains `implementation project(':modules:reference:reference-api')` — a **new cross-domain
  bean edge**, so a real-context IT is required.

`Location.timezone` is untouched. Update `modules/location/location-impl/CLAUDE.md` (dependencies, key classes, gotchas).

## Edge cases

- No coordinates → both null. Coordinates in a country with no seeded regions → country set, region null.
- Coordinates that resolve to nothing (open ocean) → both null, no error (LOC-4 precedent).
- Account lifecycle: no new endpoint or caller-triggered call — `createLocation` is existing and authenticated; the
  resolver call is internal. The backfill runs as the system, not as a user. No `isActive` change needed.

## Consumer census (redo at pickup)

`LocationResponse` is consumed by `session-impl` (`SessionServiceImpl`, `SessionGenerationService`), `group-impl`
(`GroupServiceImpl`), and the client (`client/src/features/location/types.ts`, e2e `locations.ts` handler) — all
**compatible as-is** (additive nullable fields). `user-api` has its own unrelated `LocationResponse`. No JPQL names the
new columns.

## Tests

- **Spock:** `LocationServiceImplSpec` — country/region set when the resolver returns a match; left null when empty;
  never called without coordinates; failure of the resolver does not fail creation.
- **IT** (`server/src/test/java/com/sportconnect/integration/`): `LocationGeoLinkIntegrationTest` — create a venue with
  HCMC coordinates through the real request pipeline and assert `country_id`/`region_id`; create one with mid-ocean
  coordinates and assert nulls; **the real `ApplicationContext` starts with the new bean edge**; the runner backfills a
  pre-existing row (invoke it directly) and is idempotent. Add the columns to the H2 `schema.sql`.
- Report the IT changes in the ticket conclusion.

**Out of scope:** filtering/searching venues by country or region; a client change; an update path for a venue's
country/region (same "no update path yet" stance as LOC-4's timezone); admin tooling to correct a wrong derivation.

## Needed by the statistics chain (2026-11-23)

SESSION-53 (the statistics engine, `modules/session/docs/STATISTIC_RANKING_DESIGN.md`) counts a ranking game toward a region or country board only when the player's region or country, copied when they confirmed, equals the **venue's**. It therefore needs `locations.country_id` and `region_id` and a batch read of them through `location-api` (add `getLocationsByIds`-style access to the response fields if it does not exist). Build this ticket before SESSION-53. REF-3 (the 63 to 34 province refresh) moved to the reference V1 backlog on the same day, so the region ids stay stable meanwhile.

## Implementation summary (2026-11-23)

**Approved design, as built.** No divergence from the plan approved in the session; one decision the owner confirmed at approval: the lookup runs outside the save's transaction.

**What was built**
- `V102__add_country_region_to_locations.sql`: `locations.country_id`, `region_id`, `BIGINT`, nullable, no FK, no index (nothing queries by them in this ticket). Registered in the master changelog and mirrored in the H2 `schema.sql`.
- `Location` (`countryId`, `regionId`) and `LocationResponse` (`countryId`, `regionId`, additive, nullable; `toResponse` fills them, so `getLocation`, `getLocationsByIds`, search and favourites all carry them, which is what SESSION-53 needs).
- `LocationGeoResolver` (new): wraps `ReferenceService.resolveByCoordinates`, catches `RuntimeException`, logs a warning, answers empty. **`@Transactional(propagation = NOT_SUPPORTED)`**: `ReferenceServiceImpl` is a transactional proxy, and an exception through it marks the surrounding transaction rollback-only even when the caller catches it, so a plain try/catch in `createLocation` would not have kept the save alive.
- `LocationServiceImpl.createLocation`: after the LOC-4 timezone step, when coordinates are present, sets both ids from the match (region stays null when the country has no matching region).
- `LocationGeoBackfillRunner` (new `ApplicationRunner`, `app.location.geo-backfill.enabled`, default on, off in `application-test.yml`): pages (200) through venues with coordinates and no country by an id cursor (`id > lastId`), so each venue is tried once per run and an unresolved one cannot loop; writes with the guarded `UPDATE ... WHERE id = ? AND country_id IS NULL` (does not bump `updated_at`; two instances starting together set the same values and the loser changes nothing); a failure of the whole run is logged and never stops start-up. The boundary index is built lazily, so a start with nothing to backfill costs one query.
- `location-impl/build.gradle`: `implementation project(':modules:reference:reference-api')` (the new cross-domain edge; no cycle, reference-api depends on common only). `location-impl/CLAUDE.md` updated (dependency, key classes, gotchas).
- Release notes (`SERVER.md`, Unreleased), deployment guide history row, `PROGRESS.md` line.

**Design review answers.** Table or column: two columns, no table. Statuses: none. Async work: the runner runs once at start-up on the main thread before traffic, bounded by the page size per query, no retry clock (next start retries). Two at once: guarded update plus identical values; a request thread saving a new venue and the runner touch different rows. Identity and time: not applicable. Failure visibility: a warning with the coordinates per failed lookup, a summary line (examined, linked, unresolved) per run. Account lifecycle: no new endpoint or caller-triggered call (the runner acts as the system).

**Consumer census (final).** `LocationResponse` is read by `session-impl` (`SessionServiceImpl`, `GroupSessionConfigServiceImpl`, `GroupSessionOccurrenceGenerator`, `GroupSessionGenerationPlanner`, `SessionFieldChanges`, `SessionImportServiceImpl`), `group-impl` and the client (`features/location/types.ts`, e2e handler): all compatible as-is (additive nullable fields; their specs use the builder). `user-api` has its own unrelated `LocationResponse`. No JPQL named the new columns. No client change, no new `errorCode`, no client-mirrored enum, no i18n.

**Tests (all run)**
- Spock, `:modules:location:location-impl:test`: 51 tests, 0 failures. `LocationServiceImplSpec` (country and region stored; country alone; nothing resolved still saves; no coordinates never calls the resolver; `getLocationsByIds` exposes both), new `LocationGeoResolverSpec` (pass-through; a failure answered empty), new `LocationGeoBackfillRunnerSpec` (links with the guarded update; unresolved tried once and left null; a row another instance already linked is not overwritten; empty run costs one query and never touches the resolver; `run()` never throws).
- IT, new `server/src/test/java/com/sportconnect/integration/LocationGeoLinkIntegrationTest.java` (7 tests, real MockMvc pipeline, real H2, the real V073/V074 seed and the real boundary polygons): HCMC coordinates give Vietnam and `VN-SG` (and the timezone) in the response and the row, and `getLocationsByIds` returns them; mid-ocean gives nulls; Phnom Penh (a real polygon, Cambodia not seeded) gives nulls; no coordinates gives nulls; **a real failure of the reference lookup (the `countries` and `regions` tables renamed for the length of one request, so `ReferenceServiceImpl`'s own query throws inside its transactional proxy) still saves the venue with its timezone**; the runner links a pre-existing HCMC row, leaves open water, no-coordinate and already-linked rows alone, and a second run is idempotent; the runner bean is absent under the test profile and the real context starts with the new edge. **Mutation check:** with `NOT_SUPPORTED` changed to `REQUIRED`, only the forced-failure test fails (500 instead of 2xx); restored, 7 of 7 pass.
- `:server:test` (mandatory): 948 tests, 0 failures, 0 skipped (67 classes), exit 0: the 941 of the same suite without the new IT, plus the 7 of this ticket. The first full run with the IT failed with an `OutOfMemoryError` in the test executor (see Memory note), not a test failure.

**Memory note.** The first version of the IT used a `@SpyBean`, which makes Spring build one more application context; the full `:server:test` then ran out of heap (`OutOfMemoryError` in the test executor, 227 tests run, exit 1) while the same suite without the IT was green (941 tests). The IT was rewritten to stay on the shared context (no `@SpyBean`/`@MockBean`).

**IT changes report.** Added `LocationGeoLinkIntegrationTest` (7 tests above). Changed `server/src/test/resources/schema.sql` (the two columns on `locations`) and `application-test.yml` (`app.location.geo-backfill.enabled: false`). No existing IT changed.

**What the tests could not prove.** The `geography` column read on real PostgreSQL (H2 uses `GEOMETRY`; the runner reads the point through JTS, the same path `toResponse` uses), the guarded `UPDATE` under two real instances starting at once (one JVM, one thread here; the update is a single statement with an `IS NULL` guard and both instances write identical values), and the backfill against the real production venue rows. Not run: the dev Postgres stack, and the box.

**E2E / Visual-regression expectation.** No client change, so no e2e run and no baselined surface touched, no baseline change expected.

**Follow-ups.** LOC-9 filed (filter venue search and favourites by country and region; the client picker for it is a separate ticket, to be filed at LOC-9's pickup). A way to correct a wrong derived region stays out of scope as written. Noted for the SESSION-53 review gate: the polygons are simplified (a point within a few km of a border can land on the wrong side, and so on the wrong board), only Vietnam is seeded, and a venue that resolves to nothing never counts toward a region or country board.
