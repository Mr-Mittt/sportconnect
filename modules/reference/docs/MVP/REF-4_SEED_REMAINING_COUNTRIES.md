# REF-4 · Seed the remaining ISO 3166-1 countries

**Status:** `TODO`
**Type:** Data Maintenance
**Depends on:** REF-1, REF-2 (both DONE)
**Filed:** 2026-09-25, at REF-1 pickup — the user narrowed REF-1's `countries` seed to Vietnam ("the rest is later").
Original design: all ~250 countries (`documentation/md/REFERENCE_DATA_DESIGN.md` § 3).

## What

Add every ISO 3166-1 country except Vietnam to `countries` (`iso2`, `iso3`, English `name`, `is_active = true`) with
one Liquibase data migration. The schema, API and client are unchanged — the dropdown is data-driven.

- Source: a reproducible, licence-clear list (e.g. generated from the JDK's ISO data or the ISO 3166-1 list); record the
  source and date in `REFERENCE_DATA_DESIGN.md` and the module's `CLAUDE.md`.
- Set `default_language_code` (added by REF-1's V074) for a new country only when that language exists in `languages` (today `en`, `vi`);
  otherwise leave it `NULL` — a null default is valid and means "no pre-fill".
- Never renumber or delete existing rows (users may already reference Vietnam by `country_id`); insert only.
- **No polygon work:** REF-2 shipped `geo/countries.tsv` with every country (239 rows, 237 distinct codes — Natural Earth splits `AU`). Seeding a country makes the resolver start returning it; there is nothing to extend.
- Restore the REF-2 fixture relaxed for the Vietnam-only period: `ReferenceApiIntegrationTest.resolve_coordinatesInAnUnseededCountry_isAnAllNullOkNotAnError` (Paris) becomes France with no region. Also check `boundaryData_matchesTheSeededRowsOneToOne` — the country side is one-directional (every seeded country has a polygon), so it stays green, but every newly seeded `iso2` must exist in `countries.tsv`.
- **Timezone caveat (REF-2 finding):** `tz-country.tsv` keeps only single-country zones (`zone1970.tab` + `backward` aliases), so merged zones (`Asia/Tokyo` = `JP,AU`, `Europe/Paris` = `FR,MC`, `Europe/Berlin`, ...) resolve to no country and the locale subtag takes over. When seeding a country whose main zone is merged, decide whether that loss matters. The regenerator is `reference-impl/geo-data/build-geo-data.mjs`.

## Edge cases

- Safe on a database where a row already exists (`iso2` is UNIQUE) — guard with a precondition or `NOT EXISTS`.
- Regions stay Vietnam-only (a separate decision, `REFERENCE_DATA_DESIGN.md` § 8): the new countries have an empty region list.
- Account lifecycle: data-only migration, no endpoint — no caller check applies.

## Tests

- `ReferenceApiIntegrationTest`: country count and a spot-check of `iso2`/`iso3` pairs; `VN` keeps its id.
- REF-2 resolver spec: the unseeded-country case flips to a seeded one (Paris → FR, no region).

**Out of scope:** regions for the new countries; localized country names (client `Intl.DisplayNames`).
