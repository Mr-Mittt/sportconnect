# LOC-6 · Error code audit: location module

**Status:** `DONE` (2026-10-07)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **location**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-8** lists the final codes.

**Scope:** location create/read, favorite locations, coordinate/timezone validation.

**Known messages to start from (not exhaustive — the audit finds the rest):** about 9 throw sites; enumerate at pickup.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `GET /locations/{id}`, `POST /locations/{id}/favorite` | `Location not found with id: '…'` (404) | NOT_FOUND | `LOCATION_NOT_FOUND` | none (message `Location not found`, id logged) | Category copy for now; CLIENT-ERR-8 may add specific copy. Also reachable through session create/update and a group recurrence location (`LocationService.getLocation`). |
| `POST /locations` | Unknown or deactivated sport (404) | NOT_FOUND | `SPORT_NOT_FOUND` (reused, A25) | none | Unchanged. |
| `POST /locations/{id}/favorite` | No active profile for the location's sport (400) | VALIDATION | `LOCATION_SPORT_PROFILE_REQUIRED` | none | The user can fix it by adding the sport profile. |
| `POST /locations/{id}/favorite` | Already favorited (400 → **409**) | CONFLICT | `LOCATION_ALREADY_FAVORITED` | none | Refetch the favorites, show no error (double-click or second tab). |
| `DELETE /locations/{id}/favorite` | Not favorited (400 → **409**) | CONFLICT | `LOCATION_NOT_FAVORITED` | none | Refetch the favorites, show no error. |
| `POST /locations/resolve-maps-url` | Not a valid URL (400, two throw sites) | VALIDATION | `LOCATION_MAPS_URL_INVALID` | none | Inline on the URL field. |
| `POST /locations/resolve-maps-url` | Only Google Maps URLs are supported (400) | VALIDATION | `LOCATION_MAPS_URL_UNSUPPORTED` | none | Inline on the URL field. |
| `GET /locations/search`, `GET /locations/favorites` | `sportId is required` (400) | VALIDATION | none, generic | | The search controller's required request parameter rejects a missing `sportId` first; the service guard is a backstop. A client bug, nothing to act on. |
| `POST /locations/resolve-maps-url` | `url is required` (service guard; `@NotBlank` catches it first) | VALIDATION | none, `VALIDATION_FAILED` | | Generic. |
| `@Valid` field messages (name, address, sourceMapsUrl) | `name is required` and similar | VALIDATION | `VALIDATION_FAILED` (C12) | | Unchanged. |
| Coordinates / timezone | best-effort derivation, never throws | n/a | none | | No error surface. |
| **Deactivated caller** | no endpoint checks `isActive`; the JWT filter does not either | n/a | none | | Gets the same responses as any caller: the known U12 gap, out of scope. |

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-8**, filed alongside this ticket.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Scope decisions (2026-10-07, pickup)

- **6 new codes**, registered in `ERROR_CODES.md` § location: `LOCATION_NOT_FOUND` (404), `LOCATION_SPORT_PROFILE_REQUIRED` (400), `LOCATION_ALREADY_FAVORITED` (409), `LOCATION_NOT_FAVORITED` (409), `LOCATION_MAPS_URL_INVALID` (400), `LOCATION_MAPS_URL_UNSUPPORTED` (400). The unknown/deactivated sport on create reuses `SPORT_NOT_FOUND` (A25).
- **Status move (scope change, contract change):** the two favorite stale-state errors move 400 → 409, as A25 did for `SPORT_PROFILE_ALREADY_EXISTS`. Consumer census required (client: the six `features/location` hooks and MSW handlers).
- **Stay generic (not coded):** the two `sportId is required` 400s (search, favorites) and the `url is required` guard; `@Valid` field messages stay `VALIDATION_FAILED`.
- **Client behavior for the stale states:** almost always a double-click or a second tab, so the client refetches and shows **no error**. Recorded on CLIENT-ERR-8; the wider review of double-click UX across every module's shipped flows (not only location) is added to **CLIENT-ERR-9**, the last Phase C ticket, so it can survey everything once all codes exist.
- **Out of scope, unchanged:** client copy (CLIENT-ERR-8), U12 deactivated-token gaps (recorded in the audit only).
- **No ids in `*_NOT_FOUND` response messages (scope change, 2026-10-07, user decision):** `LOCATION_NOT_FOUND`'s message is just `Location not found`, with the id logged server side (`log.warn("Location {} not found", id)` at both throw sites, since `GlobalExceptionHandler.handleNotFound` does not log). Applied to the two earlier coded 404s as well, so the three agree: `SPORT_NOT_FOUND` (A25, `SportServiceImpl.sportNotFound`) becomes `Sport not found` and `COUNTRY_NOT_FOUND` (REF-5, `ReferenceServiceImpl`) becomes `Country not found`, each with the id in a server-side log line. Why: the client localizes from the code and never shows a NOT_FOUND message, and the id is not needed in the response. Census for the two modules: the client MSW sport handlers (`client/e2e/mocks/handlers/sport.ts`, 7 sites) mirror the old message and are updated to match; `ReferenceServiceImplSpec` asserts the old message and is updated; the historic C4 doc quotes the old sport message and is left as a record. `ERROR_CODES.md` rows carry no message text, so nothing to change there.

