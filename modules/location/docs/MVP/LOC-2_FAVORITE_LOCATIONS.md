# LOC-2 · Favorite locations

**Status:** `DONE` (2026-08-02)
**Module:** `modules/location/location-impl`
**Spec:** `modules/location/docs/BACKLOG_MVP.md` § LOC-2

## Design (as approved)

Filed while scoping the client's `CreateSessionModal` redesign (`CLIENT-SESSION-2`), which wants a
favorites dropdown for the location field. Backlog spec: favorite/unfavorite a `Location`, list the
caller's favorites filtered by sport.

Two scoping questions resolved with the user before implementing:

1. **No `sportId` column on the favorite row.** Considered denormalizing it (locations' `sportId`
   is immutable — create-only, no edit path — so there'd be zero staleness risk), but declined:
   the write-time gate below already ties every favorite to a sport transitively via an active
   `UserSportProfile`, so a redundant column wasn't worth the duplication. `GET /favorites?sportId=`
   resolves the sport via a join to `Location` instead.
2. **Favoriting requires an active `UserSportProfile` for the location's sport.** This was *not* in
   the original scope — it surfaced because a first attempt at this design proposed a bare
   `sportId` filter with no connection to how "sport" is gated everywhere else in this codebase.
   `GroupServiceImpl.createGroup` already validates the creator holds an active profile for a
   sport via `sport-api`'s `hasProfileForSport`; this ticket reuses the exact same method for the
   exact same reason. (This miss is also why `.claude/commands/workon.md`/`feature.md` gained a
   new Phase 1/2 "cross-domain concept precedent" check — grep how a shared concept like `sportId`
   is already gated elsewhere before proposing a new rule for it, not after.)

A third question — whether a join table or a new `UserSportProfile` column made more sense — was
raised mid-design and resolved in favor of the join table: favoriting is a genuine many-to-many
relationship (one user, many locations; one location, many favoriters), not a scalar attribute of
a `(user, sport)` profile row. Cramming it into `UserSportProfile` (as an array column, or the
existing `attributes` JSONB) would mean no `UNIQUE(user, location)` constraint for free, awkward
cascade-on-delete, and — per the same lesson covered while scoping the shuttlecock-brand
recommendation idea — the wrong tool once you need to filter/join on membership rather than just
display a scalar fact. It also would have pulled a new cross-domain dependency into `sport-impl`
(which has none on `location-api` today) for no benefit, versus staying entirely inside
`location-impl`, which already owns `Location` and already depends on `sport-api`.

## What was built

**Migration** — `V038__create_user_favorite_locations.sql`: `user_favorite_locations` (`id`,
`user_id UUID REFERENCES users(id)`, `location_id BIGINT REFERENCES locations(id)`, `created_at`,
`UNIQUE(user_id, location_id)`), `idx_user_favorite_locations_user_id`. DB-level FKs to `users`/
`locations` match `post_likes`' own precedent (a DB FK across domains is fine — the architecture
rule bans JPA `@ManyToOne` across domains, not DB constraints).

**Entity** — `UserFavoriteLocation` (`location-impl/entity/`): same shape as `PostLike` (`id`,
`userId`, `locationId`, `createdAt`), no JPA relationship to `Location`.

**Repository** — `UserFavoriteLocationRepository`: `existsByUserIdAndLocationId`,
`deleteByUserIdAndLocationId`, and `findFavoritesByUserIdAndSportId` — an implicit JPQL join
against `Location` (`SELECT l FROM Location l, UserFavoriteLocation f WHERE f.locationId = l.id
AND f.userId = :userId AND l.sportId = :sportId`), safe since both entities live in this module.
Returns `Page<Location>` directly so `LocationServiceImpl` reuses its existing `toResponse`/
`resolveSportNames` helpers unchanged — same batched sport-name resolution `searchLocations`
already uses, no N+1.

**Service** — extended `LocationService`/`LocationServiceImpl` (not a new service class, matching
how `PostService` houses both post and like operations) with `favoriteLocation`,
`unfavoriteLocation`, `getFavoriteLocations`. New constructor dependencies:
`UserFavoriteLocationRepository`, `UserSportProfileService` (from `sport-api` — already a
`build.gradle` dependency via the existing `sportName` enrichment, just not injected until now).
Toggle semantics mirror `PostServiceImpl.likePost`/`unlikePost` exactly: `BadRequestException` on
a duplicate favorite or an unfavorite-when-not-favorited, not a silent no-op.

