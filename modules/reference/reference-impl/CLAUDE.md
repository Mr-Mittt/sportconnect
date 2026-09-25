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

This domain depends on **no other domain** — every other domain depends on `reference-api`, never the reverse.
Other domains store `countryId` / `regionId` as plain ids (no DB foreign key into these tables) and resolve names
through the batch methods.

## Key Classes

| Class | Purpose |
|---|---|
| `Language`, `Country`, `Region` | Entities. `Region.countryId` is a plain id (the one FK, `regions.country_id`, is intra-domain) |
| `ReferenceServiceImpl` | Active-only lists; batch `getCountriesByIds` / `getRegionsByIds`; `isActiveLanguage`; `requireValidSelection` |
| `ReferenceController` | The three public `GET` endpoints |

REF-2 adds `GeoBoundaryResolver` and `POST /api/reference/resolve`.

## Endpoints (all public — `SecurityConfig` permits `GET /api/reference/**`)

```
GET /api/reference/languages                       active languages, by sort_order
GET /api/reference/countries                       active countries, by name
GET /api/reference/countries/{countryId}/regions   active regions; 404 for an unknown/inactive country, [] when none
```

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

Currently seeded: languages `en`, `vi`; **countries: Vietnam only** (REF-4 adds the rest of ISO 3166-1); **regions:
Vietnam only**, the 63 ISO 3166-2:VN provinces/municipalities (REF-3 refreshes to the 2025 merger, 63 → 34).

## Gotchas

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
3. (REF-2 onward) add that country's admin-1 polygons to the bundled `geo/` resources and load them in
   `GeoBoundaryResolver`, so **every seeded region code has a polygon and vice versa**.
4. Extend the resolver spec: a known coordinate resolves to the expected region.
5. Add native-name display checks on the client if the language differs. No client or API change is otherwise
   needed — the dropdown is data-driven.
