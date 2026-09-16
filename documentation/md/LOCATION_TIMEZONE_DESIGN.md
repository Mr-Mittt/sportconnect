# Design: Location-Owned Timezones for Session Scheduling

**Status:** Proposed — direction agreed, several sub-decisions still open (see §6). Originally filed
as documentation-only placeholder **SESSION-32** (now `DONE` — its job was to get this design
written and split into real tickets, which has happened); tracked for implementation as:

- **LOC-4** — `Location` gains a real IANA timezone
- **SESSION-33** — `Session.scheduledStart` becomes a true instant, with a creator-zone fallback for
  location-less sessions
- **SESSION-34** — rewrites `findHistoryDateCounts` using `AT TIME ZONE` (supersedes **SESSION-31**,
  whose own JVM-offset point-fix was implemented, fully verified on H2 and real Postgres, and then
  deliberately reverted before merge once this redesign was chosen instead)
- **SESSION-35** — rewrites `/discover`'s `date`/`startTime` filters the same way (partially
  supersedes SESSION-25's `EXTRACT`+`MOD` correction)
- **CLIENT-SESSION-24** — client submits an offset-aware `scheduledStart` and its own browser
  timezone instead of a bare `LocalDateTime`

Written 2026-09-16, immediately after **SESSION-31** shipped
(`modules/session/docs/MVP/SESSION-31_HISTORY_DATE_COUNTS_TIMEZONE_BUG.md`), during a follow-up
discussion about *why* the timezone bug class (SESSION-25/27/31) was possible at all.

**Context:** SESSION-25/27/31 fixed three concrete, shipped bugs caused by
`hibernate.jdbc.time_zone: UTC` shifting `Session.scheduledStart` by the JVM's default zone on
write, then only reapplying that shift on plain attribute reads — never on a native SQL
`CAST`/`EXTRACT`. All three fixes were deliberately scoped to *that* mechanical bug, not to the
deeper question this document is about: **`scheduledStart` carries no timezone information on the
wire at all.** `CreateSessionRequest.scheduledStart` is a bare `java.time.LocalDateTime` — no
offset, no zone id — so every client, regardless of where its user physically is, is silently
assumed to mean "wall-clock time in whatever zone the server happens to be deployed in." Nothing in
the API shape reveals that assumption, and nothing enforces it.

---

## 1. What SESSION-31 fixed vs. what it deliberately left open

| | SESSION-25 / 27 / 31 (shipped) | This document (open) |
|---|---|---|
| Problem | A raw SQL function on `scheduled_start` reads Hibernate's un-reapplied shift, producing a wrong calendar day/time-of-day for the **same** intended value | The intended value itself has no recorded zone — client and server (or two different clients) may not even agree on what a given `LocalDateTime` means |
| Fix shape | JVM-offset correction (`+ zoneOffsetSeconds` before `CAST`/`EXTRACT`), matching the server's own zone exactly, because that's the same offset Hibernate used to shift on write | No fix yet — needs a real design decision about whose timezone governs a session |
| Scope boundary | Ticket-level: `findHistoryDateCounts` only (SESSION-31), `findDiscoverSessions` only (SESSION-25) | App-wide: touches `session-impl`, `location-impl`, request/response DTOs, and the client |

The SESSION-31 fix is correct and necessary regardless of what this document decides — it undoes a
real bug in how the *current* naive-`LocalDateTime` scheme behaves. But it's also the last fix this
scheme can absorb cleanly; every future query on `scheduledStart` inherits the same fragility
(a JVM-offset correction must be re-derived by hand for each new query shape, as SESSION-25's own
three failed attempts before landing on the `EXTRACT`+`MOD` pattern demonstrate).

## 2. Proposed direction: sessions get a canonical zone via their `Location`

A court, pitch, or venue is a physical place — it has exactly one real-world timezone, and that
timezone doesn't change per viewer. This makes `Location` a natural, real-world-grounded source of
truth for a session's canonical zone, rather than inventing a zone concept on `Session` itself or
relying on whichever client happened to create it.

**Two changes together, not one:**