**Controller** — three new `LocationController` endpoints, mirroring `PostController.likePost`/
`unlikePost`'s response shape (200, `ApiResponse<Void>`) exactly:
```
POST   /api/locations/{locationId}/favorite    ROLE_USER
DELETE /api/locations/{locationId}/favorite    ROLE_USER
GET    /api/locations/favorites?sportId=       ROLE_USER (personal — unlike search/get, not public)
```

**Real bug found and fixed while verifying against a live server (see Verification):**
`GlobalExceptionHandler` had no handler for `MissingServletRequestParameterException` — a missing
required `@RequestParam` (e.g. omitting `sportId`) fell through to the generic `Exception.class`
handler, returning 500 "An unexpected error occurred" instead of the 400 every affected endpoint's
own Swagger docs promise. This wasn't introduced by this ticket — `GET /api/locations/search` has
had the exact same `@RequestParam Long sportId` shape (and the same latent bug) since LOC-1, just
never caught because `search`'s own "requires a sportId" test only calls the service method
directly with `null`, never exercising real HTTP request binding. Fixed by adding a
`MissingServletRequestParameterException` → 400 handler to `GlobalExceptionHandler`, mapping the
message to `"<paramName> is required"` — fixes both `getFavoriteLocations` and `searchLocations` at
once. New Spock coverage in `GlobalExceptionHandlerSpec` (the dummy test controller's
`@RequestParam` had to be explicitly named — `@RequestParam Long sportId` unnamed throws a
*different* exception in a Groovy-compiled class than it does in real `javac`-compiled controllers,
since Groovy doesn't retain parameter names the same way; naming it sidesteps the mismatch without
weakening what's actually being tested).

## Verification

- `./gradlew :modules:location:location-impl:test` — all tests pass, including 8 new cases
  covering: favorite success, location-not-found (404), no-active-profile gate (400), duplicate
  favorite (400), unfavorite success, unfavorite-when-not-favorited (400), missing-sportId on list
  (400), and the sport-filtered list query.
- `./gradlew :server:test` — full suite green (Spring context loads cleanly with the new
  `LocationServiceImpl` constructor dependencies).
- **Live server verification against a real running Postgres** (a dev-stack container was already
  up): started `:server:bootRun` against it, registered a real user, created a real `Location` for
  Badminton, and drove the entire flow over HTTP — confirmed by direct response inspection, not
  assumed:
  1. Favoriting **without** an active Badminton profile → 400 "You need an active profile for this
     location's sport to favorite it" (the gate, working as designed).
  2. Created a Badminton `UserSportProfile`, favorited successfully (200).
  3. Favoriting again → 400 "You have already favorited this location".
  4. `GET /favorites?sportId=<badminton>` → the one favorite; `GET /favorites?sportId=<tennis>` →
     empty page (correct sport-scoping).
  5. `GET /favorites` with no `sportId` → **500** (the bug above, caught here) → fixed → re-verified
     → 400 "sportId is required".
  6. Unfavorited successfully (200); unfavoriting again → 400 "You have not favorited this
     location"; the sport-filtered list reflected the removal.
  7. Confirmed the same fix also corrects `GET /api/locations/search` with no `sportId`.
  - `V038` was confirmed to apply cleanly against real Postgres (Liquibase log: "ran successfully").
  - Full module + server test suites re-run green after the `GlobalExceptionHandler` fix.

## Explicitly out of scope / follow-ups

- No client work — `CreateSessionModal`'s favorites dropdown and `LocationPicker`'s favorite-heart
  toggle (both noted in `CLIENT-SESSION-2`) aren't filed as a client ticket yet; file once picked up.
- No cap on favorites (unbounded, per an explicit MVP decision — matches LOC-1's own
  "don't add constraints the MVP doesn't need yet" philosophy).
- No favorite-count-per-location endpoint ("how many people favorited this location") — not
  requested, `findFavoritesByUserIdAndSportId` is user-scoped only.

---

**Status:** `DONE` (2026-08-02, `modules/location/docs/MVP/LOC-2_FAVORITE_LOCATIONS.md`)

**Filed:** 2026-08-01, split out of the client's `CreateSessionModal` redesign
(`client/docs/MVP/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`) — the draft requirement replaces
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
