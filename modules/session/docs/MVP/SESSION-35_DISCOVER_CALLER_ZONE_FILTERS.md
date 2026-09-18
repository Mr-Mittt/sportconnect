# SESSION-35 · Rewrite `/discover`'s `date`/`startTime` filters for caller-zone semantics, retire the `EXTRACT`+`MOD` correction

**Status:** `TODO`
**Type:** Bug Fix (root-cause) / Refactor
**Depends on:** SESSION-33 (needs `scheduled_start` as `TIMESTAMPTZ`)
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md`. Partially
supersedes the timezone-correction code SESSION-25 introduced in
`SessionRepository.findDiscoverSessions` (the `date` half-open range and the `startTime`
`EXTRACT`+`MOD` correction) — not SESSION-25's feature scope itself. The 8 filter params, the
default status list, and the 3-level sort all stay exactly as shipped; only the timezone mechanics
behind `date`/`startTime` change.

SESSION-25's `date`/`startTime` filters were made correct against the *server's* JVM zone — the same
implicit assumption behind SESSION-31. Per `documentation/md/LOCATION_TIMEZONE_DESIGN.md` §3, a
`/discover` time-of-day filter is inherently **caller-relative**: "sessions starting before 9am"
only means something in the searching caller's own clock, not the session's location's clock.

**Scope correction (2026-09-17, mid-SESSION-34):** the design doc originally framed this as a
*different* canonical zone than `/history?dateCount`'s (session's location/origin zone vs. caller's
zone). That framing didn't survive SESSION-34's own implementation — a personal history view has
the same "caller-relative" property `/discover` does (pinning a date to somewhere the viewer no
longer is can show a completed session as "in the future" relative to the viewer's own current
clock), so SESSION-34 also ended up bucketing by the caller's own current zone, not the session's.
**Both endpoints now want the same kind of zone (the caller's current one) for different purposes**
(a time-of-day filter vs. calendar-date bucketing) — not two different zones. SESSION-34 established
a concrete precedent worth following here for consistency: an optional `viewerZoneId` query param
(IANA zone id), validated via `ZoneId.of(...)` → 400 if invalid, falling back to a fixed default
(`"UTC"`) when omitted rather than failing the request — see `SessionServiceImpl
.getSessionHistoryDates`/`DEFAULT_HISTORY_ZONE_ID`. `Session.originZoneId`/`location.timezone` are
no longer part of either endpoint's zone story — `origin_zone_id` was fully removed (`V070`) once
its only reader (SESSION-34's original design) was replaced by this caller-zone model.

## Scope

- `findDiscoverSessions`: `startTime` comparisons become
  `EXTRACT(HOUR FROM s.scheduled_start AT TIME ZONE :callerZone) ...` (replacing the
  `zoneOffsetSeconds`/`MOD` correction entirely) — `AT TIME ZONE` handles DST correctly per-value,
  which the current `MOD`-based correction structurally cannot.
- `date`: confirm at pickup whether the existing half-open `[dayStart, dayEnd)` shape can be kept
  (with its bounds computed in `:callerZone` rather than assumed to already align with it) or should
  also move to an `AT TIME ZONE` expression for consistency with `startTime`.
- Regression tests: real-Postgres verification alongside H2, same discipline SESSION-31's reverted
  attempt established for this bug class (H2 and Postgres previously diverged on the exact SQL
  syntax needed for a timezone correction in a native/JPQL query). **Known H2 gotcha found while
  building SESSION-34 (see `session-impl/CLAUDE.md`'s gotchas):** H2 2.2.224's `CAST(x AT TIME ZONE
  zone AS date/timestamp)` silently re-normalizes through the JDBC session's own default zone
  instead of preserving the shifted wall-clock fields the way real Postgres does, and doesn't
  throw — SESSION-34 had to route its date bucketing through `TO_CHAR(... , 'YYYY-MM-DD')` instead
  of a direct `CAST`. `EXTRACT(HOUR FROM x AT TIME ZONE zone)` (this ticket's own shape, no
  intermediate narrowing cast) was verified **not** to hit the same bug — H2 returns the correct
  hour directly — but re-verify empirically against both engines before trusting an H2-only green
  run if the `date` half of this ticket ends up needing any `CAST`/narrowing step of its own.

## Open questions — resolve at pickup, don't guess

- **Caller-zone sourcing.** `/discover` needs the caller's own timezone to evaluate `startTime`
  correctly, and nothing supplies one today — checked `user-impl`, no timezone field exists on a
  user's profile. **Precedent to follow (or deliberately diverge from) at pickup:** `/history`'s
  `viewerZoneId` — an optional query param, `ZoneId.of(...)`-validated with a 400 on invalid input,
  falling back to `"UTC"` when omitted rather than requiring it. Confirm whether `/discover` should
  use the same param name/shape for consistency (a caller sending one zone param across both
  endpoints) or has a real reason to diverge (e.g. a header, or requiring rather than
  defaulting) before implementing — this is an API contract decision either way, not just an
  internal refactor.

## Out of scope

`/history?dateCount`'s bucketing (SESSION-34 — same kind of zone, the caller's own, but used for
calendar-date bucketing rather than a time-of-day filter) and every other `/discover` filter param
untouched by timezone (`title`, `locationId`, `minOpenSlots`, `feeType`, `maxFeeAmountVnd`, `status`).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
