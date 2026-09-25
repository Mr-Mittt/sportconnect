# REF-4 · Seed the remaining ISO 3166-1 countries

**Status:** `TODO`
**Type:** Data Maintenance
**Depends on:** REF-1; REF-2 if its `geo/countries.tsv` ships Vietnam only (then this also adds the other polygons)
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
- If REF-2's `geo/countries.tsv` ships Vietnam only, extend it with the new countries' polygons so detection covers them.
- Restore the REF-2 fixtures relaxed for the Vietnam-only period (Paris → FR, no region).

## Edge cases

- Safe on a database where a row already exists (`iso2` is UNIQUE) — guard with a precondition or `NOT EXISTS`.
- Regions stay Vietnam-only (a separate decision, `REFERENCE_DATA_DESIGN.md` § 8): the new countries have an empty region list.
- Account lifecycle: data-only migration, no endpoint — no caller check applies.

## Tests

- `ReferenceApiIntegrationTest`: country count and a spot-check of `iso2`/`iso3` pairs; `VN` keeps its id.
- REF-2 resolver spec: the unseeded-country case flips to a seeded one (Paris → FR, no region).

**Out of scope:** regions for the new countries; localized country names (client `Intl.DisplayNames`).
