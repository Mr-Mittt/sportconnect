# CLAUDE.md — reference-impl

The **reference-data** domain: the three lookup tables every other domain links to by id — **languages**,
**countries**, **regions** (state/province; the "zone" of the Language / Country / Zone feature — *not* a timezone).
Public and read-only. Full design, decision record and every declined alternative:
`documentation/md/REFERENCE_DATA_DESIGN.md`.

## Dependencies

| From | Why |
|---|---|
| `modules/reference/reference-api` | `ReferenceService` interface + DTOs |
| `modules/common` | `ApiResponse<T>`, `BadRequestException`, `ResourceNotFoundException` |
| JTS `jts-core` 1.19.0 | REF-2 `GeoBoundaryResolver` — `WKTReader`, `STRtree`, prepared geometries (same version as location-impl/user-impl) |

This domain depends on **no other domain** — every other domain depends on `reference-api`, never the reverse.
Other domains store `countryId` / `regionId` as plain ids (no DB foreign key into these tables) and resolve names
through the batch methods.

## Key Classes

| Class | Purpose |
|---|---|
| `Language`, `Country`, `Region` | Entities. `Region.countryId` is a plain id (the one FK, `regions.country_id`, is intra-domain) |
| `ReferenceServiceImpl` | Active-only lists; batch `getCountriesByIds` / `getRegionsByIds`; `isActiveLanguage`; `requireValidSelection`; `resolve` / `resolveByCoordinates` (REF-2) |
| `GeoBoundaryResolver` | REF-2. Offline lookup over the bundled `geo/*.tsv`: point → `Hit(countryIso2, regionIsoCode?)`, IANA zone → country. Answers in ISO codes only; the service turns a code into a seeded, active row |
| `ReferenceController` | The three public `GET` endpoints and `POST /resolve` |

## Endpoints (all public — `SecurityConfig` permits `GET /api/reference/**` and the one exact `POST /api/reference/resolve`)

```
GET  /api/reference/languages                       active languages, by sort_order
GET  /api/reference/countries                       active countries, by name
GET  /api/reference/countries/{countryId}/regions   active regions; 404 for an unknown/inactive country, [] when none
POST /api/reference/resolve                         browser signals -> {language, country, region, source}; all-null 200 when nothing matches
```

`resolve` request: `{ locales?: string[≤10, each ≤35], timeZoneId?: string(≤64), latitude?, longitude? }` — latitude and
longitude both or neither, in range, else `400`. Country priority **coordinates > timezone > locale region subtag**; a signal
whose country is not seeded/active falls through to the next; `source` (`COORDINATES|TIMEZONE|LOCALE`) names the winner and is
`null` iff `country` is. `region` only when coordinates won. `language`: first locale whose primary subtag is an active
language, else the resolved country's `defaultLanguageCode` when active. Junk locales / unknown zones are **ignored, not
rejected**. Public + read-only, so no `isActive` caller check; there is **no rate limiting** in the codebase — inputs are
capped and a lookup is an in-memory scan, nothing more was built.

## Run Tests

```bash
./gradlew :modules:reference:reference-impl:test
./gradlew :server:test --tests "com.sportconnect.integration.ReferenceApiIntegrationTest"
```

## Seed data

Migrations `V072` (tables), `V073` (seed) and `V074` (`countries.default_language_code`, Vietnam → `vi`) in `server/src/main/resources/db/changelog/changes/`. The seed is a
separate file so `ReferenceApiIntegrationTest` can execute exactly it against H2 (the H2 `schema.sql` mirror carries
**no** seed rows). Keep it plain standard SQL — no Postgres-only syntax — or that test stops working.

An applied migration is never edited — change to existing tables/seeds goes in a **new** `V0xx` file (V074 exists for exactly this reason).

Currently seeded: languages `en`, `vi`; **countries: Vietnam only** (REF-4 adds the rest of ISO 3166-1 — the polygons for all of
them already ship in `countries.tsv`, so REF-4 is rows only); **regions: Vietnam only**, the 63 ISO 3166-2:VN
provinces/municipalities (REF-3 refreshes to the 2025 merger, 63 → 34). The resolver knows a polygon for every country but only
returns a **seeded, active** one — a Paris coordinate today is an all-null `200`, not France.

## Bundled boundary data (`src/main/resources/geo/`, REF-2)

| File | Content | Source |
|---|---|---|
| `countries.tsv` | `iso2 TAB WKT`, every country (~740 KB, 239 rows / 237 distinct codes — Natural Earth splits `AU` into a few features) | Natural Earth admin-0, 1:50m |
| `regions-VN.tsv` | `iso_3166_2 TAB WKT`, Vietnam's 63 provinces (~68 KB) | Natural Earth admin-1, **1:10m** (1:50m has no Vietnam provinces) |
| `tz-country.tsv` | `IANA zone TAB iso2` — single-country zones only (381 rows) | IANA `zone1970.tab` + `backward` link aliases |

