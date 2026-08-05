# SESSION-4 — Standalone Session Discovery

**Status:** DONE (2026-08-02)

## Scope

Filed to close a real gap: `GET /sessions/mine` only returns the caller's own standalone
sessions, and `GET /sessions/group/{groupId}` only one group's — there was no way to browse a
standalone session someone else created and isn't in any of the caller's groups. Bundles two
tickets deferred by design until this ticket's real query shape existed (**SESSION-7**, the
`sport_id` partial index) plus one addition agreed during scoping (a joined-sessions-by-status
endpoint, needed by a not-yet-built matches page).

## Decisions made during scoping

- **Exclusion rule:** discover excludes sessions the caller created (already covered by
  `/sessions/mine`) and sessions the caller **currently** has a `JOINED` participant row for. A
  session the caller left (`ParticipantStatus.LEFT`) is eligible to reappear.
- **Visibility gate:** not fully public — restricted to sports the caller holds an **active**
  `UserSportProfile` for. Built from `UserSportProfileService.getUserProfiles(callerId)` (which
  filters `isActive=true`), not `hasProfileForSport` (confirmed during research that it does
  **not** check `is_active` — `existsByUserIdAndSportId` ignores the flag; using it here would
  have silently included soft-deleted profiles).
- **Status filter:** `SCHEDULED` only, not `IN (SCHEDULED, ONGOING)` as the backlog originally
  sketched. Once a session goes `ONGOING` it's no longer something to discover-and-join — it only
  shows up in the caller's own joined list (see the `/joined` endpoint below).
- **sportId filter behavior:** if the caller passes a `sportId` they don't hold an active profile
  for, the endpoint returns an empty page rather than a 400 — consistent with "you just can't see
  anything there," not an error condition.
- **`sportId` promoted to `NOT NULL`:** `createSession` already required it on every path (request
  validation for standalone, inherited from the group for group-linked) since SESSION-1 — this
  ticket makes the schema enforce the invariant it already had, and removes a session with no
  sport as an ambiguous discover case.
- **SESSION-7 bundled:** its exact index shape was deliberately left undecided until SESSION-4's
  real query existed. Now that it does (`sport_id` + `status` + `scheduled_start`, scoped to
  standalone sessions), both ship in the same migration.
- **`/api/sessions/joined` added:** while scoping, a related future need came up — a "matches
  page" with three sections: (1) discover (this ticket), (2) the caller's own joined sessions that
  are `ONGOING`, (3) the caller's own joined sessions that are `COMPLETED`. Sections 2/3 need a
  distinct query (`SessionParticipant`-driven, spans both `STANDALONE` and `GROUP_RECURRING`
  sessions, unlike `/mine` which is standalone-only) that didn't exist yet, so it was added here
  rather than filed as a separate ticket. Takes a **required** single `status` — no "all statuses"
  mode, since nothing today needs it (client fires one call per section).

## What was built

**Migration** — `V039__enforce_session_sport_id_and_add_standalone_index.sql`:
```sql
ALTER TABLE sessions ALTER COLUMN sport_id SET NOT NULL;
CREATE INDEX idx_sessions_sport_id_standalone ON sessions(sport_id, status, scheduled_start)
    WHERE group_id IS NULL;
```
Verified against the real dev Postgres: zero existing rows had a null `sport_id` (the app-layer
invariant held in practice, not just in theory), and both the constraint and the index confirmed
present via `\d sessions` after Liquibase applied it.

**Entity** — `Session.sportId` → `@Column(nullable = false)`.

**Repository** (`SessionRepository`) — two new `@Query` methods, following the module's existing
`@Param`+trailing-`Pageable` idiom (no `Specification`/Criteria API used anywhere in this module):
- `findDiscoverSessions(status, sportIds, callerId, joinedStatus, pageable)` — `groupId IS NULL`,
  `status = SCHEDULED`, `sportId IN (caller's active sports, or the single requested one)`,
  `createdBy <> caller`, `id NOT IN (caller's currently-JOINED session ids)`.
- `findJoinedSessionsByStatus(status, userId, joinedStatus, pageable)` — sessions (any type) with
  a matching `SessionParticipant` row.

**`session-api`** — `SessionService` gains `discoverSessions(callerId, sportId, pageable)` and
`getJoinedSessions(userId, status, pageable)`.

**Service impl** — new `UserSportProfileService` dependency (sport-api). `discoverSessions`
resolves the caller's active-sport-id set once, intersects with the optional `sportId` filter,
short-circuits to `Page.empty()` when the resulting set is empty (zero active profiles, or a
requested sport that isn't one of them) — no query fired in that case. Both new methods reuse
`toResponsePage`/`mapToResponses` for batch enrichment, same as every other list method here.
Also dropped a now-dead `.filter(Objects::nonNull)` on the `sportIds` batch-collection stream in
`mapToResponses`, since `Session.sportId` can no longer be null.

**Controller** — `GET /api/sessions/discover` (optional `sportId`,
`@PageableDefault(sort="scheduledStart", direction=ASC)`) and `GET /api/sessions/joined`
(required `status`, no forced sort default — matches `/mine`/`/group` precedent). Both
`@PreAuthorize("hasRole('USER')")`; no `SecurityConfig` change needed — `/api/sessions/**` was
already under the authenticated catch-all.

**Tests** — Spock cases for: discover across all active sports (no filter), narrowed to one
requested sport, empty page when the requested sport isn't active for the caller (no query
fired), empty page when the caller has zero active profiles (no query fired), and
`getJoinedSessions` delegating with the given status.

## Verification

- `:modules:session:session-impl:test` — all pass.
- `:server:test` — 38/38 pass (Docker/Testcontainers required for Redis; confirmed clean once
  Docker was running — no session-module integration tests exist today, so this is evidence of no
  regression elsewhere, not direct coverage).
- Migration applied cleanly against the real dev Postgres (`sportconnect_dev`); `\d sessions`
  confirmed both the `NOT NULL` constraint and the new partial index.
- Full manual end-to-end flow against the running server (two real users, a real sport profile,
  location, and standalone session):
  - Discover shows a session before the caller joins it.
  - Discover excludes it once joined; `/joined?status=SCHEDULED` shows it instead.
  - Leaving the session makes it reappear in discover.
  - A user's own created session never appears in their own discover feed.
  - `sportId` filter for a sport the caller has no active profile for returns an empty page.

## Out of scope / follow-ups

- **Client:** discover browse UI (a modal, per scoping discussion) repointing
  `UpcomingMatches.onJoinMatch`; the 3-section matches page (discover / joined+ongoing /
  joined+completed) itself. Not filed as tickets yet.
- ~~**Not built:** an "all statuses" mode for `/joined` — add if a real caller needs it.~~
  **Built 2026-08-05 (CLIENT-SESSION-6 pickup):** `status` on `GET /api/sessions/joined` is now
  optional — omitted returns every status the caller has a `JOINED` row for in one page. Added
  because CLIENT-SESSION-6's single "My sessions" panel needs the caller's whole joined
  history/upcoming at once; a 4-call fan-out (one per `SessionStatus`) was the alternative. New
  repository method `findJoinedSessions` (no status predicate) alongside the existing
  `findJoinedSessionsByStatus`; `SessionServiceImpl.getJoinedSessions` branches on `status != null`.
  Fully backward compatible — existing callers passing a status are unaffected.
- SESSION-5 (capacity/fee), SESSION-6 (join-approval/invite) remain `TODO`, unaffected by this
  ticket.
