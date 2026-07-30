# Location Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/location/location-impl`
**Last updated:** 2026-07-30

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | LOC-1 | Location domain backend — shared, sport-scoped venue directory | `DONE` |

---

## LOC-1 — Location domain backend

New `modules/location` domain: `Location` entity (sport-scoped, PostGIS point + name/address,
`claimedByVendorId` placeholder for a future Vendor/Facility feature), `LocationService`/
`LocationController`, and `GoogleMapsUrlResolver` — a small, SSRF-guarded helper that parses (or,
for short `maps.app.goo.gl`/`goo.gl` links, resolves via a redirect follow restricted to a Google
domain allowlist) coordinates out of a user-pasted Google Maps URL, without any paid/keyed map
API. See `documentation/md/SESSION_LOCATION_DESIGN.md` for the full design context (this module
was scoped alongside the `Session` domain — see `modules/session/docs/BACKLOG_MVP.md`).

**Endpoints:**
```
POST /api/locations                    ROLE_USER — create (any authenticated user)
GET  /api/locations/{id}
GET  /api/locations/search?sportId=&q= paginated typeahead, sportId required
POST /api/locations/resolve-maps-url   ROLE_USER — resolve only, no persistence
```

**Deferred (not part of LOC-1):** `Location` editing/moderation (create-only; crowdsourced
duplicates are an accepted tradeoff), Vendor/Facility claiming (`claimedByVendorId` is a bare
placeholder column, no `Vendor` entity, no claim flow), geo-proximity/nearby search (a GIST index
exists on `locations.location` but no query uses it yet).
