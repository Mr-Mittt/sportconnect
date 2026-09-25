# REF-3 · Refresh Vietnam's regions and boundaries to the current province list

**Status:** `TODO`
**Type:** Data Maintenance
**Depends on:** REF-1, REF-2
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone" — risk #1 in
`documentation/md/REFERENCE_DATA_DESIGN.md` § 13. Vietnam merged provinces in mid-2025 (63 → 34); REF-1/REF-2 seed
whichever set the chosen Natural Earth release ships, which may still be the pre-merger list.

## What

Bring `regions` (Vietnam) and `geo/regions-VN.tsv` in line with the **current** official province list, keeping the
1:1 invariant between seeded region codes and bundled polygons.

1. Establish the authoritative current list (ISO 3166-2:VN and/or the official government list) and record the source
   and date in `REFERENCE_DATA_DESIGN.md` § 8.
2. A Liquibase migration that adds new regions, deactivates (`is_active = false`, **never delete** — users may already
   reference them by `region_id`) regions that no longer exist, and re-points nothing silently.
3. Decide, **at pickup, with the user**, what happens to `users.region_id` / `locations.region_id` that point at a
   deactivated region: map to the successor region where the merge is unambiguous (many-to-one), otherwise leave
   the id and let the client show "please update your region". Do not guess.
4. Rebuild `geo/regions-VN.tsv` from a source that reflects the merged boundaries; if no public dataset does, dissolve
   the old polygons per the merge table and record that as an approximation.
5. Update the resolver spec fixtures (HCMC/Hanoi expectations may change).

**Out of scope:** any other country; changing the "Vietnam-only regions" decision.

**Tests:** the REF-2 invariant spec (every seeded code has a polygon and vice versa) is the main gate; add a
migration test/IT asserting deactivated regions are excluded from `GET /api/reference/countries/{id}/regions` but still
resolve for existing `region_id` references via `getRegionsByIds`.
