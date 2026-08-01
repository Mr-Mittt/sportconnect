# Location Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/location/location-impl`
**Last updated:** 2026-08-02

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
| 2 | LOC-2 | Favorite locations | `DONE` |

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

## LOC-2 — Favorite locations

**Status:** `DONE` (2026-08-02, `modules/location/location-impl/docs/LOC-2_FAVORITE_LOCATIONS.md`)

**Filed:** 2026-08-01, split out of the client's `CreateSessionModal` redesign
(`client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`) — the draft requirement replaces
the modal's single "Choose location" button with a dropdown of the caller's favorite locations
(sport-filtered), plus a selectable-heart favorite toggle on `LocationPicker`'s search-result rows.

New join table (e.g. `user_favorite_locations`: `userId`, `locationId`, unique pair, no `sportId`
column — a favorite's sport is always resolved by joining to `Location`, never denormalized;
considered and declined during scoping since the write-time gate below already ties every favorite
to a sport transitively via `UserSportProfile`) — a `Location` being shared/crowdsourced (per LOC-1)
means favoriting is per-user, not a column on `Location` itself. Endpoints:
`POST /api/locations/{id}/favorite`, `DELETE /api/locations/{id}/favorite`,
`GET /api/locations/favorites?sportId=` (paginated, `sportId` required — same pattern
`GET /api/locations/search` already uses; filters via a join to `Location`, not a stored column).

**Favorite gating (decided during scoping, 2026-08-01):** favoriting a location requires the caller
to hold an active `UserSportProfile` for that location's sport — reuse
`UserSportProfileService.hasProfileForSport` via the `sport-api` interface, the exact same gate
`GroupServiceImpl.createGroup` already applies for group creation. Reject with `BadRequestException`
(400) if the caller has no active profile for the location's sport. This keeps favorites scoped to
sports the user actually plays, consistent with how "sport" is gated everywhere else it matters in
this codebase (see `client/.claude`-adjacent process note: `.claude/commands/workon.md`/`feature.md`
Phase 2's "cross-domain concept precedent" check, added specifically because this exact gate was
missed on first pass).

**Client follow-up (not filed yet):** the heart toggle on `LocationPicker`'s search results, and
populating `CreateSessionModal`'s favorites dropdown (CLIENT-SESSION-2 ships that dropdown as an
empty shell — just the trailing "Choose a location" entry — specifically so this follow-up only has
to wire data into an already-built UI, not build the field twice).
