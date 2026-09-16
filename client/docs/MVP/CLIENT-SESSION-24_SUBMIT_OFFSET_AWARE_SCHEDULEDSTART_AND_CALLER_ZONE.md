# CLIENT-SESSION-24 · Submit offset-aware `scheduledStart` and the browser's own timezone

**Status:** `TODO`
**Depends on:** backend SESSION-33 (offset-aware `scheduledStart` contract) and SESSION-35 (caller-zone
transport for `/discover`'s `startTime` filter) — **hard-blocked** on both; the request shapes this
ticket builds against don't exist until they ship.
**Filed:** 2026-09-16, spawned from `documentation/md/LOCATION_TIMEZONE_DESIGN.md`.

Today the client submits `scheduledStart` as a bare local datetime string with no offset — the
backend silently assumes it means the server's own JVM timezone. Once SESSION-33 requires an
offset-aware value, and SESSION-35 needs the caller's own zone for `/discover`'s `startTime` filter,
the client needs to start sending both.

## Scope

- **Session create/update:** build `scheduledStart` as an offset-aware ISO-8601 string (the request
  DTO's new shape per SESSION-33) instead of a bare local datetime. The offset for a given date/time
  is computed per-selection, not cached once, since DST can change it between "now" and a date weeks
  out.
- **Discover search:** attach the browser's IANA zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to `/discover` requests per SESSION-35's
  chosen transport (query param or header — follow whatever that ticket lands on). No permission
  prompt is needed for this — `Intl.DateTimeFormat` is a standard, ungated browser API, unlike
  Geolocation.
- Update the relevant MSW handlers (`client/e2e/mocks`) to match both backends' new request shapes
  once those tickets' real contracts are known.

## Out of scope

Any UI for picking a timezone explicitly (e.g. "schedule for a different timezone than mine") — this
ticket only makes the client honest about the browser's own zone, not a timezone-selection feature.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
