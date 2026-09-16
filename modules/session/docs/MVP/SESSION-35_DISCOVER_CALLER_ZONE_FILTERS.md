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
only means something in the searching caller's own clock, not the session's location's clock. This
is a genuinely different canonical zone than SESSION-34's date-bucketing fix uses for
`/history?dateCount` — not the same fix reapplied to a second endpoint.

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
  syntax needed for a timezone correction in a native/JPQL query).

## Open questions — resolve at pickup, don't guess

- **Caller-zone sourcing.** `/discover` needs the caller's own timezone to evaluate `startTime`
  correctly, and nothing supplies one today — checked `user-impl`, no timezone field exists on a
  user's profile. Options: a required query param (client sends
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, see CLIENT-SESSION-24) or a header. Decide the
  transport before implementing the query change — this is an API contract addition, not just an
  internal refactor.

## Out of scope

`/history?dateCount`'s bucketing (SESSION-34 — a different canonical zone, the session's own, for a
different purpose) and every other `/discover` filter param untouched by timezone (`title`,
`locationId`, `minOpenSlots`, `feeType`, `maxFeeAmountVnd`, `status`).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
