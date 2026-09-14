# SESSION-24 · Add `PREPARING` session status — optional location/fee at creation

**Status:** `DONE` (2026-09-14)
**Type:** New Feature (Architecture)
**Depends on:** none
**Filed:** 2026-09-14, while scoping SESSION-25 (session search/filter) — the status filter's
status list surfaced a new status that didn't exist yet. User asked for it to be filed and built
as its own ticket first, since SESSION-25 depends on it.

## Scope

`CreateSessionRequest.locationId` and `.feeType` are both `@NotNull` today (confirmed at scoping
time) — every session must have a location and a fee type set at creation. This ticket makes both
optional: a session created with either (or both) missing is persisted with `status = PREPARING`
instead of `SCHEDULED`. The creator completes the missing field(s) later via
`PUT /api/sessions/{sessionId}`; once both are present, `updateSession` transitions the session
`PREPARING` → `SCHEDULED`. A new scheduled job auto-cancels a `PREPARING` session once its
`scheduledStart` passes without ever being completed, mirroring `SessionGenerationJob`'s existing
`startOngoingSessions`/`closePastSessions` 15-minute cadence.

**Who:** Normal User (any session creator, standalone or group-linked).

**Entry point:** `POST /api/sessions` (create) and `PUT /api/sessions/{sessionId}` (update) — both
existing endpoints, no new endpoint — plus a new `@Scheduled` job method alongside
`SessionGenerationJob`.

**Behavior:**
- `PREPARING` is fully joinable — no change to `joinSession`'s rejection logic (still only rejects
  `CANCELLED`). A `PREPARING` session behaves exactly like `SCHEDULED` for join/leave/comment/like —
  user's explicit call: "fully joinable like SCHEDULED," purely a lifecycle state, not a new
  visibility or access rule.
- `createSession`: drop `@NotNull` on `CreateSessionRequest.locationId`/`.feeType`. Missing either
  → `Session.status = PREPARING`. `Session.locationId` (DB `nullable=false` today) needs a
  migration to `nullable=true`. Business rule 2 (`Location.sportId` must match the session's
  `sportId`) only runs when `locationId` is present. `Session.feeType` currently defaults to
  `FeeType.FREE` via `@Builder.Default` — this ticket needs that default suppressed specifically
  for the "field omitted from the request" case, so a session genuinely missing `feeType` lands
  in `PREPARING` rather than silently defaulting to FREE and skipping straight to `SCHEDULED`.
  Resolve the exact mechanism at pickup (e.g. don't apply the builder default when the request
  field itself was null, rather than relying on the entity default).
- `updateSession`: after applying a partial update, if the session is currently `PREPARING` and
  the resolved `locationId` and `feeType` are now both non-null, flip `status` to `SCHEDULED`.
- **New restriction:** `updateSession` rejects (400 `BadRequestException`) any request that
  includes a non-null `locationId` or `feeType` while `session.status != PREPARING`. Once a
  session is genuinely `SCHEDULED` (or beyond), its location and fee become immutable via this
  endpoint — only the `PREPARING`-completion path may set them. Every other field
  (title/description/scheduledStart/capacity/autoApprove/initialSlot/attributes) is unaffected —
  still updatable regardless of status, unchanged from today.
