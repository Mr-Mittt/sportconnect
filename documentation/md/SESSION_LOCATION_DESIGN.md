# Session & Location Domains — Design

**Status:** Backend implemented (2026-07-30). Client work not started.
**Related backlogs:** `modules/location/docs/BACKLOG_MVP.md`,
`modules/session/docs/BACKLOG_MVP.md`, `modules/social/group-impl/docs/BACKLOG_MVP.md`
(GROUP-RECUR-1), `client/docs/BACKLOG_MVP.md` (CLIENT-LOC-1/CLIENT-SESSION-1, not yet filed).

## Why

The product vision (`documentation/md/IDEA.md`) already names "Session" as the scheduled-activity
concept behind the future "Session Calling"/"Game Calling" system, but no backend for it existed
— the client's `UpcomingMatches` component (`client/docs/HF-4_UPCOMINGMATCHES.md`) was mock data
only. The trigger for this round: group owners/admins want to configure a **recurring** activity
(e.g. "every Tuesday, 7pm, at Court X") with the system automatically keeping the next occurrence
generated and past ones marked completed, configurable per group. Standalone (non-group) sessions
were needed too, and more session types (tournament, training) are expected later.

Mid-design, location grew into its own domain: rather than a raw lat/lng typed into each session,
location is modeled as a **shared, crowdsourced, sport-scoped entity** — "like an indoor stadium,
a geographic entity, shared across the whole app" — that any session (group or standalone)
references and reuses, and which a future Vendor/Facility feature can later claim and manage.

## Key decisions

- **New `modules/location` domain**, referenced by id from both `modules/session` and
  `modules/social/group-impl` — consistent with the repo's ID-only cross-domain rule instead of
  duplicating raw location fields on each. Any authenticated user can create a `Location`
  (crowdsourced); duplicates/junk are an accepted tradeoff for simplicity now.
- **`Location` is sport-specific, not a generic multi-sport venue.** A physical complex hosting
  both basketball and tennis is modeled as two separate rows — simpler than a many-to-many
  venue/sport relationship, and search is naturally scoped to the sport already chosen in the
  session-creation flow.
- **Every session references a `Location` by id** — no unsaved, throwaway inline location text.
  A standalone session searches the same shared list as a group-recurring one.
- **No paid/keyed map API.** Location capture: a "Find on Google Maps" link-out button opens
  Google Maps in a new tab (free); the user pastes the resulting share link back; the backend
  parses (or, for short `maps.app.goo.gl` links, resolves via a domain-allowlisted redirect
  follow) coordinates out of it; an OpenStreetMap/Leaflet preview (free, no key) renders a
  confirmable pin. Google and OSM both publish WGS84 (SRID 4326) coordinates — the same system
  this repo's PostGIS columns already use — so no conversion is ever needed. "Get directions"
  deep-links to the user's own maps app instead of embedding a routing engine (which would need
  self-hosting OSRM/GraphHopper for production use).
- **`Location.claimedByVendorId`** (nullable, no FK, no `Vendor` entity yet) is a bare placeholder
  for a future Facility/Vendor feature — replaces an earlier, since-dropped idea of a separate
  `facilityId` column on `Session`/`Group`.
- **`Group.schedule` (free-text) is kept, not replaced.** It's live and wired through the client's
  settings tab and e2e tests. New structured recurrence fields (day-of-week, time, duration,
  `recurrenceLocationId`) were added *alongside* it — `schedule` stays as owner-editable prose,
  the new fields are what the generation job actually reads.
- **Session recurrence generation always maintains exactly the single next occurrence** per group
  (not a multi-week window) — sufficient for now; extending later is additive.
- **`SessionType` reserves `TOURNAMENT`/`TRAINING`** enum values with no supporting logic, so
  adding those later doesn't require a schema rework.
- **No `CANCELLED` session status, no capacity/waitlist** — not requested, no notification/
  cleanup flow to back a cancel, so deliberately left out rather than half-built.
- **No distributed lock** on the scheduled job — fine for the current single-instance deployment;
  the `sessions.unique_group_session_start` DB constraint is the idempotency backstop.

## What shipped (backend)

| Ticket | What | Where |
|---|---|---|
| LOC-1 | `Location` entity/service/controller, Google Maps URL resolver (SSRF-guarded) | `modules/location/` |
| SESSION-1 | `Session`/`SessionParticipant`, manual create/get/list/update/delete/join/leave | `modules/session/` |
| GROUP-RECUR-1 | Structured recurrence fields on `Group`, `autoGenerateSessions` toggle, `GET`/`PUT /api/groups/{id}/recurrence` | `modules/social/group-impl/` |
| SESSION-2 | `SchedulingConfig`, `SessionGenerationService`, `SessionGenerationJob` (hourly generate, 15-min close) | `modules/session/`, `server/config/` |

Endpoints added: `POST /api/locations`, `GET /api/locations/{id}`,
`GET /api/locations/search?sportId=&q=`, `POST /api/locations/resolve-maps-url`,
`POST /api/sessions`, `GET /api/sessions/{id}`, `GET /api/sessions/group/{groupId}`,
`GET /api/sessions/mine`, `PUT`/`DELETE /api/sessions/{id}`, `POST /api/sessions/{id}/join`,
`DELETE /api/sessions/{id}/leave`, `GET /api/sessions/{id}/participants`,
`GET`/`PUT /api/groups/{id}/recurrence`.

## Explicitly out of scope this round

Full Calling System (Session Calling/Game Calling posts, slot-filling) · geo-proximity/nearby
search (GIST indexes added, no query built) · Vendor/Facility claiming of a `Location` ·
`Location` editing/moderation (create-only) · in-app turn-by-turn routing · payments · a
configurable multi-week generation window.

## Remaining work

**CLIENT-LOC-1** and **CLIENT-SESSION-1** (client UI) are not yet started — no ticket filed in
`client/docs/BACKLOG_MVP.md` yet. See the ticket breakdown in this design's originating plan
session for the intended scope (a `LocationPicker` component using `leaflet`/`react-leaflet`, and
wiring session create/list/join/leave into the client, replacing the mock `UpcomingMatches`).
