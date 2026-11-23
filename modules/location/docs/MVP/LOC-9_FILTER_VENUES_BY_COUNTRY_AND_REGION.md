# LOC-9 · Filter venues by country and region

**Status:** `TODO`
**Type:** Enhancement (additive read filter, one index)
**Depends on:** LOC-5 (done 2026-11-23: `locations.country_id` / `region_id`)
**Filed:** 2026-11-23, follow-up the owner asked for while LOC-5 was being built; LOC-5 listed "filtering or searching venues by country or region" as out of scope.

## What

Venue search can be narrowed to a country and, inside it, a region, so a player in Ho Chi Minh City sees the venues of `VN-SG` first instead of every venue of the sport.

- `GET /api/locations/search?sportId=&q=` gains two **optional** parameters, `countryId` and `regionId`. Both absent keeps today's behaviour exactly (the sport is still required; no unscoped search).
- `regionId` without `countryId` is accepted and means "this region" (a region belongs to exactly one country); `countryId` and `regionId` together must agree, checked through `ReferenceService.isValidSelection` (the non-throwing form, the same rule `user-impl` uses). A selection that does not agree, or names an unknown or inactive country or region, is a coded `400` (new code, for example `LOCATION_GEO_FILTER_INVALID`, with its en/vi `errors:codes` entry in the same change or a client ticket filed straight away).
- The favourites list (`GET /api/locations/favorites?sportId=`) gets the same two optional parameters, since it is the same picker.
- A venue with no country (no coordinates, open water, an unseeded country, or not yet backfilled) never matches a country or region filter and still shows when no filter is given. Say so in the endpoint's Javadoc.
- `LocationService.searchLocations` and `getFavoriteLocations` (cross-module `-api`) gain the two parameters; the census at pickup must list every caller (today the controller; `session-impl` and `group-impl` read `getLocation` and `getLocationsByIds`, not search).
- Index: a composite index for the filtered typeahead, for example `(sport_id, country_id, region_id)` (new Liquibase migration, design the exact shape and check the plan at pickup; the table is small today, so say honestly if the index is not needed yet).

## Edge cases

- Account lifecycle: existing authenticated endpoints, no new caller; no `isActive` change.
- Only Vietnam is seeded (REF-1), and regions exist only for Vietnam: a country filter for any other country returns nothing today, which is correct, not an error.
- The polygons are simplified (LOC-5): a venue within a few km of a provincial border can sit in the neighbouring province, so a region filter can miss it; a venue's region cannot be corrected yet.

## Tests

- **Spock:** `LocationServiceImplSpec` (filters passed to the repository; invalid selection rejected before any query; no filter unchanged).
- **IT** (`server/src/test/java/com/sportconnect/integration/`): through the real pipeline, venues in `VN-SG`, in another Vietnamese region and with no country: a region filter returns only the first, a country filter both located ones, no filter all three; a mismatched country and region is the coded `400`; favourites likewise. Reuse the V073 seed approach of `LocationGeoLinkIntegrationTest`. Keep it on the shared Spring context (no `@SpyBean` or `@MockBean`: `:server:test` runs close to its heap limit).
- Report the IT changes in the conclusion.

**Out of scope:** the client picker (a separate client ticket, to be filed when this is picked up: a country and region selector on `LocationPicker`, en/vi copy, MSW handler and e2e catalog row); filtering sessions or groups by their venue's region; correcting a wrong derived region; admin tooling.