Total ≈ 0.8 MB, inside the 2 MB budget. **Licences:** Natural Earth is public domain (naturalearthdata.com); the IANA tz
database is public domain (iana.org/time-zones). Coordinates are `(longitude, latitude)` = `(X, Y)`.

**Regenerate** (Node 18+, network; sources are downloaded to a git-ignored `geo-data/.work/`, mapshaper comes via `npx`):

```bash
cd modules/reference/reference-impl/geo-data
node build-geo-data.mjs
```

The script's `COUNTRY_KEEP` / `REGION_KEEP` / `PRECISION` constants are the simplification knobs (mapshaper `-simplify N% keep-shapes`,
coordinates rounded to 0.001° ≈ 110 m); it filters admin-1 to `iso_a2 === 'VN'`, reads countries by `ISO_A2_EH` (Natural Earth
gives France and Norway `ISO_A2 = -99`), drops features with no 2-letter code (Somaliland, N. Cyprus, Siachen), and writes WKT.
Regenerated files are reviewed as a diff of row counts + the resolver spec, never edited by hand.

`GeoBoundaryResolver` builds its index lazily on the first lookup (~150-220 ms, tens of MB) with a self-managed
double-checked-locking field — **not** `@Lazy`, which did not defer LOC-4's equivalent and eager init ran `:server:test` out of
memory. Copy that field pattern, not the annotation.

## Gotchas

- **Boundary accuracy is limited, on purpose — the result only pre-fills a form.** Simplified polygons put a coastal point
  (Manhattan, Suva) offshore → no match; a point within a few km of a border can land in the neighbour. Natural Earth's own
  province polygons are imperfect: central Cần Thơ (Ninh Kiều) is inside `VN-73` Hậu Giang in the *unsimplified* source too
  (pinned in `GeoBoundaryResolverSpec`; REF-3's 63 → 34 refresh replaces the set). Natural Earth *names* three provinces wrongly
  (`VN-39`, `VN-53`, `VN-66`); matching is by ISO code only, so it does not matter.
- **`zone1970.tab` merges zones, so some big zones deliberately resolve to no country:** `Asia/Tokyo` is `JP,AU` (an Australian
  bird observatory), `Europe/Paris` is `FR,MC`, `Asia/Bangkok` is `TH,CX,KH,LA,VN`. A shared zone must never guess a country —
  the caller falls through to the locale subtag. Link names browsers report (`Asia/Saigon`) resolve through the `backward` aliases.
- **Never delete a row — deactivate it (`is_active = false`).** Other domains store these ids. The batch
  `getXByIds` methods deliberately do **not** filter on `is_active` so an existing reference still shows its name;
  only the list endpoints and `requireValidSelection` are active-only.
- **Never assume a country's generated id** (Vietnam is not "id 1" by contract) — look it up by `iso2`.
- Callers resolve display data with **one batch call**, not one lookup per item (the repo's N+1 rule).
- No caching: the tables are tiny and the reads are indexed. Add a cache only with a measured reason.
- `CountryResponse.defaultLanguageCode` is returned as stored (nullable) and may name a language that is not active — a caller pre-filling a language must check it against `getActiveLanguages()`. Priority: explicit choice > browser language list > country default.
- `requireValidSelection` treats a region without a country as invalid, a country alone as valid.

## Adding a market (a country's regions)

Regions are **Vietnam-only by design** (`REFERENCE_DATA_DESIGN.md` § 8). To add another country's regions:

1. Make sure the country row exists in `countries` (REF-4 seeds the rest of ISO 3166-1; until then add it in the same migration).
2. Add a Liquibase migration inserting that country's `regions` rows (ISO 3166-2 code, English name, native name).
3. Add that country's admin-1 polygons: extend `geo-data/build-geo-data.mjs` (filter `iso_a2`, write `regions-<ISO2>.tsv`),
   regenerate, and load the new file in `GeoBoundaryResolver` (today it loads only `regions-VN.tsv`), so **every seeded region
   code has a polygon and vice versa** — `ReferenceApiIntegrationTest.boundaryData_matchesTheSeededRowsOneToOne` enforces it.
4. Extend `GeoBoundaryResolverSpec`: a known coordinate resolves to the expected region.
5. Add native-name display checks on the client if the language differs. No client or API change is otherwise
   needed — the dropdown is data-driven.
