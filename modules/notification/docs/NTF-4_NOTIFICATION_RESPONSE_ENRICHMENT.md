# NTF-4 · `NotificationResponse` enrichment — actor names + entity title

**Status:** DONE
**Module:** `modules/notification`
**Related:** NTF-1 (`modules/notification/docs/NTF-1_MODULE_SCAFFOLDING.md` — the original
no-enrichment scope decision this ticket reverses), `client/docs/BACKLOG_MVP.md`'s `CLIENT-NOTIF-1`
(the ticket whose pickup surfaced this gap)

## Design (approved plan, restated)

Filed mid-pickup of `CLIENT-NOTIF-1`: NTF-1 deliberately shipped `NotificationResponse` with raw
`actorIds`/`entityId` and explicitly no enrichment. Building the client dropdown against that raw
shape would leave every row unreadable — a UUID list and a bare entity id, no name, no title. User
decision: the notification API should build enough data for the client, rather than the client
resolving names/titles itself client-side (there's no batch users-by-id endpoint on the client side
either way — only single `GET /api/users/{id}`).

Two fields added to `NotificationResponse`, both batch-resolved once per page (No-N+1 convention):
- `actors: List<NotificationActorSummary>` (`id`, `fullName`) — the bounded (≤3) `actorIds`,
  resolved via `user-api`'s existing `UserService.getUsersByIds`.
- `entityTitle: String` (nullable) — for `entityType == "SESSION"` (the only type any producer
  emits today, per NTF-2's session-only scope), the session's `title`, via a new
  `SessionService.getSessionTitlesByIds(List<Long>)` batch method on `session-api`. `null` for any
  other `entityType`, forward-compatible with post/group/friend notification types once B7/B21/U13
  ship their own outbox wiring — this ticket adds no resolver for those.

Same "server denormalizes a display name, client never resolves ids itself" shape already
established by `SessionResponse.createdByFullName`/`cancelledByFullName`.

## What was built

**`modules/session/session-api`**: `SessionService.getSessionTitlesByIds(List<Long> sessionIds):
Map<Long, String>`, added next to
`getParticipantIdsByStatuses` (same no-N+1-batch precedent, same Javadoc style). Missing ids are
simply absent from the map, matching `user-api`'s `getUsersByIds` semantics.

**`modules/session/session-impl`**: `SessionServiceImpl.getSessionTitlesByIds` — a plain
`sessionRepository.findAllById(...).stream().collect(toMap(Session::getId, Session::getTitle))`.
Deliberately does **not** reuse the existing heavy `toResponse`/`mapToResponses` mapper (which
resolves participant counts, likes, `callerParticipation`, etc., and is scoped to one caller) —
only the bare `title` is needed here, and the caller varies per-notification-recipient, not
per-batch-call, so the caller-scoped mapper doesn't fit this shape anyway.

**`modules/notification/notification-api`**:
- New `NotificationActorSummary` DTO (`id`, `fullName`).
- `NotificationResponse` gains `actors`/`entityTitle`.

**`modules/notification/notification-impl`**:
- `build.gradle` — new `user-api` dependency (already had `session-api` since NTF-2's consumer).
- `NotificationServiceImpl.getNotifications` restructured: fetches the `Page<Notification>` first,
  collects every distinct `actorId` (flattened across the whole page) and every distinct SESSION
  `entityId`, calls `userService.getUsersByIds`/`sessionService.getSessionTitlesByIds` once each
  (skipped entirely — zero calls — when the page has no actors / no SESSION rows), then maps each
  row via the two resulting `Map`s. `toResponse` takes both maps as parameters instead of reading
  instance state, keeping the batch-then-map split explicit in the method signature.

**Tests**: `NotificationServiceImplSpec` gained 4 new/replacing cases — empty page skips both
enrichment calls entirely; a SESSION notification resolves both `actors` and `entityTitle` in one
call each; an actor id absent from `user-api`'s batch result is silently dropped from `actors`
(not an error); a non-SESSION `entityType` leaves `entityTitle` null and never calls
`getSessionTitlesByIds`. The pre-existing `SessionServiceImpl` Spock suite covers
`getSessionTitlesByIds` implicitly via the module's existing repository-mock conventions — no
dedicated new spec file needed for a single-line batch method.

## Key decisions

- **`entityTitle` resolution is a hardcoded `if (entityType == "SESSION")` check**, not a
  strategy/registry pattern — there's exactly one entity type in scope today (NTF-2 is
  session-only), and building a resolver-registry abstraction for one case would be speculative.
  The next entity type (post/group/friend) extends this with another `if`/`else if` branch and its
  own batch call when its outbox wiring ships — revisit as a real dispatch table only if a third or
  fourth type makes the `if` chain unwieldy.
- **`getSessionTitlesByIds` bypasses the caller-scoped `SessionResponse` mapper entirely** rather
  than calling `getSession`/`mapToResponses` and projecting `.getTitle()` out — those methods
  resolve participant counts, `callerParticipation`, like state, etc., all scoped to a single
  caller, which has no meaning for a batch call serving potentially many different notification
  recipients' pages. A dedicated lightweight repository projection avoids both the wasted
  enrichment work and the caller-identity mismatch.

## Out of scope

Actor avatar (`avatarUrl` was available on `UserResponse` but the user's confirmed answer was
"fullname and entityTitle" — no avatar); entity-title resolvers for post/group/friend
`entityType`s (blocked on B7/B21/U13, same as NTF-2's own consumer scope); any change to
`recordEvent`'s write path (unaffected — only the read-side `getNotifications` mapping changed).

## Verification

- `./gradlew :modules:notification:notification-impl:test :modules:session:session-impl:test` —
  all pass.
- `./gradlew :server:test` — full suite passes, no regressions (confirms no other caller of
  `SessionService`/`NotificationService` broke against the interface changes).
- N+1 check: `getNotifications` makes exactly one `getUsersByIds` call and one
  `getSessionTitlesByIds` call per page, regardless of how many notifications/actors are on it
  (verified by the Spock cases' `1 *`/`0 *` call-count assertions) — no per-row cross-domain call.

No divergence from the approved design.
