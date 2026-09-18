# CLIENT-SESSION-24 · Submit offset-aware `scheduledStart` and the browser's own timezone

**Status:** `TODO`
**Depends on:** backend SESSION-33 (offset-aware `scheduledStart` contract), SESSION-34
(`viewerZoneId` on `/history?dateCount` — done, see below), and SESSION-35 (caller-zone transport
for `/discover`'s `startTime` filter) — **hard-blocked** on all three; the request shapes this
ticket builds against don't exist until they ship.
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md`. **Scope extended
2026-09-17/18** once SESSION-34 shipped its own caller-zone param (`/history` scope bullet below).

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
- **Discover search:** attach the same browser IANA zone to `/discover` requests per SESSION-35's
  chosen transport (query param or header — follow whatever that ticket lands on; check whether it
  reused `viewerZoneId`'s name/shape for consistency with `/history`, per that ticket's own updated
  "Open questions"). No permission prompt is needed for any of these — `Intl.DateTimeFormat` is a
  standard, ungated browser API, unlike Geolocation.
- Update the relevant MSW handlers (`client/e2e/mocks`) to match all three backends' new request
  shapes once every dependency's real contract is known.

## Out of scope

Any UI for picking a timezone explicitly (e.g. "schedule for a different timezone than mine") — this
ticket only makes the client honest about the browser's own zone, not a timezone-selection feature.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
