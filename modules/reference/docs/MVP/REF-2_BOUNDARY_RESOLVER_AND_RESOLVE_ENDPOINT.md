# REF-2 · Offline boundary resolver + public `POST /api/reference/resolve`

**Status:** `DONE` (2026-09-25)
**Type:** New Feature
**Depends on:** REF-1 (seeds Vietnam only as of 2026-09-25 — see the note below)
**Blocks:** LOC-5, CLIENT-REF-1, U16 (its register path uses no resolver, but its client counterpart does)
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md` §§ 5–7).

## What

Give the `reference` domain the ability to turn what a browser can tell us into reference rows — **without IP
geolocation**.

**`GeoBoundaryResolver`** (`reference-impl`): lazily builds an in-memory JTS `STRtree` from classpath resources,
using the same double-checked-locking lazy field as `LocationTimeZoneResolver` (LOC-4; eager init caused
`OutOfMemoryError` across `:server:test`'s many Spring contexts, and `@Lazy` did not defer it — copy the field
approach, not the annotation):

- `geo/countries.tsv` — Natural Earth admin-0 (all countries), 1:50m, simplified, `iso2<TAB>WKT`
- `geo/regions-VN.tsv` — Natural Earth admin-1 trimmed to Vietnam, `iso_3166_2<TAB>WKT`
- `geo/tz-country.tsv` — IANA `zone1970.tab`-derived timezone → country table

Parse WKT with `WKTReader` from `jts-core` (already used by `user-impl`/`location-impl`; **no new dependency**).
Resource budget ≈ ≤ 2 MB; simplify with mapshaper/ogr2ogr and record the exact commands in `reference-impl/CLAUDE.md`
so the files are reproducible. Data licensing (Natural Earth public domain; IANA tz public domain) goes in the same file.

Lookup: region polygon → (region, its country); else country polygon → (country); else empty. Never throws. Coordinates
are `(longitude, latitude)` = `(X, Y)`; build points with `GeometryFactory(new PrecisionModel(), 4326)`.

**`ReferenceService` additions** (`reference-api`): `resolveByCoordinates(double latitude, double longitude)` →
`Optional<GeoMatch>` (used by LOC-5), and `resolve(ResolveGeoRequest)` → `ResolvedGeoResponse`.

**`POST /api/reference/resolve`** — public:

```json
{ "locales": ["vi-VN","en-US"], "timeZoneId": "Asia/Ho_Chi_Minh", "latitude": 10.78, "longitude": 106.70 }
```
```json
{ "language": {…}|null, "country": {…}|null, "region": {…}|null, "source": "COORDINATES|TIMEZONE|LOCALE|null" }
```

- Language: first `locales` entry whose primary subtag is an active language code (`vi-VN` → `vi`); none → **the resolved country's `defaultLanguageCode`** when that language is active (REF-1 scope change 2 — the browser's list wins over the country default), else `null`.
- Country priority **coordinates > timezone > locale region subtag** (`vi-VN` → VN); `source` says which won.
- Region: coordinates only; a coordinate in a country with no seeded regions returns country, `region: null`.
- Every part nullable; an unresolved request is a `200` with all-null, never an error.
- Validation: `locales` ≤ 10 entries and each ≤ 35 chars; `latitude` ∈ [-90, 90], `longitude` ∈ [-180, 180]; both-or-neither → else `400`.
- `SecurityConfig`: `POST /api/reference/resolve` → `permitAll`.

**Note — countries are seeded for Vietnam only (REF-1 scope change, 2026-09-25; the rest is REF-4).** The resolver
turns a polygon/timezone/locale match into a *seeded* `countries` row; a match for a country with no row yields
`country: null` (`source` then falls through to the next signal, or `null`) — never an error. Decide at pickup whether
`geo/countries.tsv` ships all countries now (so REF-4 is data-only) or Vietnam only; either way the invariant test is
one-directional for countries: **every seeded country has a polygon**.

**Delta (2026-09-25, at pickup, user decision):** `geo/countries.tsv` ships **all countries** now (not Vietnam only), so
REF-4 is data-only for polygons. Resolved with the same pickup decisions: resolve to **active** rows only; a country with
no seeded/active row falls through to the next signal; `source` names the signal that produced the country (`null` when
the country is `null`); region only when coordinates won; malformed locales/timezone ids are ignored (only size/range
violations are `400`); `tz-country.tsv` is built from `zone1970.tab` **plus** `backward` link aliases whose canonical
target is single-country (so `Asia/Saigon` → VN; `zone1970.tab` alone omits link names browsers report).

**Account lifecycle:** public, read-only, no caller identity — no `isActive` check applies. There is **no rate-limiting
infrastructure** in the codebase; inputs are capped and the work is a cheap in-memory lookup — note this in the ticket
conclusion rather than building rate limiting here.

## Tests

- **Spock** `GeoBoundaryResolverSpec` against the **real bundled polygons** (share one lazily built resolver via
  `@Shared`, as `LocationTimeZoneResolverSpec` does): Ho Chi Minh City → `VN-SG`; Hanoi → its Vietnamese region; a point in an
  **unseeded** country (Paris) → no country (until REF-4 seeds FR, then FR with no region); a mid-ocean point → empty; an out-of-range coordinate → empty (not an exception); **every seeded
  Vietnam region code has a polygon and every polygon has a seeded row**.
- **Spock** resolve-priority spec: coordinates beat timezone beat locale subtag; language matching (`vi-VN`, `en`, `fr` →
  null); a timezone spanning several countries is not used to guess a country; all-null on empty input.
- **IT** (extend `ReferenceApiIntegrationTest`): anonymous `POST /resolve` succeeds through the real security chain; HCMC
  coordinates resolve to the seeded `VN-SG`; `latitude` without `longitude` → `400`; 11 locales → `400`. **Prove the real
  Spring context starts and the lazy init does not `OutOfMemoryError`** (LOC-4's failure mode).

**Out of scope:** consumers of the resolver (LOC-5, U16); IP geolocation; regions outside Vietnam; a rate limiter.

## Implementation summary (2026-09-25)

**Status: DONE.** Approved design, restated, then what was built.

### Design (as approved)

`GeoBoundaryResolver` in `reference-impl` builds a JTS `STRtree` of prepared polygons plus a timezone map lazily, on the
first lookup (self-managed double-checked-locking field, LOC-4's pattern — not `@Lazy`), from three classpath resources
generated by a checked-in script. It answers in ISO codes only (`locate` -> `Hit(iso2, regionIsoCode?)`,
`countryForTimeZone`); `ReferenceServiceImpl` turns codes into **seeded, active** rows. `resolve` collects country candidates
in priority order (coordinates > timezone > each locale region), loads them with one `IN` query and takes the first seeded
one; language from the locales, else the country default when active; region only when coordinates won. `POST /resolve` is
bean-validated and public through one exact `SecurityConfig` permit. `resolveByCoordinates` is the `-api` method for LOC-5.

### What was built

- **`reference-api`:** `ResolveGeoRequest` (validated), `ResolvedGeoResponse`, `GeoSource` (`COORDINATES|TIMEZONE|LOCALE`),
  `GeoMatch`; `ReferenceService.resolve` / `resolveByCoordinates`; `spring-boot-starter-validation` added.
- **`reference-impl`:** `GeoBoundaryResolver`; `ReferenceServiceImpl` (`resolve`, `resolveByCoordinates`, 4th constructor
  dependency); `POST /resolve` on `ReferenceController`; `findByIso2InAndIsActiveTrue`, `findByIsoCodeAndIsActiveTrue`,
  `findByCodeInAndIsActiveTrue`, `findByCodeAndIsActiveTrue`; `jts-core:1.19.0` + validation starter (no new dependency for the repo).
- **Data:** `geo/countries.tsv` (742 KB, all countries), `geo/regions-VN.tsv` (68 KB, 63 provinces), `geo/tz-country.tsv` (7 KB,
  381 zones) = 0.8 MB; generator `reference-impl/geo-data/build-geo-data.mjs` (work dir git-ignored).
- **`SecurityConfig` (auth-impl):** `POST /api/reference/resolve` -> `permitAll`, exact path only.
- **Docs:** module `CLAUDE.md` (endpoints, data, regenerate commands, licences, gotchas), design doc § 7 delta, root
  `CLAUDE.md` public-endpoints line, `IT_OVERVIEW.md`, `PROGRESS.md`, REF-4 and CLIENT-REF-1 updated.

### Divergences and findings — stated, not silently absorbed

- **`tz-country.tsv` is `zone1970.tab` + `backward` link aliases**, not `zone1970.tab` alone: browsers report link names
  (`Asia/Saigon`) that `zone1970.tab` omits. Consequence of the "never guess from a shared zone" rule on current tzdata: merged
  zones resolve to no country (`Asia/Tokyo` is `JP,AU`, `Europe/Paris` is `FR,MC`, `Asia/Bangkok`, `Europe/Berlin`, ...) and the
  locale subtag takes over. Harmless while only Vietnam is seeded (`Asia/Ho_Chi_Minh` and `Asia/Saigon` are single-country);
  worth revisiting when REF-4 seeds more countries — **not filed as a ticket** (a quality note on REF-4's data, not a defect);
  it is recorded in REF-4's ticket file instead.
- **All countries ship in `countries.tsv`** (user decision at pickup, recorded as a Delta above), so REF-4 no longer adds polygons.
- **Vietnam regions come from Natural Earth 1:10m** — the 1:50m admin-1 file has no Vietnam provinces (ticket said "trimmed to Vietnam").
- **REF-1's open question is closed:** its 63-province list was typed from memory; the invariant it deferred to this ticket
  passes — the 63 seeded ISO 3166-2:VN codes match Natural Earth's 63 codes exactly, both directions.
- **Source-data inaccuracies, pinned by tests rather than hidden:** central Can Tho resolves to `VN-73` (Hau Giang) — true of the
  *unsimplified* Natural Earth polygons too; three Natural Earth *names* (`VN-39`, `VN-53`, `VN-66`) are wrong but matching is by
  code, and their polygons sit where ISO 3166-2:VN says (Bien Hoa, Bac Kan, Hung Yen verified); coastal points (Manhattan, Suva)
  can land offshore in the simplified polygons. All acceptable for a pre-fill; REF-3 replaces the Vietnam set.
- **Validation error key:** the both-or-neither failure is reported under `data.coordinatePairComplete` (the bean-validation
  method name) — the client should map any `400` to a generic hint, not render field names (noted on CLIENT-REF-1).
- Locale country candidates are restricted to two-letter regions: `java.util.Locale` reports numeric UN M.49 regions (`es-419`)
  as a "country" too.

### Verification (what was actually run)

- **Spock:** `:modules:reference:reference-impl:test` — 88 tests, 0 failures (`GeoBoundaryResolverSpec` 41 against the **real**
  polygons; `ReferenceServiceImplSpec` 47, 26 of them new, resolver mocked to pin priority/fall-through deterministically).
- **IT:** `ReferenceApiIntegrationTest` 26 tests (14 existing + 12 new), 0 failures. **Mutation check:** with the `POST /resolve`
  permit temporarily removed, 9 of the 26 fail — the IT genuinely covers the security change; restored afterwards.
- **`:server:test` (full):** 26 classes, 329 tests, 0 failures, 0 errors, 0 skipped, no `OutOfMemoryError` (317 before this ticket).
- **Real Postgres:** `:server:bootRun --args=--server.port=8081` against the dev database (8080 was the developer's own IDE server,
  left untouched; it runs old code). Anonymous `curl`: HCMC coordinates + `en-US` -> `VN`/`VN-SG`/`en`/`COORDINATES`; `Asia/Saigon`
  -> `VN`/`vi` (country default)/`TIMEZONE`, region null; Paris -> all-null `200`; latitude only -> `400`; `PUT /resolve` -> `401`;
  `GET /countries` still `200`. Real index build logged at 154 ms on the running app. The 8081 instance was stopped afterwards.
- **N+1 scan:** no repository call inside a loop or `.map()`; `resolve` is at most 4 queries (one `IN` for all country candidates,
  one `IN` for all locale languages, then only the default-language and region lookups), `resolveByCoordinates` at most 2.
- **Client:** untouched (backend-only) — no e2e / visual-regression run applies.
- **Not verified:** no load/latency test of the endpoint under concurrency; the first-call index build (~150-220 ms) happens on a
  request thread. No rate limiting exists in the codebase (inputs are capped: 10 locales x 35 chars, 64-char zone, range-checked
  coordinates; the work is an in-memory scan) — none was built, as the ticket specified.

### IT changes (standing report)

- **Updated** `server/src/test/java/com/sportconnect/integration/ReferenceApiIntegrationTest.java` (14 -> 26 tests; new
  `GeoBoundaryResolver` autowire): anonymous `POST /resolve` through the real chain — coordinates (HCMC -> `VN-SG`), the
  `Asia/Saigon` alias with the country-default language, locale-only; an unseeded country (Paris) / empty body / open ocean as
  all-null `200`; deactivated region and country not returned; every size/range violation -> `400` and the boundary values accepted;
  junk locales / unknown zone ignored; the permit is not broader than the one exact `POST` (`PUT /resolve`, `POST /languages`,
  `POST /resolve/anything` stay `401`); `boundaryData_matchesTheSeededRowsOneToOne`; `resolveByCoordinates` through the `-api`
  contract. The first resolve builds the real index in a real Spring context (the lazy-init / no-OOM proof).
- **Updated** `documentation/md/IT_OVERVIEW.md` (row: 12 -> 26 tests, REF-2 description). No `schema.sql` change was needed.
- **Fixture that REF-4 must flip:** `resolve_coordinatesInAnUnseededCountry_isAnAllNullOkNotAnError` (Paris) — once FR is seeded it
  becomes France with no region. `GeoBoundaryResolverSpec`'s Paris case (polygon-only, FR) stays valid as is.

### Notes for the next tickets

- **LOC-5:** call `resolveByCoordinates(lat, lon)` once per venue create; it returns ids (`GeoMatch.country.id`, `.region.id`), empty
  for open ocean / an unseeded country / an invalid coordinate. A backfill over many venues is one call per venue by design (each is
  a point lookup); batch it only if a measured need appears.
- **CLIENT-REF-1:** see the Delta added to that ticket (the server already applies the country-default language inside `resolve`).
