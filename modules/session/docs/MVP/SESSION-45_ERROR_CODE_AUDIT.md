# SESSION-45 · Error code audit: session module

**Status:** `DONE` (2026-10-06)
**Type:** Enhancement
**Program:** Error handling · Phase B
**Depends on:** C12 (common)
**Filed:** 2026-10-02, from the I18N-4 review (`documentation/md/I18N_READINESS.md`): the client has no general error handling and the backend has no machine-readable error code. Program design and phase tracker: `documentation/md/ERROR_HANDLING_DESIGN.md`.

## What
Phase B of the error-handling program for **session**: (1) **check** every user-reachable endpoint of the module (controller → service throw sites, `-api` exceptions, `@Valid` messages, `ApiResponse.error` literals); (2) **categorize** each error with the C12 taxonomy and decide whether it is client-actionable or generic; (3) **define codes** for the actionable ones (with `errorParams` for interpolated values) and record them in `documentation/md/ERROR_CODES.md`; (4) convert the throw sites to coded exceptions; (5) cover the authorization/not-found boundaries with ITs; (6) confirm the paired client ticket **CLIENT-ERR-7** lists the final codes.

**Scope:** session lifecycle (create, join, leave, approve/reject, start, complete, cancel), session comments and visibility, discover, group-session generation entry points.

**Known messages to start from (not exhaustive — the audit finds the rest):** enumerate at pickup from `SessionServiceImpl` (about 29 throw sites); the comments 403 that `useSessionCommentsData` special-cases is the first priority, and note SESSION-44 (reject join/approval on a completed session) will add a new error.

**Deliverable — audit table (fill in at pickup):**

| Endpoint | Error / current message | Category | Code | Params | Client behavior (inline / page state / toast / generic) |
|---|---|---|---|---|---|
| `GET /api/sessions/{id}`, comments list/create/like, session like/unlike, join, leave, cancel, update, approve, reject | Session missing, or its group is no longer active | NOT_FOUND | `SESSION_NOT_FOUND` | none | Page state (`ResourceUnavailable`); keep the existing no-retry on 404 |
| `GET /api/sessions/{id}`, comments list/create/like | Session exists, caller may not see it | FORBIDDEN | `SESSION_FORBIDDEN` | none | Detail: forbidden page state. Comments: hide the section (the optional-section default, as today) |
| `GET /api/sessions/group/{id}`; `POST /{id}/join` (group session) | Caller not a group member (400 → 403) | FORBIDDEN | `SESSION_GROUP_MEMBER_REQUIRED` | none | List: page state. Join: toast |
| `POST /api/sessions` (group); `PUT`, `POST /{id}/cancel`, approve, reject (group session) | Not group owner/admin (400 → 403) | FORBIDDEN | `SESSION_GROUP_ADMIN_REQUIRED` | none | Toast (controls should already be hidden by role) |
| `PUT`, `POST /{id}/cancel`, approve, reject (standalone session) | Not the creator (400 → 403) | FORBIDDEN | `SESSION_CREATOR_REQUIRED` | none | Toast (controls should already be hidden) |
| `POST /{id}/join`, approve, reject | Session is cancelled (400 → 409) | CONFLICT | `SESSION_CANCELLED` | none | Toast, then refetch the session |
| `POST /{id}/cancel` | Already `COMPLETED`/`CANCELLED` (400 → 409) | CONFLICT | `SESSION_NOT_CANCELLABLE` | `{status}` | Toast, then refetch |
| `PUT /{id}` | `locationId`/`feeType` changed after `PREPARING` (400 → 409) | CONFLICT | `SESSION_NOT_PREPARING` | none | Inline banner on the edit form, then refetch |
| `DELETE /{id}/leave` | Caller not a participant (400 → 409) | CONFLICT | `SESSION_NOT_PARTICIPANT` | none | No toast: the UI is already in the wanted state, refetch the session |
| approve, reject | No pending request for the user (400 → 404) | NOT_FOUND | `SESSION_JOIN_REQUEST_NOT_FOUND` | none | Toast, then refetch the participants |
| `DELETE /{id}/leave` | Standalone creator leaving | VALIDATION | `SESSION_CREATOR_CANNOT_LEAVE` | none | Generic (the client hides leave for the creator) |
| `POST /api/sessions` | Standalone without `sportId` | VALIDATION | `SESSION_SPORT_REQUIRED` | none | Inline field error on the sport picker |
| `POST /api/sessions`, `PUT /{id}` | Location's sport differs from the session's | VALIDATION | `SESSION_LOCATION_SPORT_MISMATCH` | none | Inline field error on the location picker |
| `POST /api/sessions`, `PUT /{id}` | FIXED fee without an amount | VALIDATION | `SESSION_FEE_AMOUNT_REQUIRED` | none | Inline field error on the fee amount |
| attributes too large/invalid; invalid `viewerZoneId`; the 11 controller filter checks | Technical validation | VALIDATION | **none (by decision)** | n/a | Generic message; server `warn` log carries the detail |
| every authenticated endpoint above | **Deactivated caller** | n/a | none | n/a | Behaves exactly like an active user until the access token expires — no `isActive` check anywhere in session-impl (U12 known gap, out of scope; no new check added) |

