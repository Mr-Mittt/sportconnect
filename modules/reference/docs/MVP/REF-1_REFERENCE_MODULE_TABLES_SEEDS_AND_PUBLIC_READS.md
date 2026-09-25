# REF-1 · New `reference` module — tables, seeds, public read endpoints

**Status:** `DONE` (2026-09-25; scope change 2 — default language per country — folded in)
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
countries(id, iso2 UNIQUE, iso3 UNIQUE, name /* English */, is_active,                -- seed: Vietnam only (VN/VNM) — see Scope change below
          default_language_code FK→languages(code) NULL)                                -- added by V074, see Scope change 2
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

**Seed data.** Countries: **Vietnam only** (`VN` / `VNM`, name in English) — see **Scope change** below. Vietnam's regions from ISO 3166-2:VN with Vietnamese
native names. **Vietnam-only regions is a deliberate decision** (`REFERENCE_DATA_DESIGN.md` § 8) — write the
"how to add a market" steps into the module's `CLAUDE.md` as well. The Vietnam seed must match REF-2's bundled
polygons 1:1; if the province list is in flux, seed what the chosen boundary release ships and let **REF-3** refresh it.

**Account lifecycle:** no authenticated endpoint is added; all reads are public and read-only, so no caller check applies.

## Scope change — 2026-09-25 (user, at pickup): seed Vietnam only, other countries later

**Was:** seed all ~250 ISO 3166-1 countries. **Now:** the `countries` table is seeded with **Vietnam only**; the
remaining countries are deferred to **REF-4** (filed). *Why:* the product is Vietnam-first, so start with the one
market and add the rest deliberately. The schema is unchanged — REF-4 is a data-only migration.

Consequences carried forward (each is recorded in the ticket that owns it):
- The country dropdown lists Vietnam only until REF-4; a user elsewhere cannot pick their country. Every selection stays
  **optional**, so sign-up is never blocked.
- **REF-2:** the resolver maps a polygon's `iso2` to a *seeded* row, so a coordinate/timezone/locale in an unseeded country
  resolves to `country: null` (not an error). Its "Paris → FR" test fixture must change until REF-4 (noted in REF-2).
- **U16:** the legacy `users.country` text backfill matches only Vietnam; every other row keeps its legacy text, which
  the response's display-name fallback already covers.
- Ids are generated (`BIGINT` identity); nothing may depend on Vietnam being id `1` — look it up by `iso2`.
- `REFERENCE_DATA_DESIGN.md` § 3 / § 8 amended with a matching **Delta**.

## Scope change 2 — 2026-09-25 (user, after the first local start-up): a default language per country

**Added:** each country can carry a **default language**, as data — `countries.default_language_code` (nullable,
`VARCHAR(35)`, a real FK to `languages(code)`; intra-domain so an FK is allowed), seeded `vi` for Vietnam.
`CountryResponse` gains `defaultLanguageCode` (nullable, additive). *Why:* the client can pre-fill the Language
dropdown from the chosen country without a hardcoded country → language map, and adding a market stays a data-only migration.

**Migration:** **`V074__add_default_language_to_countries.sql`** — a new file, because V072/V073 had already been applied
to the developer's local database and an applied changeset must not be edited (Liquibase checksum). The `ALTER` uses
`ADD COLUMN IF NOT EXISTS` so the H2 mirror (which already has the column) can run the same file in the IT and the
`UPDATE` seed is still exercised for real.

Semantics agreed with the user (recorded where they are implemented):
- **Priority when a country is known:** explicit user choice > a supported language from the browser's language list >
  the country's default language > none. The browser beats the country default, so a Vietnamese resident with an
  English browser still gets `en`. The default only fills the gap.
- **A hand-picked country** fills the Language field from the default **only if Language is still empty**; it never
  overwrites a value the user chose or the browser detected.
- The API returns the raw code; if that language is not in the active set the client treats it as "no default".
  (No extra per-country query on the hot batch lookup.)

