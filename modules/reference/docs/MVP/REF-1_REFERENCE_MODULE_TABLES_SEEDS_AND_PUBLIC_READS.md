# REF-1 · New `reference` module — tables, seeds, public read endpoints

**Status:** `TODO`
**Type:** New Feature (new domain module)
**Depends on:** none
**Blocks:** REF-2, U16, LOC-5, CLIENT-REF-1
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md`). The first ticket of the feature: everything else reads these
tables.

## What

Create `modules/reference/{reference-api,reference-impl}` — a domain that depends only on `modules/common` (every
other domain will depend on `reference-api`; it depends on none of them). Modelled on `sport-api`/`sport-impl`
(public catalog, batch `getXByIds`, active-only reads).

**Tables** (Liquibase, next free `V0xx` — `V071` is the latest today; domain-scoped, the only FK is the intra-domain
`regions.country_id`):

```
languages(id, code UNIQUE /* BCP 47 */, name, native_name, is_active, sort_order)   -- seed: en, vi
countries(id, iso2 UNIQUE, iso3 UNIQUE, name /* English */, is_active)              -- seed: all ~250 ISO 3166-1
regions  (id, country_id FK, iso_code UNIQUE /* ISO 3166-2 */, name, native_name, is_active)  -- seed: Vietnam only
```

**`reference-api`** — `ReferenceService` + DTOs (`LanguageResponse`, `CountryResponse`, `RegionResponse`):
`getActiveLanguages()`, `getActiveCountries()`, `getActiveRegions(countryId)`, batch
`getCountriesByIds(Collection<Long>)` / `getRegionsByIds(Collection<Long>)` returning `Map<Long, …>` (no N+1 for
callers). **The batch lookups do not filter on `is_active`** — a user who already references a since-deactivated
country/region must still see its name (REF-3 deactivates, never deletes); only the list endpoints are active-only, `isActiveLanguage(String code)`, `requireValidSelection(Long countryId, Long regionId)` (both active;
region belongs to country; else `BadRequestException`; a null `regionId` is valid; a `regionId` with no country is not).
`resolve(...)`/`resolveByCoordinates(...)` are added by **REF-2**, not here.

**`reference-impl`** — entities, repositories, `ReferenceServiceImpl`, `ReferenceController`, all **public**:

```
GET /api/reference/languages
GET /api/reference/countries
GET /api/reference/countries/{countryId}/regions      -- 404 for an unknown/inactive country
```

Wire-up: `settings.gradle`, `server/build.gradle`, and `SecurityConfig` (`GET /api/reference/**` → `permitAll`,
ordered before `anyRequest`, with the same explanatory comment style the `/api/sports/**` entries use).

**Seed data.** Countries from ISO 3166-1 (names in English). Vietnam's regions from ISO 3166-2:VN with Vietnamese
native names. **Vietnam-only regions is a deliberate decision** (`REFERENCE_DATA_DESIGN.md` § 8) — write the
"how to add a market" steps into the module's `CLAUDE.md` as well. The Vietnam seed must match REF-2's bundled
polygons 1:1; if the province list is in flux, seed what the chosen boundary release ships and let **REF-3** refresh it.

**Account lifecycle:** no authenticated endpoint is added; all reads are public and read-only, so no caller check applies.

## Docs to update in this ticket

- `modules/reference/reference-impl/CLAUDE.md` (new — dependencies, key classes, endpoints, run tests, gotchas; see
  `modules/location/location-impl/CLAUDE.md` for the shape)
- Root `CLAUDE.md`: add `reference/` to the **Module structure** tree and `/api/reference/**` to the public-endpoint line
- `PROGRESS.md` line on close-out; `documentation/md/IT_OVERVIEW.md` for the new IT class

## Tests

- **Spock** `ReferenceServiceImplSpec`: active-only filtering, `getActiveRegions` for a country with none (empty, not
  an error), batch methods return maps keyed by id and omit unknown ids, `requireValidSelection` (valid; region not in
  country; inactive country; region without country; both null).
- **IT** `ReferenceApiIntegrationTest` (`server/src/test/java/com/sportconnect/integration/`): anonymous `GET` on all
  three endpoints succeeds through the **real** `SecurityConfig`; unknown country → 404; the seeded counts/codes are
  what the migration says. Add the three tables to the H2 `schema.sql` (hand-maintained mirror, lazily built).
- Report the IT changes in the ticket conclusion.

**Out of scope:** the resolver and `POST /resolve` (REF-2); any consumer wiring (U16, LOC-5); admin CRUD for the
tables; regions for any country but Vietnam; localized country names (the client uses `Intl.DisplayNames`).