**Account lifecycle:** the audit also records what a deactivated caller receives per endpoint (CLAUDE.md § Account lifecycle).
**Client-visible enum check (CLIENT-NOTIF-4):** new codes are client-visible; the client case is **CLIENT-ERR-7**, filed alongside this ticket.

**Out of scope:** Other modules (their own Phase B ticket); the client copy and page states (the paired CLIENT-ERR ticket, filed alongside this one); a backend message catalog; deactivated-user token gaps (U12).

**Tests:** Spock coverage asserting `errorCode`/`errorParams` beside each updated `message`; `server` ITs through the real pipeline for the module's authorization/not-found boundaries (status + `errorCode`), per the CLAUDE.md IT rule.

**On close:** update this ticket's row in the tracker table in `documentation/md/ERROR_HANDLING_DESIGN.md` (and the module's `BACKLOG_MVP.md`/`PROGRESS.md` as usual).

**Scope change (2026-10-06, user decision at pickup):** the technical/diagnostic validation errors get **no code**: session attributes too large / invalid, invalid `viewerZoneId`, and the 11 controller discover/upcoming/history filter validations. They keep their English 400 `message` (client shows the generic/category copy) and each throw site gets a `log.warn` with the offending value so they can be investigated from the server log later. No `SESSION_ATTRIBUTES_*`, `SESSION_VIEWER_ZONE_INVALID` or `SESSION_FILTER_INVALID` codes are defined.

**Scope change (2026-10-06, user decision at pickup):** status moves are **in scope**, as in A11/A18: permission failures 400 → 403, state conflicts 400 → 409, and a missing pending join request 400 → 404 (`SESSION_JOIN_REQUEST_NOT_FOUND`). Consumer census for these moves is done in Phase 2.

## Implementation summary (2026-10-06)

**Approved design (restated).** Convert every user-reachable throw site in `SessionServiceImpl` to a coded exception, moving statuses where they contradicted the availability-vs-visibility rule (permission failures 400 → 403, state conflicts 400 → 409, a missing pending join request 400 → 404); both session gates (`SessionGate`, `SessionDetailGate`) switch to the coded `ResourceGate.require` overload from A18 so their 404/403 carry `SESSION_NOT_FOUND`/`SESSION_FORBIDDEN`; `findSessionOrThrow` throws `ResourceNotFoundException.coded("SESSION_NOT_FOUND", ...)` with its old message. Technical validation (attributes size/serialization, `viewerZoneId`, the 11 controller query-param checks) stays un-coded and gains a `log.warn`. 14 codes registered in `ERROR_CODES.md` § session. No migrations, entities or DTO changes; no client code changes. Deactivated callers: recorded, no check added (U12).

