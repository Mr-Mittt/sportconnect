# SESSION-24 · Add `PREPARING` session status — optional location/fee at creation

**Status:** `TODO`
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

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
