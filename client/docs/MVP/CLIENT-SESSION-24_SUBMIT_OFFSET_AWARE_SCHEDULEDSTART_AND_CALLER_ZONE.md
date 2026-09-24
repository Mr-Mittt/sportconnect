# CLIENT-SESSION-24 · Submit offset-aware `scheduledStart` and the browser's own timezone

**Status:** `DONE` (2026-09-24)
**Depends on:** backend SESSION-33 (offset-aware `scheduledStart` contract), SESSION-34
(`viewerZoneId` on `/history?dateCount`), and SESSION-35 (`viewerZoneId` on `/discover`,
`/upcoming?date`, and `/history?date`) — all three **shipped** (the original "hard-blocked"
wording is stale; refreshed at pickup 2026-09-24).
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md`. **Scope extended
2026-09-17/18** once SESSION-34 shipped its own caller-zone param (`/history` scope bullet below).
**Scope extended again 2026-09-18** once SESSION-35 also added `viewerZoneId` to `/upcoming?date`
and `/history?date` (consumer census run from that ticket — no live client caller of either
endpoint exists yet, only this still-`TODO` ticket and `CLIENT-SESSION-23`, so nothing broke, but
whichever of those two lands the actual `/upcoming`/`/history?date` calls needs to send it too).

Today the client submits `scheduledStart` as a bare local datetime string with no offset — the
backend silently assumes it means the server's own JVM timezone. Once SESSION-33 requires an
offset-aware value, and SESSION-34/35 both need the caller's own zone (for `/history?dateCount`'s
bucketing and `/discover`'s `startTime` filter respectively), the client needs to start sending all
three.

## Scope

- **Session create/update:** build `scheduledStart` as an offset-aware ISO-8601 string (the request
  DTO's new shape per SESSION-33) instead of a bare local datetime. The offset for a given date/time
  is computed per-selection, not cached once, since DST can change it between "now" and a date weeks
  out.
- **History (`GET /api/sessions/history?dateCount`):** attach the browser's IANA zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) as the `viewerZoneId` query param — SESSION-34
  already shipped this exact param name/shape (optional, `ZoneId.of(...)`-validated, 400 on invalid
  input, falls back to `"UTC"` server-side when omitted). A personal history view reads oddest when a
  date is pinned to somewhere the viewer no longer is, so this is what makes `/history?dateCount`
  actually bucket by the viewer's real current zone in practice, not just fall back to `"UTC"` for
  every real user.
- **Discover search:** attach the same browser IANA zone to `/discover` requests as `viewerZoneId`
  — SESSION-35 reused the exact same param name/shape as `/history?dateCount` for consistency (one
  zone param across every zone-aware listing endpoint), only valid alongside `date` or
  `startTimeFilter` (rejected otherwise). No permission prompt is needed for any of these —
  `Intl.DateTimeFormat` is a standard, ungated browser API, unlike Geolocation.
- **Upcoming/history-by-date (`GET /api/sessions/upcoming?date=`, `GET /api/sessions/history?date=`):**
  same `viewerZoneId` param, added by SESSION-35 alongside its `/discover` work — attach it whenever
  either call includes `date`, same rule as `/discover`. Whichever of **CLIENT-SESSION-23**
  (upcoming/history UI) or this ticket actually wires up these two calls first should send
  `viewerZoneId` on them from the start, not leave it for a later patch.
- Update the relevant MSW handlers (`client/e2e/mocks`) to match all four backends' new request
  shapes once every dependency's real contract is known.

## Out of scope

Any UI for picking a timezone explicitly (e.g. "schedule for a different timezone than mine") — this
ticket only makes the client honest about the browser's own zone, not a timezone-selection feature.

## Delta (2026-09-22, at CLIENT-SESSION-22's pickup)

**The "Discover search" scope bullet above is already done** — CLIENT-SESSION-22's widened scope
(see that ticket's own "Scope change (2026-09-22)" entry) now sends `viewerZoneId` on every
`/discover` and `/discover/counts` call itself, since SESSION-33/34/35 shipped before
CLIENT-SESSION-22 was picked up. When this ticket is picked up, skip the "Discover search" bullet
entirely (verify it's still wired, don't re-add it) and focus on session create/update's offset-aware
`scheduledStart` plus `/history?dateCount`/`/upcoming?date`/`/history?date`'s `viewerZoneId`, which
remain unbuilt.

## Implementation summary (2026-09-24)

**Why it was urgent:** backend SESSION-33 made `scheduledStart` a `java.time.Instant`, so the real
backend answered every client create with `400 "Malformed request"` (Jackson rejects the bare
`2026-09-24T11:00:00` the client sent). e2e never caught it because the MSW mock accepted any
string.

**Scope decision (Phase 1 gate, 2026-09-24):** no add/remove. The `/history?dateCount`,
`/upcoming?date` and `/history?date` calls have **no client caller yet** (that UI is
CLIENT-SESSION-23), so this ticket ships the shared zone helper and files the requirement there
(a **Delta** on CLIENT-SESSION-23's ticket: every such call must send `viewerZoneId`); the ticket's
own bullet already allowed "whichever of 23/24 wires those calls first". The Discover bullet was
already done via CLIENT-SESSION-22 and was verified still wired, not re-added.

**Design (as approved, no divergence):**
- `src/shared/lib/scheduledStart.ts` — `toOffsetAwareIso("yyyy-MM-ddTHH:mm")` →
  `formatISO(parse(...))`, e.g. `2026-09-24T11:00:00+07:00` (`Z` in UTC). No new dependency
  (`date-fns` already present, `date-fns-tz` not needed): the offset comes from the browser's own
  zone for the *selected* instant, so it is computed per selection (DST-correct for a date weeks
  out) and can never disagree with `viewerZoneId`. Spring-forward gap times resolve forward,
  fall-back overlaps to the earlier occurrence (ECMAScript `Date` rules, pinned by tests). Throws on
  an incomplete value (callers already gate on `scheduledStart !== ''`).
- `src/shared/lib/viewerZone.ts` — `getViewerZoneId()` moved here from
  `features/session/discoverParams.ts` (re-exported there; every existing importer unchanged) so
  CLIENT-SESSION-23 can use it without importing from Discover.
- `CreateSessionModal.tsx` payload now `scheduledStart: toOffsetAwareIso(scheduledStart)`.
  `UpdateSessionPayload`/`Session` type comments corrected (no LocalDateTime). No client code sends
  `scheduledStart` on update today, so nothing else needed changing there.
- MSW `sessions.ts`: create and update handlers now return 400 for an offset-less `scheduledStart`
  (mirrors SESSION-33). The existing create steps in `matches-journey.spec.ts` are the e2e proof —
  no new spec needed.

**Census:** response-side readers (`formatStartTime`, `formatSessionHeaderDateTime`,
`groupSessionsByDate`, `useUpcomingMatches`, `SessionDetailModal`) all go through `new Date(iso)` →
compatible as-is with offset/`Z` strings; e2e fixtures keep naive strings on purpose (converting
them to `Z` would shift rendered times per host zone and churn baselines for no gain).

**Real-backend check:** against the running dev backend, two deliberately invalid-elsewhere
`POST /api/sessions` probes (no session created): offset-less → `400 "Malformed request"`
(parse failure); `+07:00` → got past parsing and failed only the planted `capacity must be >= 0`
validation.

**Tests:** new `scheduledStart.test.ts` (8: Ho Chi Minh offset, round-trip instant, UTC `Z`, per-date
DST offset EST vs EDT, spring-forward gap, fall-back overlap, throws on incomplete, zone-name
shape); `CreateSessionModal.test.tsx` payload assertion now requires an offset suffix. Zone is pinned
per test via `process.env.TZ`.

**Verification:** `tsc -b` and eslint (touched files) clean; scoped Vitest 38 files / 351 green;
full Vitest **194 files / 1445 passed**.

**E2E:** `e2e` project **86 passed, 0 failed** (includes `matches-journey.spec.ts` "Matches journey"
and the `#ref` attributes create-payload test, both creating sessions through the now
offset-strict mock).

**Visual-regression expectation:** no baselined surface touched (no rendered change) — no baseline
change expected; a failing `visual-regression` run is the Windows noise floor plus the known
`/matches` gap awaiting CLIENT-SESSION-23, not a regression. Not run for this ticket.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
