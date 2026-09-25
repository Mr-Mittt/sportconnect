# REF-2 · Offline boundary resolver + public `POST /api/reference/resolve`

**Status:** `TODO`
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