Consequences carried forward: **REF-2** (resolve falls back to the resolved country's default language), **CLIENT-REF-1**
(pre-fill rule), **REF-4** (set the column for new countries where a supported language applies, else leave null) —
each has a note in its own ticket. Census: `CountryResponse` and `countries` have no consumers yet (additive).

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
  what the migration says (exactly one country, `VN`; every seeded region has Vietnam's `country_id`). Add the three tables to the H2 `schema.sql` (hand-maintained mirror, lazily built).
- Report the IT changes in the ticket conclusion.

**Out of scope:** the resolver and `POST /resolve` (REF-2); any consumer wiring (U16, LOC-5); admin CRUD for the
tables; regions for any country but Vietnam; **countries other than Vietnam (REF-4)**; localized country names (the client uses `Intl.DisplayNames`).

---

## Implementation summary (2026-09-25)

**Status: DONE.** Approved design, restated, and what was built.

### Design (as approved)

A new `modules/reference/{reference-api,reference-impl}` domain that depends only on `common`. Liquibase files — **V072** (the three tables, only intra-domain FK `regions.country_id`), **V073** (seed data, kept apart so
the IT can run exactly that file against H2) and, from scope change 2, **V074** (`countries.default_language_code` + the Vietnam → `vi` update). `ReferenceService` in the API module (active-only lists, batch
`getCountriesByIds`/`getRegionsByIds` that do **not** filter `is_active`, `isActiveLanguage`,
`requireValidSelection`); `ReferenceServiceImpl` (read-only transactions, one query per batch call, no cache);
`ReferenceController` with three public GETs; `SecurityConfig` `GET /api/reference/**` → `permitAll`.

### What was built

- `server/.../changes/V072__create_reference_tables.sql`, `V073__seed_reference_data.sql`, `V074__add_default_language_to_countries.sql`, registered in `db.changelog-master.xml`.
  V074 is its own file because V072/V073 had already been applied to the developer's local database; its `ALTER` uses `ADD COLUMN IF NOT EXISTS` so the IT can run the same file on the H2 mirror.
- Seed: languages `en`, `vi`; **one country, Vietnam (`VN`/`VNM`)**; **63 regions** (58 provinces + 5 municipalities, ISO 3166-2:VN
  codes, romanized `name` + Vietnamese `native_name`).
- `reference-api`: `LanguageResponse`, `CountryResponse` (incl. nullable `defaultLanguageCode`), `RegionResponse`, `ReferenceService`.
- `reference-impl`: `Language`/`Country`/`Region` entities, three repositories, `ReferenceServiceImpl`, `ReferenceController`,
  module `CLAUDE.md` (incl. "adding a market").
- Wiring: `settings.gradle`, `server/build.gradle`, both module `build.gradle` files, `SecurityConfig`.
- Docs: root `CLAUDE.md` (module tree + public endpoints), `IT_OVERVIEW.md`, `PROGRESS.md`.

### Divergences from the ticket as originally filed — stated, not silently absorbed

- **Countries seeded for Vietnam only** (user scope change at pickup; REF-4 filed for the rest) — see "Scope change" above.
- **Default language per country added mid-ticket** (user request after the first local start-up; scope change 2): a nullable
  `countries.default_language_code` FK to `languages(code)`, Vietnam → `vi`, returned as `CountryResponse.defaultLanguageCode` (raw —
  the client checks it against the active languages). Priority rules are recorded in the scope-change section and implemented by REF-2 / CLIENT-REF-1.
- **Seed split into its own migration (V073)** so the IT executes the real seed file; the ticket only said "next free V0xx".
- `getActiveRegions` for an unknown/inactive country throws `ResourceNotFoundException` (→ 404 via `GlobalExceptionHandler`).
- **The 63-province list was typed from knowledge of ISO 3166-2:VN, not fetched from a source of record**, and has not been
  checked against the official list. The gate for it is REF-2's invariant (every seeded code has a polygon and vice versa,
  against Natural Earth's codes); REF-3 then refreshes to the 2025 merger. Treat a mismatch found there as expected work, not a regression.

### Verification (what was actually run)

- **Spock** `ReferenceServiceImplSpec` — 21 tests, all pass (`:modules:reference:reference-impl:test`); re-run after scope change 2.
- **`:server:test` (full)** — re-run after scope change 2: 317 tests, 0 failures, 0 errors, 0 skipped (26 classes; the first run, before it, was 315).
- **Real Postgres** — `:server:bootRun` against the dev database: V072 and V073 both applied ("ran successfully"), app started;
  anonymous `curl`: `/languages` 200 (en, vi), `/countries` 200 (VN), `/countries/1/regions` 200 (63 regions, `VN-SG` =
  "Ho Chi Minh"/"Hồ Chí Minh"), unknown country 404, anonymous `POST /api/reference/countries` 401; `psql` counts 2 / 1 / 63 / 1 distinct country.
  Server stopped afterwards. **Side effect:** V072/V073 are now applied to the local `sportconnect_dev` database.
  After scope change 2: V074 applied on the same database ("ran successfully"; `psql`: `VN|vi`), and a second instance on port 8081
  (8080 was held by the developer's own IDE-launched server, left untouched) returned `/countries` 200 with `"defaultLanguageCode":"vi"`,
  `/languages` 200 and `/countries/1/regions` 200. That 8081 instance was stopped afterwards.
- N+1 scan: no repository/service call inside a loop or `.map()`; the batch methods are one `findAllById` each.
- Client: untouched — no e2e / visual-regression run applies (backend-only ticket).

### IT changes (standing report)

- **Added** `server/src/test/java/com/sportconnect/integration/ReferenceApiIntegrationTest.java` (`BaseIT`, H2 only, 14 tests):
  the real `V073` seed content + `V074` (default language `vi`, a country with none serializes `null`, the FK rejects an unknown language code) (Vietnam only, 63 distinct `VN-*` regions under Vietnam's id, `VN-SG` names, `en`/`vi`);
  anonymous `GET` on all three endpoints through the **real** `SecurityConfig` chain; empty list for a country with no regions;
  404 for an unknown and for an inactive country; inactive regions excluded from the list; anonymous non-GET under the path
  still 401; and the `ReferenceService` contract against real rows (batch lookups include deactivated rows and omit unknown ids,
  `requireValidSelection` valid/invalid combinations, `isActiveLanguage`).
- **Updated** `server/src/test/resources/schema.sql` (three tables incl. `countries.default_language_code`, deliberately no seed rows) and `documentation/md/IT_OVERVIEW.md` (new row).

### Notes for the next tickets

- **REF-2:** no resolver exists yet; a detected country without a seeded row must resolve to `country: null` (see its note).
- **U16 / LOC-5:** call `getCountriesByIds`/`getRegionsByIds` once per list (collect ids first), and look Vietnam up by `iso2` — the id
  is generated. On the dev database it happens to be 1; that is not a contract.
- No rate limiting exists for public endpoints; these are three cheap indexed reads.
