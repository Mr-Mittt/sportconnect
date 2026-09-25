# LOC-5 · Venue `Location` gains Country / Region links, auto-derived + one-time backfill

**Status:** `TODO`
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