## Implementation summary (2026-10-07)

**Approved design, as built.** No migration, entity or DTO change.

- `LocationServiceImpl`: both `ResourceNotFoundException("Location","id",id)` sites go through a private `locationNotFound(id)` that logs `Location {} not found` and throws `ResourceNotFoundException.coded("LOCATION_NOT_FOUND", "Location not found", null)`. `LOCATION_SPORT_PROFILE_REQUIRED` is a coded `BadRequestException`; `LOCATION_ALREADY_FAVORITED` and `LOCATION_NOT_FAVORITED` are coded `ConflictException`s (409).
- `GoogleMapsUrlResolver`: the two "Not a valid URL" sites are `LOCATION_MAPS_URL_INVALID`, the host check is `LOCATION_MAPS_URL_UNSUPPORTED`.
- **No ids in `*_NOT_FOUND` messages (scope change, user decision):** also applied to `SportServiceImpl.sportNotFound` (`Sport not found`) and `ReferenceServiceImpl.getActiveRegions` (`Country not found`, the class gained `@Slf4j`), each with a `log.warn` carrying the id, because `GlobalExceptionHandler.handleNotFound` does not log.
- Javadoc: `LocationService` (`-api`) `@throws` with codes on favorite, unfavorite and resolve; `LocationController` `@ApiResponses` (favorite gains a 409 entry, unfavorite 400→409, resolve names both codes).
- `ERROR_CODES.md` § location added; "Still to come" now lists only NTF-5.

**Consumer census.** Client favorite/unfavorite hooks, session create/update (`getLocation`), group recurrence location and `SessionGenerationService`: compatible as-is (status unchanged except the two favorite 409s, which no client code branches on; `errorCode` is additive; the batch path never throws). MSW `locations.ts`: updated (two favorite errors to 409 + code, 404 gains `LOCATION_NOT_FOUND`). MSW `sport.ts` (7 sites): message updated to `Sport not found`. `ReferenceServiceImplSpec`: message assertion updated. Historic C4 doc quoting the old sport message: left as a record. Follow-ups: the double-click review is part of CLIENT-ERR-9 (scope added), the location favorites behavior and copy are CLIENT-ERR-8 (note added).

**IT changes.**
- **New** `server/src/test/java/com/sportconnect/integration/LocationErrorCodesIntegrationTest.java` (11 tests, real MockMvc + H2 + `GlobalExceptionHandler`): get and favorite of an unknown location (404 `LOCATION_NOT_FOUND`, message without id, no params); favorite without a profile (400); double favorite (200 then 409 `LOCATION_ALREADY_FAVORITED`); unfavorite when not favorited (409); create with an unknown and with a deactivated sport (404 `SPORT_NOT_FOUND`, message `Sport not found`); resolve with non-URL text and with a non-Google host (400 with each code); blank resolve url and blank create name (stay `VALIDATION_FAILED`).
- `server/src/test/resources/schema.sql`: added `user_favorite_locations` (V038 mirror).

**Tests.** Spock: `LocationServiceImplSpec`, `GoogleMapsUrlResolverSpec` (code, params and message beside each updated throw), `SportServiceImplSpec` and `ReferenceServiceImplSpec` (message). `:modules:location:location-impl:test`, `:modules:sport:sport-impl:test`, `:modules:reference:reference-impl:test` pass. Full `:server:test`: 525 tests, 0 failures, 0 errors (514 before plus the 11 new). Client: `tsc -b` clean; scoped e2e `matches-journey.spec.ts` + `locale.spec.ts`, 12 passed (the only specs touching the changed MSW handlers). The full e2e project, Vitest and visual-regression were not run (no client source changed, only MSW mocks).