1. **`Location` gains a real timezone** (an IANA zone id string, e.g. `Asia/Ho_Chi_Minh` — not a
   raw UTC offset, since an offset alone can't express DST transitions correctly across a year).
2. **`Session.scheduledStart` becomes a true instant** (`java.time.Instant` /
   `OffsetDateTime` in Java, `TIMESTAMPTZ` in Postgres) instead of a naive `LocalDateTime`, and
   `hibernate.jdbc.time_zone: UTC`'s write-side shifting is no longer in the picture for this column
   at all. Clients submit `scheduledStart` as an offset-aware ISO-8601 string
   (`"2026-09-14T04:00:00+07:00"`); Jackson's deserialization for `OffsetDateTime`/`Instant` already
   rejects a string with no offset, so this is enforced by the request shape itself, not by
   convention.

Once storage is a true instant, **the ambiguity that made SESSION-25/27/31 possible disappears
structurally** — every client's submission normalizes into the same UTC-instant space regardless of
what offset it arrived with, so there is no "raw stored value vs. reapplied shift" divergence left
to have a bug in.

### 2.1 `TIMESTAMP` vs. `TIMESTAMPTZ`, concretely

A common misreading of `TIMESTAMPTZ` is that it stores the timezone a value arrived with. It
doesn't — it stores a single UTC instant, and prints it back differently depending on *who's
asking*. Verified live against the real dev Postgres, one row inserted once, read back under three
different session `TimeZone` settings:

```sql
CREATE TEMP TABLE tz_demo (id int, naive TIMESTAMP, aware TIMESTAMPTZ);

SET TIME ZONE 'Asia/Ho_Chi_Minh';
INSERT INTO tz_demo VALUES (1, '2026-09-14 04:00:00', '2026-09-14 04:00:00+07');
```

| Session `TimeZone` | `naive` (today's `scheduled_start`) | `aware` (proposed type) |
|---|---|---|
| `Asia/Ho_Chi_Minh` (the writer's own zone) | `2026-09-14 04:00:00` | `2026-09-14 04:00:00+07` |
| `UTC` | `2026-09-14 04:00:00` | `2026-09-13 21:00:00+00` |
| `America/New_York` | `2026-09-14 04:00:00` | `2026-09-13 17:00:00-04` |

**`naive` never moves** — it's exactly today's bug surface: the same digits regardless of who reads
them, which is precisely why a native `CAST`/`EXTRACT` and Hibernate's attribute-shift could
disagree about what they mean (SESSION-25/27/31). **`aware` is one stored instant, displayed three
different ways** — same row, same underlying value, three different printed strings, because
Postgres normalized the `+07` away into a UTC instant (`2026-09-13T21:00:00Z`) the moment it was
inserted and never kept the original offset anywhere.

Relying on the *session's* `TimeZone` setting to get the right display would just be a different
flavor of the same implicit-setting problem this whole design exists to remove — a query should
never depend on ambient connection state to be correct. `AT TIME ZONE` sidesteps that: it converts
the same stored instant explicitly, per call, independent of any session setting:

```sql
SELECT
  aware AT TIME ZONE 'Asia/Ho_Chi_Minh' AS wall_clock_in_hcm,
  aware AT TIME ZONE 'America/New_York' AS wall_clock_in_ny,
  aware AT TIME ZONE 'UTC'              AS wall_clock_in_utc
FROM tz_demo;
```

| `wall_clock_in_hcm` | `wall_clock_in_ny` | `wall_clock_in_utc` |
|---|---|---|
| `2026-09-14 04:00:00` | `2026-09-13 17:00:00` | `2026-09-13 21:00:00` |

Same instant, three unambiguous wall-clock answers — one per purpose (§3): the location's zone for
canonical date bucketing, the caller's own zone for a time-of-day search filter. This is the query
shape §4's mechanics section builds on.

## 3. Two different "whose zone" questions — decide them separately

The discussion that produced this document surfaced a distinction worth stating explicitly, because
conflating the two is an easy mistake: an instant has no calendar date or time-of-day until you pick
a zone to view it through, and *which* zone is the right one depends on **why** you're asking.

| Question | Recommended zone | Why |
|---|---|---|
| "What calendar date is this session on?" (`GET /history?dateCount` bucketing, any date display) | The session's **location's** zone | A shared event has one real date. Using each viewer's own zone would let the same match show as "the 14th" to one participant and "the 15th" to another — confusing for something everyone is jointly attending. |
| "Does this session's start time fit what I'm looking for?" (`/discover`'s `startTime` filter) | The **caller's own** zone | A time-of-day filter is inherently personal — "show me sessions starting before 9am my time" only means something in the caller's own clock. Forcing the caller to think in the location's zone to search defeats the filter's purpose. |

**Worked example validated in discussion:** a session created for `04:00` at a location in `UTC+7`
is the exact same instant as `05:00` in `UTC+8` (both are `21:00` UTC the prior day — the 1-hour
offset difference exactly matches the 1-hour clock difference). A caller in `UTC+8` filtering
`startTime=05:00` correctly reaching that session isn't a coincidence to guard against — it's the
whole point of storing a real instant. Everyone can search in their own clock and correctly find
events happening at the same real moment, with no mental timezone math required from any user.

## 4. Mechanics once storage is a true instant + a location zone exists

Both mechanisms below replace ad hoc, hand-derived offset corrections (SESSION-31's
`zoneOffsetSeconds`, SESSION-25's `EXTRACT`+`MOD` pattern) with Postgres's built-in, per-value
`AT TIME ZONE` conversion — no service-layer arithmetic re-derivation needed per new query shape:

```sql
-- Canonical date bucketing (findHistoryDateCounts' successor) — per-row zone from the
-- session's own Location, joined in, not a single global offset:
SELECT CAST(s.scheduled_start AT TIME ZONE l.timezone AS date) AS sessionDate, COUNT(*)
FROM sessions s JOIN locations l ON l.id = s.location_id
...

-- Time-of-day filter (findDiscoverSessions' startTime successor) — caller's own zone,
-- supplied as a parameter:
SELECT ...
WHERE EXTRACT(HOUR FROM s.scheduled_start AT TIME ZONE :callerZone) * 3600 + ... <= :startTimeSeconds
```

`AT TIME ZONE` does the entire conversion in one step, correctly, per row, including DST — something
the current naive-`LocalDateTime` scheme cannot do at all (it has exactly one implicit zone: the
JVM's).

**What the DB still cannot do on its own:** supply `:callerZone`. That value has to come from
somewhere outside the query — the API contract still needs to decide how (§6). This design removes
the *arithmetic* burden from the service layer, not the *sourcing* of the zone itself.

## 5. Rough blast radius (scoping input for whichever ticket eventually implements this — not exhaustive)

- **`location-api`/`location-impl`:** new `timezone` field on `Location` (migration + DTOs);
  `session-impl` already depends on `location-api` for batch `getLocationsByIds`, so the new
  per-row zone join reuses an existing cross-domain edge rather than introducing one.
- **`session-impl`:** `Session.scheduledStart` type change (`LocalDateTime` → `Instant`/
  `OffsetDateTime`; DB column `TIMESTAMP` → `TIMESTAMPTZ`), plus a new `originZoneId` column
  capturing the creator's own zone as a fallback for location-less sessions (§6.1); every repository
  method touching `scheduledStart`/`scheduled_start` needs re-review under the new type
  (`findHistoryDateCounts`, `findDiscoverSessions`, `findUpcomingSessions(ByDate)`,
  `findHistorySessionsByDate`, `findSessionsToStart`/`ToComplete`, `findUnpreparedSessionsToCancel`).
  SESSION-31's own `zoneOffsetSeconds` correction — implemented, verified, then reverted before
  merge in favor of this redesign — becomes unnecessary once this lands.
- **`CreateSessionRequest`/`UpdateSessionRequest`:** `scheduledStart` becomes offset-aware; a client
  omitting the offset now fails deserialization (400) instead of silently defaulting — a genuine,
  intentional contract break for existing clients, not a compatible change.
- **Discover/upcoming/history request contracts:** need a caller-zone source added wherever a
  `date`/`startTime` filter is accepted (§6 below — undecided).
- **Client:** date/time pickers must capture and submit a real offset; any display logic currently
  assuming one implicit global timezone needs the location's or caller's zone made explicit.
- **Migration/backfill:** every existing `Location` row has no zone today; every existing `Session`
  row is a naive timestamp with no recorded authorial zone. Backfilling either is lossy — the only
  available assumption for old data is "whatever the server's JVM zone was at the time," which is
  exactly the assumption this design exists to stop making going forward.

## 6. Open questions

### 6.1 Settled direction (still needs implementation-time detail, but the shape is agreed)

- **Standalone/location-less sessions freeze the creator's own browser zone.** Rather than falling
  back to the server's zone (which would reintroduce the exact assumption this document exists to
  remove), a `PREPARING`/standalone session with no `locationId` records the creator's zone at
  creation time — a new `originZoneId` column (SESSION-33), sourced from the browser's
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Sourcing the client's own zone is not a hard problem.** `Intl.DateTimeFormat()` is a standard,
  years-old browser API with no permission prompt — unlike Geolocation, reading it is not gated at
  all. The client can attach it to every relevant request (session create/update, `/discover`
  search) automatically and silently. This resolves "where does the zone value come from" as a
  transport/plumbing question (a query param or header — SESSION-35 decides which), not an open
  feasibility question.

### 6.2 Still genuinely undecided — resolve at the owning ticket's pickup, don't guess

- **Precedence once a `PREPARING` session's `originZoneId` fallback is later superseded by a real
  `Location`.** SESSION-24's completion flow lets `locationId` be attached after creation. Does the
  canonical zone then switch to the location's timezone, or stay pinned to `originZoneId` forever?
  Switching could silently move which calendar date the session displays under, mid-lifecycle, for
  already-`JOINED` participants — a real, visible behavior change, not just an internal detail.
  Owned by **SESSION-33**; **SESSION-34** is blocked on it being resolved first.
- **Migration/backfill plan** for existing zone-less `Location` rows and existing naive-timestamp
  `Session` rows — one-time backfill vs. treating pre-migration data as permanently "unknown zone."
  Owned by **LOC-4** (locations) and **SESSION-33** (sessions).
- **Big-bang vs. incremental path** — e.g. add `Location.timezone` and require it for *new*
  locations first, while `Session.scheduledStart` keeps today's naive-`LocalDateTime` behavior for a
  transition period, vs. one coordinated change across both. Cuts across **LOC-4** and
  **SESSION-33**'s sequencing.

## 7. Why this isn't SESSION-31's problem to solve

CLAUDE.md's ticket-scoping discipline and SESSION-31's own Phase 1 gate both apply here: SESSION-31
was confirmed, at pickup, to be scoped to the specific `findHistoryDateCounts` correctness bug, with
"any broader Java/system-timezone assumption" explicitly named as out of scope. This document is
that broader conversation, given a permanent home per CLAUDE.md's Documentation Convention, rather
than being left to decay in a chat transcript.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