- New job method (e.g. `cancelUnpreparedSessions`), `@Scheduled(cron = "0 */15 * * * *")` next to
  `startOngoingSessions`/`closePastSessions`: any `PREPARING` session with `scheduledStart <=
  now()` → `status = CANCELLED`, `cancelReason` = a fixed system message (e.g. "Auto-cancelled —
  session setup was not completed before the scheduled start time"), `cancelledBy = null`,
  `cancelledAt = now()`. No real actor — same pattern as SESSION-18's `startOngoingSessions`.
- **New notification: `session.details.updated`** (named to fit the existing `<domain>.<entity>
  .<action>` routing-key convention — `notification-impl`'s queue binding is a strict
  `session.*.*` topic pattern, so a 2-segment key like `session.updated` would silently never
  match it and the event would vanish; caught during Phase 4 before wiring the consumer).
  `updateSession` writes a new outbox event
  (`SessionUpdatedEvent { sessionId, actorId }`, same minimal shape as `SessionParticipantLeftEvent`)
  after a successful update, fanned out to the session's currently-`JOINED` participants (reusing
  `SessionEventsConsumer`'s existing `PARTICIPANT_JOINED_RECIPIENT_STATUSES`/`ACTIVE_SESSION_STATUSES`
  gate — the actor is automatically excluded from their own fan-out, same as every other session
  event). Deliberately field-agnostic — fires on any successful `updateSession` call, regardless of
  which field(s) changed; the client renders a generic "{actor name} updated the session {title}"
  text (**CLIENT-SESSION-21** adds the `NotificationType` union member + `getNotificationText`
  case — this is the client's compile-time-guarded exhaustiveness check, CLIENT-NOTIF-4's pattern).
  In practice today this only ever fires from the `PREPARING`→`SCHEDULED` completion update, since
  no client UI calls `updateSession` for any other reason yet (CLIENT-SESSION-21's own finding) —
  but the trigger itself is general, not `PREPARING`-specific, so it also covers any future update
  path.

**Out of scope:**
- Client UI (the missing-field warning, and the completion flow) — companion ticket
  **CLIENT-SESSION-21**.
- Whether the auto-cancellation should notify the creator/participants — logged as **NOTIF-7** in
  `documentation/md/NOTIFICATION_USE_CASES.md`, not resolved here.
- `GROUP_RECURRING` auto-generated occurrences (`SessionGenerationService.generateUpcomingSessions`)
  always copy `locationId`/`feeType` from the group's recurrence config, which already requires
  both — `PREPARING` is not expected to occur on that path, no change needed there.
- Search/filter query params on `/discover`, including a status filter that surfaces `PREPARING` —
  **SESSION-25**.

**Edge cases:**
- Updating only `locationId` (leaving `feeType` still missing, or vice versa) while `PREPARING` —
  session stays `PREPARING`; only flips once **both** are present.
- Attempting to set `locationId`/`feeType` (even to their current unchanged value) while the
  session is `SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED` — rejected, regardless of whether it
  would actually change anything; simplicity over a same-value special case.
- Clearing a previously-set field back to null via update — not supported today
  (`UpdateSessionRequest`'s partial-update semantics treat a null field as "don't touch," not
  "clear"); no change needed, out of scope.
- `cancelSession` on a `PREPARING` session — already allowed today (`cancelSession` only rejects
  `COMPLETED`/`CANCELLED`), no change needed.
- Deactivated caller (`isActive = false`): no new authenticated endpoint is added — existing
  endpoints under the same known JWT-window gap tracked by `modules/user/user-impl`'s **U12**;
  this ticket doesn't compound that gap.

**Tests:** Spock coverage for: create with `locationId` missing → `PREPARING`; create with
`feeType` missing → `PREPARING`; create with both missing → `PREPARING`; create with both present
→ `SCHEDULED` (unchanged); update completing the last missing field → `PREPARING` flips to
`SCHEDULED`; update completing only one of two missing fields → stays `PREPARING`; update
attempting to change `locationId`/`feeType` on a `SCHEDULED` session → 400; the new job cancelling
a `PREPARING` session past its `scheduledStart`, and leaving an untouched one (start time not yet
reached) alone; `joinSession` succeeding on a `PREPARING` session.

## What was built

Built exactly as scoped above, plus a few things found at implementation time:

- **Migration** — `V065__allow_optional_location_and_fee_on_sessions.sql`: drops `NOT NULL` on
  both `sessions.location_id` **and** `sessions.fee_type` (the original scope text above only
  named `location_id` — `fee_type` is `nullable=false` too, found while implementing).
- **`session-api`** — `SessionStatus` gains `PREPARING` (+ full lifecycle Javadoc); `CreateSessionRequest
  .locationId`/`.feeType` lose `@NotNull`; new `SessionUpdatedEvent { sessionId, actorId }`.
- **`session-impl`** — `Session.locationId`/`.feeType` drop `nullable=false`. `createSession`
  guards the location/sport-match lookup on `locationId != null` and computes `initialStatus`
  (`SCHEDULED` only when both fields present, else `PREPARING`) — turned out `resolveFeeAmountVnd`
  and the builder's `.feeType(request.getFeeType())` call were already null-safe, no extra
  suppression needed for the `@Builder.Default` FREE fallback (it only applies when the builder
  method is never called at all, and every call site here calls it unconditionally). `updateSession`
  gains the `PREPARING`-only gate on `locationId`/`feeType`, the `PREPARING`→`SCHEDULED` flip, and
  the `session.details.updated` outbox write. `SessionGenerationService.cancelUnpreparedSessions`
  + `SessionGenerationJob`'s new 15-min `@Scheduled` method, modeled on `closePastSessions`.
  `SessionServiceImpl.mapToResponses`'s `locationIds` batch-collection stream now filters
  `Objects::nonNull` (matching the existing `userIds` precedent two lines above) — a `PREPARING`
  session's null `locationId` would otherwise ride into the cross-domain
  `locationService.getLocationsByIds` batch call unfiltered.
- **`notification-impl`** — `ACTIVE_SESSION_STATUSES` gains `PREPARING`; new `session.details.updated`
  consumer case. **Routing-key naming caught before wiring**: the originally-planned
  `session.updated` is 2 segments, but `SessionEventsRabbitConfig`'s queue binds a strict
  `session.*.*` (3-segment) topic pattern — that key would have silently never matched and the
  event would have vanished with no error. Renamed to `session.details.updated`.
- **Docs** — `session-api`'s `SessionService` Javadoc (`createSession`/`updateSession`) and
  `modules/session/session-impl/CLAUDE.md` (fixed stale rule 2, added rule 10 for the full
  `PREPARING` lifecycle, added rule 11 — a standing convention: every future `Session` field change
  must check whether SESSION-25's discover filter needs a corresponding update, added per user
  request during this ticket's pickup).
- **Not built here**: client UI (**CLIENT-SESSION-21**), attribute filtering, `/discover` search/
  filter (**SESSION-25**) — all as scoped.

## Verification

- `:modules:session:session-impl:test` — 148 tests, all green (includes 2 pre-existing tests
  rewritten because this ticket's own confirmed design — locationId/feeType immutable outside
  `PREPARING` — broke their premise: `updateSession clears a stale feeAmountVnd when switching
  away from FIXED` and the FIXED-validation test both previously exercised a `feeType` change on a
  `SCHEDULED` session; moved onto a `PREPARING` fixture, with a new test added asserting the
  rejection on `SCHEDULED`).
- `:modules:notification:notification-impl:test` — all green (3 pre-existing tests updated for
  the widened `ACTIVE_SESSION_STATUSES`; 1 new test for the `session.details.updated` case).
- Migration verified against the real dev Postgres (`sportconnect_dev`, `docker compose -f
  infra/docker-compose.dev.yml`): started `:server:bootRun`, confirmed the Liquibase changeset ran
  successfully in the boot log, then `\d sessions` confirmed both `location_id` and `fee_type` are
  now nullable. Server stopped afterward.
- **`:server:test` not run to completion** — abandoned after ~55 minutes with zero output,
  consistent with a documented precedent (`documentation/sessions/103_log.md`: a prior full
  `:server:test` run on this same Windows/Testcontainers box was abandoned after >40 min in favor
  of module-level tests). This ticket adds no new authorization/visibility boundary (CLAUDE.md's
  IT-test rule), so no new `*IntegrationTest` was written either. `server-ci` (GitHub Actions,
  `ubuntu-latest`, real Docker) will run the full `./gradlew build` — including `:server:test` —
  once this branch is pushed and a PR is opened; that run is the authoritative IT verification for
  this change.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
