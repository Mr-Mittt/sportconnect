# LOC-4 · Location gains a real IANA timezone

**Status:** `DONE` (2026-09-16)
**Type:** Enhancement (Schema)
**Depends on:** none
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md` (§2, §5) —
foundational piece of the location-owned-timezone redesign that replaces SESSION-31's superseded
JVM-offset point-fix (`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`).

Add a `timezone` field to `Location` — an IANA zone id string (e.g. `Asia/Ho_Chi_Minh`), not a raw
UTC offset, since an offset alone can't express DST transitions correctly across a year. A court,
pitch, or venue is a physical place with exactly one real-world timezone that doesn't change per
viewer, which makes `Location` the natural canonical source `AT TIME ZONE` conversions in
`session-impl`'s queries (SESSION-34, SESSION-35) join against once a session has a real location.

**Scope change (2026-09-17, user decision):** the timezone is **derived automatically from
coordinates when they're available**, never manually entered — a location's real-world timezone is
a fact about where it physically sits, not something a creator should have to know or type.
`CreateLocationRequest.latitude`/`longitude` **stay optional, exactly as they are today**
(user decision — an earlier draft of this ticket considered making them required; rejected).
`timezone` is therefore **always nullable** on `Location`, best-effort: null when no coordinates
were given, and also null (not rejected, not defaulted) when coordinates are given but fall outside
every timezone polygon (open ocean, parts of Antarctica — user decision, see "Deriving the
timezone" below). Every downstream consumer (SESSION-34/35's `AT TIME ZONE` joins) must already
treat a location's timezone as possibly absent.

## Deriving the timezone

Chosen mechanism (user decision, 2026-09-17): **[`net.iakovlev:timeshape`](https://github.com/RomanIakovlev/timeshape)**
— an actively maintained, Maven-Central-published library built on JTS (the same geometry library
`location-impl` already uses for its PostGIS `Point`), embedding pre-built timezone-boundary polygon
data (the standard `timezone-boundary-builder` dataset) and doing an offline, in-process
point-in-polygon lookup: `(lat, lon) → IANA zone id`. No external network call, no API key, no
per-request third-party dependency — considered against two alternatives and rejected: an external
timezone API (adds a live third-party dependency to a write path, `location-impl` only has one HTTP-call
precedent today, `GoogleMapsUrlResolver`, and that's read-only/best-effort) and a Postgres-side
`ST_Contains` lookup against a loaded boundary-polygon reference table (viable, but needs an
extra migration to load and maintain a large geospatial dataset, whereas `timeshape` needs none).

- New dependency on `modules/location/location-impl/build.gradle` (exact version TBD at pickup —
  check Maven Central for latest stable).
- `LocationServiceImpl.createLocation` calls the timezone engine right after building the `Point`,
  only when `latitude`/`longitude` were both given, and persists whatever it returns (including
  "no match") onto `Location.timezone` — no rejection, no fallback default (user decision).
- **No manual-entry validation path needed** — since the value is derived, not user-typed, there's
  no untrusted string to reject with `ZoneId.of(...)` the way a manually-entered field would need.

## Scope

- Migration: new `timezone VARCHAR` column on `locations`, **nullable**, no other schema change —
  `latitude`/`longitude` stay exactly as they are today (still optional, still stored as the same
  `location geography(Point,4326)` column).
- `Location` entity + `location-api` DTOs (`LocationResponse`) gain the `timezone` field. No change
  to `CreateLocationRequest`.

## Open questions — resolve at pickup, don't guess

- **Consumer census required (CLAUDE.md § API Change Discipline).** `LocationResponse` is a shared
  DTO the client reads — grep `client/src`/`client/e2e/mocks` for every consumer before adding the
  field. A purely additive, nullable field is normally compatible-as-is, but confirm rather than
  assume.

## Resolved (2026-09-17, user decisions — recorded so pickup doesn't re-litigate them)

- **Backfill:** none needed as an automated migration step. Only a handful of real `Location` rows
  exist today — once the `timezone` column exists, any row that needs a value (including one this
  ticket's own derivation can't produce, e.g. missing coordinates or a no-match result) can be fixed
  with a direct manual `UPDATE locations SET timezone = '...' WHERE id = ...`, no tooling or backfill
  script required.
- **Post-creation fix:** no update endpoint added by this ticket. Same reasoning as the backfill
  point above — low current row count makes a manual DB correction a perfectly adequate fix path for
  now, consistent with `Location`'s existing create-only, accepted-tradeoff posture.
- **No-match coordinates (open ocean, Antarctica):** leave `timezone` null, don't reject the request
  and don't default to a fallback zone.

## Out of scope

Anything on the `Session`/`session-impl` side — that's SESSION-33/34/35. This ticket only gives
locations a zone to be read later; it doesn't change how any session query behaves.

## What was built

Matches the approved plan above exactly for the schema/entity/DTO/derivation shape, with one real
deviation found during Phase 5 verification (see "Deviation from plan" below).

- **Migration** `V068__add_timezone_to_locations.sql` — `locations.timezone VARCHAR(64)`, nullable,
  no backfill (per the resolved decisions above). Applied and verified against real dev Postgres.
- **Dependency** — `net.iakovlev:timeshape:2026b.29` (latest stable at pickup) in
  `location-impl/build.gradle`.
- **`Location.timezone`** (nullable `String`) and **`LocationResponse.timezone`** added.
- **`LocationTimeZoneResolver`** (new, `location-impl/service/`) wraps the engine: `Optional<String>
  resolve(double lat, double lon)`, mapping `TimeZoneEngine.query`'s `Optional<ZoneId>` to a zone-id
  string.
- **`LocationServiceImpl.createLocation`** calls the resolver right after building the `Point`, only
  when both coordinates are present, and persists whatever comes back (present or empty) onto
  `Location.timezone` unconditionally — no rejection, no fallback default.

**Verified empirically during Phase 4/5 (not just assumed from the library's description):**
- `TimeZoneEngine.query` never validates its input and delegates straight to the spatial index —
  confirmed by decompiling the actual bytecode (`javap`), not guessed.
- The bundled dataset gives **full global coverage**, including open ocean and both poles (nautical
  `Etc/GMT±N` zones, Antarctica territorial claims) — `(0, -140) → Etc/GMT+9`, both poles resolve to
  something too. A genuinely empty result only surfaces for physically invalid input (e.g.
  `latitude=200`), which also makes this the practical safety net for `CreateLocationRequest`'s
  pre-existing lack of latitude/longitude range validation (a separate, out-of-scope gap). The
  ticket's original "open ocean/Antarctica → null" framing was a reasonable *a priori* assumption
  that turned out to be empirically wrong once tested against the real library — corrected in the
  code's Javadoc and the test suite rather than left stale.

**Deviation from plan — a real production/testing incident, not a design change:**
`TimeZoneEngine.initialize()` builds a memory-heavy in-memory spatial index. Eagerly creating it as
a normal Spring singleton bean (the original Phase 3 plan) caused `OutOfMemoryError: Java heap
space` across `:server:test`'s many Spring context configurations — most of which never create a
location at all, since `LocationServiceImpl` sits transitively behind nearly every module (a single
eager init multiplied across every distinct test context Spring bootstraps). Two fix attempts before
landing on the third:
1. `@Lazy` on the `TimeZoneEngine` `@Bean` method itself — didn't defer anything; `TimeZoneEngine` is
   a `public final class`, and Spring's lazy-proxy support needs CGLIB subclassing, which a final
   class blocks. Confirmed via `javap` that the bean's factory method still ran eagerly.
2. `@Lazy` on `LocationTimeZoneResolver` (the non-final component holding the engine) instead —
   should work per Spring's documented "`@Lazy` on the target bean definition proxies all injection
   points" behavior, and the annotation was confirmed present in the compiled bytecode, but the same
   `OutOfMemoryError` still recurred in practice. Root cause not fully isolated within the time
   budget for this ticket.
3. **Landed:** stopped relying on Spring/CGLIB laziness entirely — `LocationTimeZoneResolver` now
   manages its own double-checked-locking lazy field, initializing `TimeZoneEngine` on the first real
   `resolve()` call regardless of how Spring wires the bean. Bulletproof against framework proxy
   behavior since there's none to depend on. A package-private constructor still allows tests to
   inject a pre-built engine (avoiding repeated expensive `initialize()` calls across test methods).

**Tests:**
- `LocationServiceImplSpec.groovy` — `createLocation` cases extended: coordinates → timezone
  derived; coordinates matching no polygon → timezone stays null (mocked resolver); no coordinates →
  resolver never called. `getLocation` extended to assert the field round-trips through
  `toResponse`.
- `LocationTimeZoneResolverSpec.groovy` (new) — real `TimeZoneEngine`, not mocked (same spirit as
  not mocking JTS geometry elsewhere in this module): 3 real-world coordinates resolve to their
  correct zones (Mountain View → `America/Los_Angeles`, Ho Chi Minh City → `Asia/Ho_Chi_Minh`,
  London → `Europe/London`); an out-of-range coordinate resolves to empty; the no-arg constructor's
  self-managed lazy path is exercised directly, not just the test-injection path.
- `:modules:location:location-impl:test` — green (34 tests).
- `:server:test` — green except the 6 pre-existing `SessionEventsConsumerIntegrationTest` RabbitMQ
  flake cases (SESSION-22, confirmed unrelated: all 6 pass in an isolated re-run of that class
  alone). Getting here required also bumping `commons-lang3` in both `location-impl/build.gradle`
  and `server/build.gradle` from Spring Boot's/an existing explicit 3.14.0 pin to 3.18.0+ —
  `timeshape`'s `commons-compress` transitive dependency needs `SystemProperties.getUserName(String)`
  (added after 3.13.0), and `server`'s own pre-existing explicit pin overrides both the Spring BOM
  default and `location-impl`'s own pin in `server`'s independent dependency resolution.
- **Live end-to-end verification against real dev Postgres**, not just H2: registered a real user,
  created a real `Location` via `POST /api/locations` with real Ho Chi Minh City coordinates
  (`10.7626, 106.6602`), confirmed the response carried `"timezone":"Asia/Ho_Chi_Minh"`, confirmed
  `V068` registered in `databasechangelog` and the column exists via `\d locations`. Test data
  cleaned up afterward.

No client change — `LocationResponse.timezone` is additive and nullable; no existing consumer reads
it yet (checked, zero references in `client/src`).

## Post-ship manual backfill (2026-09-16)

Exactly the "any row that needs a value can be fixed with a direct manual `UPDATE`" path this ticket
scoped in place of an automated backfill. Checked real dev Postgres for pre-existing `Location` rows
with coordinates but no `timezone` (created before this ticket shipped): 4 rows, all real coordinates
in and around Da Nang/Ho Chi Minh City. Derived each one's zone the same way production does —
via `LocationTimeZoneResolver` directly (a temporary probe test, removed immediately after, not left
in the suite) — all 4 resolved to `Asia/Ho_Chi_Minh`, then applied via a direct `UPDATE`. Also found
and cleaned up two leftover test rows from this ticket's own Phase 5 live-verification runs that
weren't fully deleted the first time (`id` 11/12, "Real E2E Court") — genuine test pollution, not
real data.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