**What was built.**
- `SessionServiceImpl`: ~20 throw sites converted (English messages unchanged); `SESSION_NOT_CANCELLABLE` carries `{status}`; `log.warn` before the three un-coded service throws.
- `SessionController`: `@Slf4j` and a private `invalidRequest(message)` helper that logs and builds the un-coded 400 for the 11 filter checks; `@ApiResponses` descriptions rewritten to the real 400/403/404/409 split.
- Docs: `ERROR_CODES.md` § session, the audit table above, `session-impl/CLAUDE.md` rule, the `ERROR_HANDLING_DESIGN.md` tracker, `PROGRESS.md`, and a carried-over MSW note in CLIENT-ERR-7.

**Key decisions.**
- One code per reason, not per call site: `SESSION_NOT_FOUND`/`SESSION_FORBIDDEN` serve both gates and every `findSessionOrThrow` path; `SESSION_GROUP_ADMIN_REQUIRED` covers create and modify; `SESSION_CANCELLED` covers join, approve and reject.
- `SESSION_CREATOR_CANNOT_LEAVE` stays 400 (a property of the caller's role in this session, like A11's `GROUP_OWNER_CANNOT_LEAVE`).
- Technical validation un-coded by user decision (see scope change above).
- A deleted group makes join/modify/cancel/approve answer a 403 group code rather than `SESSION_NOT_FOUND` (the membership check fails first, before any availability check). Accepted: not worth a new gate on every mutation path. (I first thought this was a missing availability check; the census showed it is masked, so no follow-up ticket was filed.)

**Deviations from the plan.** None in design.

**Consumer census (final).** Updated: `SessionServiceImplSpec` (gate mocks now match the 6-argument coded `require`; 18 assertions moved from `BadRequestException` to the new type + `errorCode`), `SessionAccessGateIntegrationTest` (2 group-list cases 400 → 403 + code). Compatible as-is: the other session/discover/listing ITs (they assert un-coded validation 400s), `SessionSystemCommentIntegrationTest` (post-module codes), `group-impl` (only calls `generateNextOccurrenceForGroup`), `notification-impl` (consumes events only), the client's `=== 403/404` checks. Deferred with a filed entry: MSW session handlers → CLIENT-ERR-7 (note added to that ticket).

**Tests.**
- Spock: `./gradlew :modules:session:session-impl:test` green (all 219 tests).
- New `server/src/test/java/com/sportconnect/integration/SessionErrorCodesIntegrationTest.java` (21 cases, real MockMvc + H2, no containers): 404 `SESSION_NOT_FOUND` (detail, deleted group, comments, join) and `SESSION_JOIN_REQUEST_NOT_FOUND`; 403 `SESSION_FORBIDDEN` (detail, comments), `SESSION_GROUP_MEMBER_REQUIRED` (list, join), `SESSION_GROUP_ADMIN_REQUIRED` (create, update), `SESSION_CREATOR_REQUIRED` (update, cancel); 409 `SESSION_CANCELLED` (join, approve), `SESSION_NOT_CANCELLABLE` (with `status`), `SESSION_NOT_PREPARING`, `SESSION_NOT_PARTICIPANT`; 400 `SESSION_CREATOR_CANNOT_LEAVE`, `SESSION_SPORT_REQUIRED`, and one assertion that a controller filter 400 stays un-coded.
- Updated `SessionAccessGateIntegrationTest` (13 tests, green).
- **`:server:test` full run (re-run 2026-10-06 with Docker up): 514 tests, 0 failures, 0 errors.** An earlier run without Docker had failed only on the 12 Testcontainers-based classes ("Could not find a valid Docker environment"); all of them, including `SessionPostAccessGateIntegrationTest`, `SessionSystemCommentIntegrationTest`, `SessionAttributesIntegrationTest` and `GroupErrorCodesIntegrationTest`, pass.
**Hand-off to CLIENT-ERR-7.** The final code list is `ERROR_CODES.md` § session; build the behavior table from the audit table above. Decide whether `useSessionComments`' hand-written 403/404 no-retry and `useSessionCommentsData`' `isForbidden` read are now redundant, and update the MSW session handlers (400 → 409 `SESSION_NOT_PARTICIPANT`, 400 → 404 `SESSION_JOIN_REQUEST_NOT_FOUND`, coded 404s).
