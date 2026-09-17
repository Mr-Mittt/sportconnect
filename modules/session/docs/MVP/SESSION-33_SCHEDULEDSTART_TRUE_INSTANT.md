# SESSION-33 · `Session.scheduledStart` becomes a true instant, with a creator-zone fallback for location-less sessions

**Status:** `DONE` (2026-09-17)
**Type:** Enhancement (Schema / Contract change)
**Depends on:** LOC-4 (soft — the type change itself doesn't need it, but the
location-vs-creator-zone precedence decision this ticket also has to make does)
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md` (§2, §2.1, §5) —
foundational piece of the location-owned-timezone redesign that replaces SESSION-31's superseded
JVM-offset point-fix (`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`).

`Session.scheduledStart` is today a naive `java.time.LocalDateTime` — no offset, no zone id —
shifted implicitly by `hibernate.jdbc.time_zone: UTC`'s write-side JVM-offset assumption, the root
cause behind SESSION-25/27/31's bugs. This ticket removes the ambiguity at the source instead of
continuing to patch symptom queries one at a time.

## Scope

- **Migration:** `sessions.scheduled_start` column type `TIMESTAMP` → `TIMESTAMPTZ`. Backfill
  existing rows by reinterpreting their naive value as the server's current JVM zone — the only
  available assumption for already-written data. (See `documentation/md/LOCATION_TIMEZONE_DESIGN.md`
  §2.1 for why `TIMESTAMPTZ` normalizes to a UTC instant regardless of what offset a value arrives
  with, verified against real Postgres.)
- **Entity/DTOs:** `Session.scheduledStart` → `java.time.Instant` (or `OffsetDateTime` — decide at
  pickup which Java type maps cleanest through Hibernate's `TIMESTAMPTZ` support).
  `CreateSessionRequest`/`UpdateSessionRequest`/`SessionResponse`'s `scheduledStart` become
  offset-aware — a client omitting the offset now fails deserialization (400) instead of silently
  defaulting. **This is an intentional, non-additive contract break**, not a compatible change —
  full consumer census required at pickup (CLAUDE.md § API Change Discipline): every backend caller
  of `SessionService`'s create/update/response paths, plus `client/src` and `client/e2e/mocks` for
  the field's shape.
- **New `originZoneId` column on `sessions`** (nullable, IANA zone id) — captures the creator's own
  browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, see CLIENT-SESSION-24) at
  creation time, for sessions with no `locationId` yet (`PREPARING`/standalone). Used as the
  fallback zone by SESSION-34/35's queries whenever `location_id IS NULL`.
- `hibernate.jdbc.time_zone: UTC`'s write-side shifting no longer applies to this column once it's
  `TIMESTAMPTZ`. Confirm no other `LocalDateTime` column in the app still needs that setting before
  even considering removing it globally — out of scope for *this* ticket to remove, just don't let
  this migration silently change behavior anywhere else.

## Resolved (2026-09-17, user decisions — recorded so SESSION-34/35 don't re-litigate them)

- **Precedence when a `PREPARING` session later gets a real `Location`:** `originZoneId` **stays
  pinned forever** once captured — a location attached later via `updateSession` never overrides
  it. Clarified during pickup that this only affects `/history?dateCount`'s calendar-date
  bucketing (SESSION-34), never how a session's own `scheduledStart` displays to any viewer (that's
  always the raw UTC instant, rendered client-side, identical either way). SESSION-34's join must
  therefore use **`COALESCE(s.origin_zone_id, l.timezone)`** — origin zone first — not
  `COALESCE(l.timezone, s.origin_zone_id)` as this document's original illustrative SQL had it.
- **Capture scope, as a direct consequence of "pinned forever":** `originZoneId` is captured
  **only** when `locationId` is null at creation — never for a session created with a real
  location, so a from-day-one location's own zone can never be overridden by a redundant fallback
  under the `COALESCE` above.
- **Java type:** `Instant` (not `OffsetDateTime`) — no offset is preserved by `TIMESTAMPTZ` anyway,
  so carrying one on the Java side would be misleading rather than informative.
- **`originZoneId` on `CreateSessionRequest`:** added now, nullable, unused by today's client —
  same "backend takes the field early" pattern as LOC-4, so CLIENT-SESSION-24 doesn't need a
  second backend release.
- **Backfill:** explicit `ALTER COLUMN ... TYPE TIMESTAMPTZ USING scheduled_start AT TIME ZONE
  'Asia/Bangkok'` (the JVM's own zone on this deployment, confirmed via `ZoneId.systemDefault()`)
  — deterministic, not dependent on the Liquibase-running connection's ambient session `TimeZone`.

## Out of scope

Rewriting the queries themselves (SESSION-34, SESSION-35) and the client's create/update UI
(CLIENT-SESSION-24) — separate tickets. This one is the schema/contract foundation they both build
on.

## What was built

Matches the approved plan above exactly, with one scope addition found necessary during
implementation (see "Deviation from plan" below).

- **Migration** `V069__scheduled_start_true_instant.sql` — `sessions.scheduled_start`/
  `scheduled_end_at` `TIMESTAMP` → `TIMESTAMPTZ` (`ALTER COLUMN ... USING ... AT TIME ZONE
  'Asia/Bangkok'`), new nullable `origin_zone_id VARCHAR(64)`. Registered in
  `db.changelog-master.xml`.
- **`Session` entity** — `scheduledStart`/`scheduledEndAt` → `Instant`; new `originZoneId`
  (`String`, nullable) with the "only set when location-less at creation" invariant documented in
  its Javadoc.
- **DTOs** — `CreateSessionRequest.scheduledStart`/`UpdateSessionRequest.scheduledStart` →
  `Instant` (Jackson rejects an offset-less string as a 400 — the intentional contract break).
  `CreateSessionRequest` gains optional `originZoneId`. `SessionResponse.scheduledStart`/
  `scheduledEndAt` → `Instant`.
- **`SessionRepository`** — 6 methods (`existsByGroupIdAndScheduledStart`,
  `findSessionsToStart`/`ToComplete`, `findUnpreparedSessionsToCancel`,
  `findUpcomingSessions(ByDate)`, `findHistorySessionsByDate`) got mechanical `LocalDateTime` →
  `Instant` param changes only — their comparisons are plain `>=`/`<=`/`<`, unaffected by the type
  change. `findDiscoverSessions`' `lowerBound`/`dayStart`/`dayEnd` params became `Instant` too; its
  `startTime*`/`zoneOffsetSeconds` `EXTRACT`+`MOD` correction was left mechanically as-is (SESSION-35
  owns replacing it) and re-verified live via the existing `SessionDiscoverIntegrationTest` (27
  cases, still green) rather than left as an unverified assumption. `findHistoryDateCounts` needed
  no Java-side change (its only typed param is `before: LocalDate`).
- **`SessionServiceImpl`** — `createSession`/`updateSession`'s `scheduledEndAt` computation moved
  from `.plusMinutes(...)` to `.plus(Duration.ofMinutes(...))` (`Instant` has no `plusMinutes`).
  `createSession` sets `originZoneId` only when `locationId` is omitted. `discoverSessions`/
  `getUpcomingSessions`/`getSessionHistory`'s `date`-based day-boundary computation moved to
  `date.atStartOfDay(ZoneId.systemDefault()).toInstant()` — preserves pre-migration behavior
  byte-for-byte; flagged in Javadoc as a placeholder, not a real caller/location-zone fix.
- **`SessionGenerationService`** — `startOngoingSessions`/`closePastSessions`/
  `cancelUnpreparedSessions`'s `now()`/`cutoff` moved to `Instant.now()`.

**Deviation from plan — a real necessary consequence found during implementation, not a design
change:** `generateUpcomingSessions`' `computeNextOccurrence` returns a wall-clock `LocalDateTime`
with no zone attached, which now needs a zone to become the `Instant` `Session.scheduledStart`
requires. This wasn't explicitly scoped in the original ticket text. Resolution: every
auto-generated session always has a real `recurrenceLocationId` (`hasCompleteRecurrenceRule`
requires it, so this path never needs an `originZoneId` fallback), so that location's own timezone
is the correct interpretation — `LocationService` is now injected into `SessionGenerationService`,
batch-resolving every distinct `recurrenceLocationId` across a run's configs once (`getLocationsByIds`,
no N+1), falling back to `ZoneId.systemDefault()` only when a location's own timezone is null
(LOC-4: best-effort, nullable).

**Tests:**
- `SessionServiceImplSpec.groovy` / `SessionGenerationServiceSpec.groovy` — updated for the new
  types; `SessionGenerationServiceSpec` also mocks the new `LocationService` dependency.
- `server/src/test/resources/schema.sql` — `sessions.scheduled_start`/`scheduled_end_at` →
  `TIMESTAMP WITH TIME ZONE`, new `origin_zone_id` column.
- 6 `server/.../integration/Session*IntegrationTest` classes updated for the new types
  (`UserDeactivationSessionRevocationIntegrationTest`'s unrelated `expiresAt` field left untouched).
- `:modules:session:session-impl:test` — green (162 tests).
- `:server:test` — green (231 tests, 0 failures/errors), `BUILD SUCCESSFUL in 1m 34s`, no repeat of
  the pre-existing `SessionEventsConsumerIntegrationTest` RabbitMQ flake this run.

**Known transitional gap, not fixed here (SESSION-35's job):** `/discover`'s `startTimeFilter`
correction (`SessionRepository.findDiscoverSessions`) was reverse-engineering the old JVM-shift
write bug this migration removes, not a general-purpose zone conversion. It happens to still work
correctly today (re-verified live) because pgjdbc's session `TimeZone` matches the JVM's own zone
on this deployment — an implicit-connection-state dependency, not a structural guarantee. Left
mechanically type-compatible; replacing it with an explicit `AT TIME ZONE` conversion is SESSION-35.

No client change in this ticket — `client/src/features/session/**` still sends a bare,
offset-less `scheduledStart` string, which will now fail 400 on create/update until
CLIENT-SESSION-24 ships. Accepted, per this ticket's own "intentional, non-additive contract break."

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
