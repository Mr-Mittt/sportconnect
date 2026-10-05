# A25 · Error code audit: sport module

**Status:** `DONE` (2026-10-05)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **sport**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-4** lists the final codes.

**Scope:** sport catalog, user sport profiles (create/update/deactivate/reactivate), attribute-schema read/replace, admin sport editing.

**Known messages to start from (not exhaustive — the audit finds the rest):** `User already has a profile for sport: <name>`, `Invalid sport profile attributes`, `Sport profile attributes exceed the maximum allowed size (4KB)`, `Sport with name '<name>' already exists`, `You can only update/delete/view your own sport profile`, `ResourceNotFoundException("Sport", "id", id)`.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `POST /sports/profiles` | `User already has a profile for sport: <name>` (create, and resume of an active profile) | CONFLICT (**400 → 409**) | `SPORT_PROFILE_ALREADY_EXISTS` | `{sportName}` | Inline in the add-sport flow, then refetch so the list shows the real state |
| same, `isResume: true` | `No deactivated profile to resume for sport: <name>` | VALIDATION (400) | `PROFILE_NOT_RESUMABLE` | `{sportName}` | Inline in the add-sport flow |
| create, update | `Sport profile attributes exceed the maximum allowed size (4KB)` | VALIDATION (400) | `PROFILE_ATTRIBUTES_TOO_LARGE` | `{maxBytes}` | **Generic message** (user decision: the cap is internal, the user should not see it as such; no dedicated copy) |
| create, update | `Invalid sport profile attributes` (serialization failure, effectively unreachable) | VALIDATION (400) | `PROFILE_ATTRIBUTES_INVALID` | none | Generic message |
| `PUT`/`DELETE /sports/profiles/{id}`, `GET /sports/profiles/{id}` | `You can only update/delete/view your own sport profile` | FORBIDDEN (403) | `SPORT_PROFILE_NOT_OWNED` | none | Page state "no access" (not reachable from the UI, which only edits the caller's own profiles) |
| `GET`, `PUT`, `DELETE` profile by id, `GET /profiles/sport/{sportId}` | `UserSportProfile not found with …` (missing or soft-deleted) | NOT_FOUND (404) | `SPORT_PROFILE_NOT_FOUND` | none | Page state "profile gone", then refetch the list |
| `GET /sports/{id}`, user schema reads, `POST /profiles` | `Sport not found with id: '<id>'` (missing or deactivated) | NOT_FOUND (404) | `SPORT_NOT_FOUND` | none | Inline "this sport is no longer available" |
| profile body | bean-validation field errors (`Sport ID is required`, `Skill level is required`, …) | VALIDATION (400) | `VALIDATION_FAILED` (C12) | `{fields}` | Inline per field |
| all of the above | deactivated caller | UNAUTHENTICATED (401) | none (C12) | none | Session handling (CLIENT-ERR-1) |

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-4**, filed alongside this ticket.

## Scope changes at pickup (2026-10-05, user decisions)

1. **Normal-user errors only.** Sport data is admin-maintained and needs no localization, so errors reachable only by an admin (`POST/PUT/DELETE /api/sports`, `GET /api/sports/all`, the attribute-schema and session-attribute-schema `PUT` and `/all/...` reads, duplicate sport name, the `common.attributes` schema validators) are **out of scope** and stay uncoded. In scope is the user-reachable surface: `GET /api/sports`, `GET /api/sports/{id}`, the two authenticated schema reads, and `POST/GET/PUT/DELETE /api/sports/profiles...`.

**Out of scope:** admin-only sport editing and schema errors (see Scope changes); other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

## Implementation summary (2026-10-05)

**Design (as approved, restated):** no `common` changes; C12 already supplies the coded constructors, `ConflictException` and the `GlobalExceptionHandler` pass-through. A25 converts only the user-reachable sport errors (admin-only errors stay uncoded, user decision at pickup) and keeps every English message unchanged as the fallback.

**Built:**
- `UserSportProfileServiceImpl`: duplicate profile (create and resume) throws `ConflictException` `SPORT_PROFILE_ALREADY_EXISTS` via a private `alreadyHasProfile(sport)` helper (**400 → 409**); `PROFILE_NOT_RESUMABLE`, `PROFILE_ATTRIBUTES_TOO_LARGE` (`{maxBytes: 4096}`), `PROFILE_ATTRIBUTES_INVALID`; update/delete ownership through `profileNotOwned(action)`; the four profile 404s through `profileNotFound(field, value)` (keeps the stock "not found with" text).
- `SportController.getProfileById`: the view-own-profile 403 is `SPORT_PROFILE_NOT_OWNED`.
- `SportServiceImpl`: the three active-sport lookups (`requireActiveSportById`, `getAttributeSchema`, `requireActiveSport`) throw `SPORT_NOT_FOUND` through `sportNotFound(id)`. The admin `findById` 404s are untouched.
- Registry: sport section in `ERROR_CODES.md`; tracker row in `ERROR_HANDLING_DESIGN.md`; CLIENT-ERR-4's flow list now carries the final codes and drops the admin editors.
- Client mock: `client/e2e/mocks/handlers/sport.ts` returns the real codes and the 409 for duplicates (so CLIENT-ERR-4 builds on the real contract). No client source changed.

**Consumer census (duplicate profile 400 → 409):** `client/src` has no code reading that response or its message, so nothing breaks; the MSW handler is updated here; `UserSportProfileServiceImplSpec` updated; `SportProfileResumeAndVisibilityIntegrationTest` updated (codes added, statuses unchanged for the cases it covers). `SPORT_NOT_FOUND` also appears on the same lookup for `location-impl`, `session-impl` and `group-impl` creates: additive (status and message unchanged), compatible as-is, and CLIENT-ERR-4's copy can be reused by those flows (CLIENT-ERR-5/7 note it). No follow-up ticket needed.

**Found, not changed:** the group-create gate `You must have a sport profile for this sport to create a group` is a group-module 400 asserted by `SportActiveGateIntegrationTest`; it belongs to A11. `PUT /profiles/{id}` requires `sportId` and `skillLevel` in the body (bean validation), which the IT bodies had to include.

**Tests:**
- Spock: `UserSportProfileServiceImplSpec` and `SportServiceImplSpec` assert `errorCode`/`errorParams` beside each updated case (duplicate as `ConflictException`, the caps, resume, ownership, the profile and sport 404s).
- IT: new `server/.../integration/SportErrorCodesIntegrationTest` (12 tests, real MockMvc + H2): duplicate create and resume 409, nothing to resume 400, 4KB cap 400, update/delete/view 403, profile 404 (view, per-sport, update), inactive sport 404 on create and on `GET /api/sports/{id}`. Existing `SportProfileResumeAndVisibilityIntegrationTest` gains the code asserts.
- Results: sport-impl 91 tests, 0 failures; full `:server:test` 413 tests, 0 failures (BUILD SUCCESSFUL, 2m 18s); client `tsc -b` clean after the MSW handler change. Not run: client Vitest/e2e (no client source changed, only the MSW mock, which no current spec exercises for duplicate/resume), live `bootRun` smoke.

**Divergences from the design:** none.
