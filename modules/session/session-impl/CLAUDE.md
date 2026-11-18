# CLAUDE.md — session-impl

Scheduled sports activities — group-linked (created by any group member, managed by its creator and the group's owner/admins, SESSION-GROUP-1) or standalone (open to any user).
Always references a `Location` (`modules/location`) by id; never carries its own raw location
fields. See `modules/location/location-impl/CLAUDE.md` for that side of the boundary.

## Dependencies

| From | Why |
|---|---|
| `modules/session/session-api` | SessionService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| `modules/social/group-api` | Permission checks (`canManageMembers`/`isGroupMember`), `getGroup` for private-group visibility |
| `modules/social/post-api` | Originally needed only because `group-api`'s `GroupResponse` references `PostResponse` (pinned posts). SESSION-10 gave it a second, real reason: `createSession` calls `PostService.createSessionPost` inline to create each session's companion `SESSION_POST`, and the comment-proxy methods (`createSessionComment` etc.) call `CommentService`'s bypass methods. Plain `@RequiredArgsConstructor` — no `@Lazy` needed, since `post-impl` has no dependency back on this module (unlike `group-impl`'s `postService` field, which mirrors a real bidirectional dependency with `post-impl`) |
| `modules/user/user-api` | Batch `UserService.getUserSummariesByIds` (U18) — creator/participant name+avatar enrichment. SESSION-66 adds `UserFriendService.getAcceptedFriendIds` (the share's friend check, one query) and `UserService.getActiveUserIds` (which of a list of ids are active accounts, one ids-only query; the batch lookups `getUsersByIds`/`getUserSummariesByIds` do not filter deactivated accounts) |
| `modules/sport/sport-api` | Batch `SportService.getSportsByIds` — `sportName` enrichment |
| `modules/location/location-api` | Batch `LocationService.getLocationsByIds`/single `getLocation` — location enrichment + sport-match validation |

## Key Classes

| Class | Purpose |
|---|---|
| `Session` | `groupId` nullable (null = standalone), `postId` (NOT NULL, unique, no DB FK — SESSION-10, id of the companion `SESSION_POST` in `post-impl`, created synchronously by `createSession`), `sessionType` discriminator, `locationId` (NOT NULL, references `locations`), `locationNote` (nullable free text, e.g. "Court 3" — scoped to this session, never written back to the shared `Location`), `status` (`SCHEDULED`/`ONGOING`/`COMPLETED`/`CANCELLED`), `cancelReason`/`cancelledBy`/`cancelledAt` (set only by `cancelSession`) |
| `SessionParticipant` | Join/leave; row kept (status flipped) on leave, not deleted |
| `SessionServiceImpl` | All business rules below; batch-resolves creator/sport/location/participant-count/cancelledBy in `mapToResponses` — never per-row |
| `SessionGenerationService` | Internal only (not on `session-api`) — drives `SCHEDULED`→`ONGOING`→`COMPLETED` automatically (SESSION-GROUP-5: it no longer generates sessions; `closePastSessions` only reports the regular sessions it completed). See SESSION-2 in `docs/BACKLOG_MVP.md`. SESSION-18: `startOngoingSessions` also writes one `session.status.started` outbox row per session it starts, via `SessionOutboxWriter` — the first outbox event with no real actor (a scheduled job, not a user, made the transition), so its payload DTO carries no `actorId`. |
| `SessionGenerationJob` | `@Scheduled`: every-15-min `startOngoingSessions`, `closePastSessions` and `cancelUnpreparedSessions` (SESSION-GROUP-5: no job generates sessions) |
| Regular-session generation (SESSION-GROUP-5) | `GroupSessionGenerationPlanner` (what to queue), `GroupSessionGenerationRunner` (drains the queue), `GroupSessionOccurrenceGenerator` (one slot per `REQUIRES_NEW` transaction, and the failure bookkeeping), `GroupSessionOccurrences` (pure date maths), `GroupSessionGenerationListener` (startup + after-commit events), `GroupSessionGenerationEvents`, `GroupSessionRecipients` (who to notify). See rule 17 |
| System comments (SESSION-21) | No new class — `SessionServiceImpl`'s private `writeSystemComment`/`resolveParticipantName` and one batched call in `SessionGenerationService.startOngoingSessions`, both delegating to `post-api`'s `CommentService.createSystemSessionComment(s)`. See business rule 9 |
| `SessionOutboxWriter` | SESSION-18 — shared `session_outbox_events` row builder/writer, extracted from `SessionServiceImpl`'s own private methods (SESSION-15) once `SessionGenerationService` became a second writer. Both services inject it. |
| `SessionGate` (`access/`) | `ResourceGate<Session>` (SESSION-10) — the sole gate on a session's comment thread *and* its own like; `post-impl` never checks (its own `PostGate` makes `SESSION_POST` unconditionally unavailable). Same shape as `post-impl`'s `PostGate`, no shared logic |

## Endpoints

```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{sessionId}               ROLE_USER (SESSION-9: caller id now threaded through for callerParticipation)
GET    /api/sessions/group/{groupId}          paginated, member-only (403 `SESSION_GROUP_MEMBER_REQUIRED`, one answer for a non-member and a missing group); SESSION-GROUP-2: optional `bucket` = `ONGOING` | `SCHEDULED` (only SCHEDULED) | `PREPARING` (its own bucket) | `HISTORY` (COMPLETED + CANCELLED, newest start first), fixed order (soonest start first), the caller's own sort ignored, a bad value is an un-coded 400; no bucket = every status as before
GET    /api/sessions/upcoming                 paginated (SESSION-27) — JOINED/INVITED, status PREPARING/SCHEDULED/ONGOING, standalone or group-linked; optional date + optional sportId (SESSION-43, absent = all sports, plain equality — no active-sport-profile gate); scheduledStart ASC + PREPARING->SCHEDULED->ONGOING tiebreak, caller's own Pageable sort ignored
GET    /api/sessions/history                  paginated (SESSION-27) — required sportId (SESSION-43, plain equality) + exactly one of date (JOINED-only, CANCELLED/COMPLETED, scheduledStart DESC) or dateCount (distinct history dates + counts, before cursor)
GET    /api/sessions/discover                 paginated (SESSION-25) — standalone, PREPARING/SCHEDULED/ONGOING (default all three) sessions gated to the caller's active sport profiles, excluding sessions they created or joined; optional title/locationId/minOpenSlots/feeType/maxFeeAmountVnd/date/startTimeFilter+startTime/status filters, all AND-combined; scheduledStart >= now() default lower bound unless date/startTimeFilter narrows it; scheduledStart ASC + open-slots ASC + createdAt ASC sort, caller's own Pageable sort ignored
PUT    /api/sessions/{sessionId}               creator (standalone) or owner/admin (group); SESSION-46: only while PREPARING (409 SESSION_NOT_PREPARING otherwise), every field but sport and group
POST   /api/sessions/{sessionId}/schedule      SESSION-46 — PREPARING -> SCHEDULED, same gating; 400 SESSION_NOT_READY unless location, fee and duration are set
POST   /api/sessions/{sessionId}/cancel        same gating; soft — sets status=CANCELLED, never deletes; rejected if already COMPLETED/CANCELLED
POST   /api/sessions/{sessionId}/join          rejected if the session is CANCELLED; SESSION-69: on a private standalone session only someone holding a JOINED/REQUESTED/INVITED row may (403 `SESSION_FORBIDDEN`, checked before the cancelled rule)
DELETE /api/sessions/{sessionId}/leave         JOINED->LEFT, or INVITED->LEFT ("decline")/REQUESTED->LEFT ("cancel my request") — SESSION-9
POST   /api/sessions/{sessionId}/shares        SESSION-66 (corrected by CLIENT-SESSION-49, SESSION-69) — any user shares a public standalone session, in any status and whatever their participation, with up to 50 friends: `{ userIds }` -> `{ sent, skipped }`; no participant row (see rule 13); a private one is refused (403 `SESSION_SHARE_NOT_ALLOWED`); SESSION-GROUP-3: a group session is shared by its members (a non-member 403 `SESSION_GROUP_MEMBER_REQUIRED`) with up to 50 other members of the group instead of friends
GET    /api/sessions/{sessionId}/participants  paginated, JOINED-only; SESSION-69: behind `SessionDetailGate` (404, then 403 `SESSION_FORBIDDEN`), so a private or group session's players are not readable by someone who may not open it
GET    /api/sessions/{sessionId}/comments                      participant or group-member (SESSION-10) — see SessionGate
GET    /api/sessions/{sessionId}/thread-people?q=&size=        same gating (SESSION-GL-64) — who can see the thread, for the @ tag picker: JOINED/REQUESTED/INVITED participants first, then a group session's other members; first/last-name search, word-start, accent-insensitive (the app's one rule, see user-impl); `size` default 5, cut to 20; { userId, fullName, avatarUrl } only
POST   /api/sessions/{sessionId}/comments                      same gating
POST   /api/sessions/{sessionId}/comments/{commentId}/like      same gating
DELETE /api/sessions/{sessionId}/comments/{commentId}/like      same gating
POST   /api/sessions/{sessionId}/like                           same gating — likes the SESSION_POST anchor itself
DELETE /api/sessions/{sessionId}/like                           same gating
GET    /api/sessions/group/{groupId}/settings               SESSION-GROUP-4 — `{ enabled, mode }` (off and WEEKLY when never saved); any member of the group; 404 `GROUP_NOT_FOUND` (missing or inactive group) before 403
PUT    /api/sessions/group/{groupId}/settings               owner/admin; partial `{ enabled?, mode?, cancelScheduled? }` (SESSION-GROUP-6: with `cancelScheduled`, turning OFF or switching the mode also cancels the group's scheduled regular sessions; `cancelledSessions` in the answer); a real change writes a group post, a no-op writes nothing; switching the mode changes no recurrence row
GET    /api/sessions/group/{groupId}/recurrences            any member; every configuration of both modes, ordered mode, day, start time; `draft`, `missing`, `audienceUserIds` per item
POST   /api/sessions/group/{groupId}/recurrences            owner/admin; takes the group's current mode; `dayKey` + `startTime` required, a missing location/duration/fixed-fee amount saves a draft; 5 per group, mode and day (409)
PUT    /api/sessions/group/{groupId}/recurrences/{id}       owner/admin; full replace, the mode never changes
DELETE /api/sessions/group/{groupId}/recurrences/{id}[?cancelScheduled=true]   owner/admin; hard delete; SESSION-GROUP-6: with `cancelScheduled` the scheduled sessions it generated are cancelled first (otherwise left there); the answer's `count` = how many were cancelled
GET    /api/sessions/group/{groupId}/regular-sessions/count?scope=ALL|RECURRENCE&recurrenceId=   SESSION-GROUP-6 — owner/admin; `{ count }` of SCHEDULED/PREPARING regular sessions of the group (ALL) or of one configuration (RECURRENCE); ONGOING never counted
```

**Auth-extraction convention:** every endpoint in this controller uses `@PreAuthorize
("hasRole('USER')")` + `Authentication authentication` + `SecurityUtils.extractUserId(authentication)`
— uniform across the whole file, unlike `PostController`'s mixed convention (A1: `@AuthenticationPrincipal`
for "MY OWN"/mutation endpoints, `Authentication`+`SecurityUtils` for "viewing a resource by id"
ones). `@PreAuthorize` and the extraction mechanism are orthogonal — the former is an AOP gate
evaluated *before* the method runs (throws 403 if the caller lacks `ROLE_USER`), the latter is just
how the method reads the already-authenticated principal — so combining
`@PreAuthorize("hasRole('USER')")` with `Authentication`/`SecurityUtils.extractUserId()` instead of
`@AuthenticationPrincipal` is a deliberate, valid choice here for one canonical extraction path
across the file, not a workaround. `@PreAuthorize("hasRole('USER')")` is currently redundant with
`SecurityConfig`'s global `.anyRequest().authenticated()` (every authenticated user gets `ROLE_USER`
today, no separate ADMIN/VENDOR role wired into JWTs yet) but kept everywhere as an explicit,
self-documenting gate per the existing `PostController` precedent.

Deleting a session comment has no proxy endpoint here — `DELETE /api/posts/comments/{commentId}`
(post-impl) already works unchanged, since `deleteComment` was never gated by `PostGate` (it's
ownership-only), so there's nothing this module needs to wrap.

## Run Tests

```bash
./gradlew :modules:session:session-impl:test
```

## Key Business Rules (enforced in `SessionServiceImpl`)

1. `groupId` present → `sportId` is the group's (the request's is ignored when the group has one), `sessionType` =
   `GROUP_RECURRING`, requires `groupService.isGroupMember` (**SESSION-GROUP-1**: any member, no longer owner/admin only; see rule 15). `groupId` null → `sportId`
   required in the request, `sessionType` = `STANDALONE`, open to any `ROLE_USER`.
2. `locationId` is optional at creation (SESSION-24) — when supplied, its `Location.sportId` must
   equal the session's resolved `sportId` (a mismatch is a `BadRequestException`, not silently
   allowed); when omitted (along with `feeType`, also now optional), the session starts
   `PREPARING` instead of `SCHEDULED`. See rule 10 below and `SessionStatus`'s own Javadoc for the
   full `PREPARING` lifecycle.
3. `joinSession` rejects a `CANCELLED` session outright, then (for `GROUP_RECURRING` only)
   requires `groupService.isGroupMember`; `STANDALONE` is otherwise open. It upserts — an
   existing `LEFT` row flips back to `JOINED` rather than inserting a duplicate (the unique
   constraint on `(session_id, user_id)` is the backstop).
4. `cancelSession` rejects `status IN (COMPLETED, CANCELLED)` — a soft action, the row is kept
   with `status=CANCELLED` plus `cancelReason`/`cancelledBy`/`cancelledAt`; there is no hard
   delete anywhere in this service.
5. `getGroupSessions` calls `groupService.getGroup(groupId, currentUserId)` first — this reuses
   the *existing* private-group membership gate rather than reimplementing it.
6. **SESSION-10:** `createSession` calls `postService.createSessionPost(userId, "Session: " + title)`
   inline, before persisting the `Session`, in the same `@Transactional` method — a post-creation
   failure rolls back the whole session creation. The returned id becomes `Session.postId`.
   Comments are `post-impl`'s real `Comment` entity, reused via `CommentService`'s bypass methods
   (`createSessionComment` etc., which skip `post-impl`'s own `PostGate`) — but the client only
   ever calls **this module's** `GET/POST /api/sessions/{sessionId}/comments` endpoints, never
   `post-impl`'s directly (those 404 unconditionally for a `SESSION_POST`, for every caller).
   `SessionServiceImpl`'s comment-proxy methods gate via `SessionGate.require(session, callerId,
   ...)` (participant status, widened to group membership for a group-linked session) before
   delegating — this module is the **only** place that check happens. The same shape extends to
   `likeSession`/`unlikeSession` (liking the `SESSION_POST` anchor itself, delegating to `PostService
   .likeSessionPost`/`unlikeSessionPost`) — both share the private `requireSessionAccess` helper
   with the comment-proxy methods. See `modules/session/docs/MVP/SESSION-10_SESSION_POST_COMMENTS.md`.
7. **SESSION-9:** every `SessionResponse`-returning method resolves `callerParticipation` — the
   caller's own `SessionParticipant` row for that session (null if none), batch-resolved in
   `mapToResponses` via `findBySessionIdInAndUserId`. Drives the client's action button
   (Join/Accept/Decline/Cancel/Leave) on both the session card and `SessionDetailModal`. `null`
   userFullName/userAvatarUrl inside it are intentional — it's always the caller's own identity,
   which the client already has. `leaveSession` doubles as decline/cancel for this reason — see
   its Javadoc.
8. **SESSION-14:** `leaveSession` rejects a **standalone** session's own creator
   (`BadRequestException`) — they're auto-`JOINED` at creation (`createSession`'s seed-participant
   block) but have no way out via this endpoint; `cancelSession` is the only way to relinquish a
   standalone session they created. Not enforced for a group-linked session's creator: since SESSION-GROUP-1 they are `JOINED` at creation too,
   like a standalone creator, but they can still leave like any member (their lever there is cancelling, or the
   group role).

9. **SESSION-21:** every path that produces a genuine **`JOINED`** transition (`joinSession`'s
   auto-approve/INVITED branch, `approveParticipant`), a genuine **`JOINED`→`LEFT`** one
   (`leaveSession`), or a **`SCHEDULED`→`ONGOING`** one (`SessionGenerationService
   .startOngoingSessions`) must also write a system comment into the session's thread, via
   `CommentService.createSystemSessionComment`/`createSystemSessionComments`. Flagged here the same
   way `group-impl/CLAUDE.md`'s rule 7 flags B9's welcome post, so a future new join/leave
   mechanism doesn't silently skip it. Three things are load-bearing: the entry is authored by
   `session.getCreatedBy()` (never the participant it's about — a system comment has no real
   author, and `comments.user_id` is NOT NULL); it must **not** emit `session.comment.created`
   (each of the three moments already notifies via its own event, so a comment notification would
   double-ping); and it fires only on a *genuine* transition, matching the outbox events'
   existing guards exactly (SESSION-16's already-`JOINED` early return, SESSION-19's
   `JOINED`-only leave). Batch call sites use `createSystemSessionComments` — one query and one
   `saveAll` for the whole batch, never a call per session.

10. **SESSION-24 / SESSION-46 — `PREPARING` is a real draft.** A session starts `PREPARING`
    unless `locationId`, `feeType` (and the amount, for `FIXED`) **and** a duration
    (`scheduledEndAt`) are all present; the private `missingForScheduling` helper is the one rule
    for both the create-time status and `scheduleSession`, so the two cannot drift. While
    `PREPARING`, `updateSession` may change every field except sport and group (title, description,
    location, note, start, duration, capacity, fee, fee note, auto approve, initial slot, per-gender
    slots, game mood, attributes). **In any other status the whole call is a 409
    `SESSION_NOT_PREPARING`**, checked before any field is applied. There is no automatic flip to
    `SCHEDULED`: the only way out is `POST /{id}/schedule` (`scheduleSession`: 409 unless
    `PREPARING`, 400 `SESSION_NOT_READY` with `errorParams.missing`). A start-only edit keeps the
    duration (the end moves by the same amount; a sent `durationMinutes` wins; no end stays no end).
    A `PREPARING` session is fully joinable, identical to `SCHEDULED` elsewhere (join/leave/comment/
    like, and `SessionEventsConsumer.ACTIVE_SESSION_STATUSES` in `notification-impl`). If
    `scheduledStart` passes while still `PREPARING`, `SessionGenerationJob.cancelUnpreparedSessions`
    auto-cancels it (no real actor, `cancelledBy` stays null). Every successful `updateSession`
    fans out a `session.details.updated` notification to the currently-`JOINED` participants;
    scheduling does not notify yet (NOTIF-10). **SESSION-67:** the same call also writes one `SESSION_*_CHANGED` system comment per field whose stored value changed (see the gotcha at the end of this file).
    **New fields (SESSION-46):** `maleSlots`/`femaleSlots` (nullable, `>= 0`, informational like
    `capacity`, never enforced on join; `male + female <= capacity - initialSlot`, 400
    `SESSION_GENDER_SLOTS_EXCEED_OPEN`, checked on the resulting values; update: `0` clears, null
    leaves), `gameMood` (1-10, required on create, `NOT NULL DEFAULT 5`; generated recurring
    sessions get 5), `feeNote` (<= 300 chars, trimmed, blank stored as null, kept when the fee type
    changes; update: empty string clears). A blank `title` is stored as null and the companion post
    text falls back to `"New session"`.
11. **Session filtering — check on every `Session` field change.** Whenever a field is added to
    `Session` (schema, entity, or `Create`/`UpdateSessionRequest`), check whether
    `GET /api/sessions/discover`'s search/filter query params (SESSION-25, and its follow-ups)
    need a corresponding filter — a new session attribute a caller would plausibly want to narrow
    Discover results by shouldn't require rediscovering this gap from scratch each time a field is
    added. Not every field needs one (e.g. `postId`, audit columns) — the test is "would a caller
    browsing Discover plausibly want to filter/search by this?", not "does every column need one."
    SESSION-24's own `PREPARING` status is the concrete example that prompted this rule: adding a
    field can also mean an existing filter (here, `/discover`'s status inclusion) needs revisiting,
    not just that a new filter param is needed.
12. **SESSION-27 — `/upcoming`/`/history` replace `/mine`, and their sort is non-negotiable.**
    Both are scoped by the caller's own `SessionParticipant` row (`JOINED`/`INVITED` for upcoming,
    `JOINED`-only for history), not `createdBy` — unlike the removed `/mine`, a group-linked
    session is included exactly like a standalone one. `getUpcomingSessions`/`getSessionHistory`
    both strip any client-supplied `Pageable.sort` down to just `page`/`size` before querying (see
    `SessionServiceImpl.unsorted`) — the static `ORDER BY` in `SessionRepository.findUpcomingSessions`
    et al. (`scheduledStart ASC`, then a `PREPARING`→`SCHEDULED`→`ONGOING` tiebreak for `/upcoming`;
    `scheduledStart DESC` for `/history`) is not caller-overridable, since this ticket exists
    specifically because `/mine`'s old implicit, unrequested ordering silently dropped sessions past
    page 0. `GET /api/sessions/history?dateCount=` is pagination over **distinct dates**, not
    sessions — its own repository method (`findHistoryDateCounts`) is this module's second native
    query (`ProcessedMessageRepository.insertIfAbsent` in `notification-impl` is the first;
    `GROUP BY`/`LIMIT` on a date cast has no portable JPQL form).
13. **SESSION-66 — a share is a notification, not an invitation.** `shareSession` (`POST /{id}/shares`) writes one `session.share.created` outbox row per recipient (`SessionShareCreatedEvent`, actor = the caller) and **nothing else**: no `INVITED` participant row, no system comment. The friend opens the session from the notification ("{name} shared {session} with you") and asks to join under the normal `joinSession` rules. **Not** `session.invitation.created`, which means only an invitation made at creation; the key has three words because the notification queue is bound with `session.*.*` (a two-word key would never arrive). **Corrected by CLIENT-SESSION-49 (owner, 2026-11-18):** the first build let only a `JOINED` participant share, and only a `PREPARING`/`SCHEDULED` session (409 `SESSION_NOT_SHAREABLE`), and reused the invitation event; now any identified caller may share a standalone session in any status, and the event is its own. Order, every refusal before any write: `SessionShareGate` (404 `SESSION_NOT_FOUND`, then 403 `SESSION_SHARE_NOT_ALLOWED` for a private session, or `SESSION_GROUP_MEMBER_REQUIRED` for a non-member of a group session, SESSION-GROUP-3), then the recipients are filtered to the caller's own friend list (one `getAcceptedFriendIds` query, never `areFriends` per recipient). Skipped and counted, never refused (owner, 2026-11-18, first built as a whole-call refusal `SESSION_SHARE_NOT_FRIENDS`): anyone who is not a friend (the caller's own id falls out here too, they are not in their own list), repeated ids, a friend already `JOINED`/`REQUESTED`/`INVITED` (one derived query), a deactivated friend or an id with no account (`getActiveUserIds`, one ids-only query; `getUsersByIds`/`getUserSummariesByIds` return deactivated accounts on purpose, so they cannot do this; the rule is root `CLAUDE.md` § Account lifecycle: show includes deactivated, a new interaction excludes them). A friend who `LEFT` is notified again. Registered in `ERROR_CODES.md` § session; `SessionShareIntegrationTest` and `SessionEventsConsumerIntegrationTest` are the real-pipeline checks. **SESSION-GROUP-3 (owner, 2026-11-19): a group session is shareable too**, by any member of the group in any status (`SessionShareGate`: `isGroupMember`; the service passes `SESSION_GROUP_MEMBER_REQUIRED` as the forbidden code for a group session, so a non-member answers as on join), and the recipients are the group's other members (one `getMemberUserIds` call, the caller removed) instead of the friend list; everything else is the same: skipped and counted when outside the group, already in, repeated or deactivated, cap 50, the same `session.share.created` event, no participant row.
14. **SESSION-69 — a standalone session is public or private, and only its host (while `PREPARING`) chooses.** `CreateSessionRequest.isPublic` (omitted means `true`) and `UpdateSessionRequest.isPublic` (only while `PREPARING`: the whole update call is already 409 `SESSION_NOT_PREPARING` otherwise); `SessionResponse.isPublic` is exposed (SESSION-37 had kept it internal). A group-linked session is never public and `isPublic` is **ignored silently** for it, on create and on update. **Private** means seen only by its creator and anyone holding a `JOINED`, `REQUESTED` or `INVITED` row (`SessionDetailGate.grantsAccess`, the one definition; `LEFT`, so also a rejected request, loses access): it is never listed in Discover (`isPublic = true` in the queries, unchanged), `GET /{id}` and `GET /{id}/participants` go through `SessionDetailGate` (403 `SESSION_FORBIDDEN` for anyone else, never a 404), `joinSession` refuses a caller with no such row (checked before the cancelled rule, so a stranger learns nothing else about it; the participant row is read only for a session explicitly `isPublic = false`), comments, likes and thread-people were already participant-only (`SessionGate`), results `JOINED`-only (`SessionRecordGate`), and **`shareSession` refuses a private session** (`SessionShareGate`, 403 `SESSION_SHARE_NOT_ALLOWED`: a shared friend could not open it). Switching to private keeps every existing participant row (the host can still reject a `REQUESTED` one). The change is told in the thread: `SessionFieldChanges` carries `isPublic`, `SystemCode.SESSION_VISIBILITY_CHANGED` with `old` and `new` as `public` or `private` (a null counts as public); no notification (NOTIF-10 covers edits). Invitees of a private session come only from `inviteeIds` at creation. Census when adding any new way to read a session: `SessionPrivateSessionIntegrationTest` is the check.
15. **SESSION-GROUP-1 — a group member creates a custom group session, with an audience.** `createSession` with a `groupId`: `isGroupMember` (403 `SESSION_GROUP_MEMBER_REQUIRED`), the sport is the group's (a `sportId` is used only for a group that has none), `isPublic` false, `autoApprove` defaults to `true` (a standalone one still `false`), the creator is `JOINED`. `audience` (`ALL_MEMBERS` default, or `SPECIFIC` + `audienceUserIds`, no cap, every id a member, 400 `SESSION_AUDIENCE_REQUIRED` / `SESSION_AUDIENCE_NOT_MEMBER`) is stored on the session (`sessions.group_audience`, rows in `session_audience_members`) and decides **only who is notified**: every member can still see and join, and no `INVITED` row is made. `requireCanModify` for a group session = its creator **while still a member** (a creator who left loses the right) or a group owner/admin (403 `SESSION_GROUP_ADMIN_REQUIRED`). Two outbox events, three-word keys (`session.*.*` binding), one row per person in the creating/cancelling transaction: `session.group.created` (recipients: the audience minus the creator) and `session.group.cancelled` (the audience plus everyone `JOINED`, minus the actor), via `groupSessionRecipients`: current group members only (`getMemberUserIds`, one call), active accounts only (`getActiveUserIds`, one ids-only query), a `SPECIFIC` member who left the group is dropped at that moment, a session with no stored audience (created before V094, or generated) reads as all members. A standalone cancel notifies nobody. `unique_group_session_start` is gone (V094; a non-unique index on the same columns replaces it), so two sessions of a group may start together; the old generator's `existsByGroupIdAndScheduledStart` check is its only guard until SESSION-GROUP-5. `SessionGroupCustomSessionIntegrationTest` is the real-pipeline check.
16. **SESSION-GROUP-4 — a group's regular-session settings and recurrence configurations (configuration only; generation is SESSION-GROUP-5).** `GroupSessionConfigServiceImpl` + `GroupSessionConfigController` (`/api/sessions/group/{groupId}/settings|recurrences`). Tables (V095): `group_session_settings` (no row = off, WEEKLY), `group_session_recurrences` (a wall-clock slot: `day_key` 1-7 weekly or 1-31 monthly, local `start_time`, `duration_minutes`, `location_id`, audience, fee, `game_mood`, `attributes`, `is_draft`), `group_session_recurrence_members` (a `SPECIFIC` audience, FK + cascade to its recurrence). A recurrence belongs to the mode current when it was created and is **active** only while the group's mode equals it: switching the mode touches no row. Required: `dayKey` (valid for the mode, 400 `SESSION_RECURRENCE_DAY_INVALID`) and `startTime` (400 `SESSION_RECURRENCE_START_REQUIRED`); **draft** (`is_draft`, computed on every save, `missing` names why) = no location, no duration, or a FIXED fee without an amount; a draft is never generated. At most 5 per (group, mode, day), drafts included (409 `SESSION_RECURRENCE_DAY_LIMIT`; an update excludes itself; not locked, so two simultaneous creates on the same day could both pass). The location's sport must equal the group's (`GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH`, reused); attributes go through `SessionAttributeResolver` (extracted from `SessionServiceImpl`, same filter as a session) and a `SPECIFIC` audience through `GroupAudiences.validateSpecific` (shared with `createSession`). Read = any member; write = `canManageMembers`; a missing or inactive group is 404 `GROUP_NOT_FOUND` first, then a plain member 403 `SESSION_GROUP_ADMIN_REQUIRED` and a non-member 403 `SESSION_GROUP_MEMBER_REQUIRED`. **Every change writes a `GROUP_SYSTEM` post in the same transaction**, authored as the group's current owner (`GroupService.getGroupOwnerId`, the B9 rule, no system user): `SystemCode.GROUP_SESSION_RECURRENCE_ADDED|UPDATED|DELETED`, `GROUP_SESSION_GENERATION_ON|OFF`, `GROUP_SESSION_MODE_CHANGED`, params `name`, `mode`, and for the recurrence ones `day` and `time`; the English text is the fallback until the client has its en/vi copy (CLIENT-GROUP-SESSION-4). A recurrence update replaces its audience rows with a delete + flush + insert (Hibernate runs inserts before deletes, and the (recurrence, user) key would collide). The old single rule on `groups` (`recurrence_*`, `auto_generate_sessions`, `GET/PUT /api/groups/{id}/recurrence`) was removed by GROUP-1 (V097). `GroupSessionConfigIntegrationTest` is the real-pipeline check.
17. **SESSION-GROUP-5 — regular group sessions are generated from a queue.** Replaces SESSION-38's single-rule generator and closes SESSION-41. A group has generation **on** (`group_session_settings.enabled`) and its **complete, active-mode** recurrences (`is_draft = false`, mode = the group's, location and duration set) are the only ones ever generated. A recurrence is a wall-clock slot read in the **location's timezone**: `GroupSessionOccurrences.next` is the first slot that has not ended at `now` (today's if still ahead or under way), a monthly day the month lacks (29-31) is **skipped**, never clamped. The queue is `group_session_generation_queue` (`PENDING`→`DONE`/`FAILED`, unique `(recurrence_id, occurrence_date)`, drained in `target_start` order); a generated session carries `recurrence_id` + `occurrence_date`, and the unique index on that pair is the duplicate guard (V094 dropped `(group_id, scheduled_start)`). **Producers** (all idempotent, so they can race): (1) **startup** (`ApplicationReadyEvent`): every ON group queues its nearest day, then the queue is drained; (2) a **regular** session reaching `COMPLETED` (`closePastSessions`) or `CANCELLED` (`cancelSession`) publishes `RegularSessionsEnded`; if the group then holds no open regular session for that local date, its next nearest day is queued (custom sessions have no `recurrence_id` and never trigger; OFF queues nothing, so cancelling everything cannot regenerate); (3) an owner/admin switching generation ON, switching the mode while ON, or adding or editing a configuration publishes `ConfigChanged`: today's slots that have not ended are queued (generated at once, `SCHEDULED` or `ONGOING`), and, only if there are none, the nearest later day unless a `SCHEDULED`/`ONGOING` regular session already starts before it. Both events are handled **after the changing transaction commits** (`@TransactionalEventListener(AFTER_COMMIT, fallbackExecution = true)`), every handler is caught and logged, and every planner/generator call is `REQUIRES_NEW`, so a generation failure can never undo or fail the change that caused it. A slot is generated from the recurrence **as it is then** (an edit applies to slots not yet generated, never to generated sessions), as a session of the group's current owner (`getGroupOwnerId`), `autoApprove = true`, `isPublic = false`, the audience snapshotted onto the session (`group_audience`, `session_audience_members`), the companion post created first, and `session.group.created` written for the audience except the owner (`GroupSessionRecipients`). Skipped (queue row `DONE`, nothing created): recurrence gone or draft, generation off or the other mode, group inactive, the slot has ended, the session exists. A failure is retried 4 times with a 1, 5, 15, 60 minute backoff and the fifth ends `FAILED`; the startup recovery and the next trigger revive a `FAILED` slot. Single-instance deployment: no lock (the unique indexes make a second instance harmless). `GroupSessionGenerationIntegrationTest` is the real-pipeline check.
18. **SESSION-GROUP-6 — cancelling what a rule change leaves scheduled.** Before turning generation OFF, switching the mode or deleting a configuration the client asks `GET .../regular-sessions/count` (scope `ALL` for OFF and a mode switch, `RECURRENCE` + id for a delete), shows "X sessions are available, cancel them?" and sends the answer as `cancelScheduled` on the change (`PUT /settings`, `DELETE /recurrences/{id}`). `RegularSessionCanceller` cancels the group's `SCHEDULED`/`PREPARING` sessions that have a `recurrence_id` (an `ONGOING` one and every custom session are never touched) in the **same transaction** as the change: status `CANCELLED`, `cancelledBy` the actor, an English reason ("turned off", "switched ... to monthly/weekly", "removed this regular session configuration"), and `session.group.cancelled` to each session's audience and players, actor excluded (`GroupSessionRecipients`, per session: generation keeps one nearest day, so the sessions are few). It deliberately bypasses `cancelSession`: that publishes `RegularSessionsEnded`, which would queue the next day, and a cancel made for a rule change must never bring a session back (OFF queues nothing anyway; a mode switch still publishes `ConfigChanged`, which generates the new mode's sessions after the commit). `cancelScheduled` is ignored by a call that neither turns generation off nor switches the mode; "mode switch" cancels **all** the group's scheduled regular sessions (the spec's "all scheduled"), not only those of the mode being left (the ticket's parenthetical). `RegularSessionCancelIntegrationTest` is the real-pipeline check.
- **Every user-reachable throw is a coded exception (SESSION-45), with the status the availability-vs-visibility rule demands:** gate 404 `SESSION_NOT_FOUND` / 403 `SESSION_FORBIDDEN` (both `SessionGate` and `SessionDetailGate` use the coded `ResourceGate.require` overload), permission failures 403 (`SESSION_GROUP_MEMBER_REQUIRED`, `SESSION_GROUP_ADMIN_REQUIRED`, `SESSION_CREATOR_REQUIRED`), state conflicts 409 (`SESSION_CANCELLED`, `SESSION_NOT_CANCELLABLE`, `SESSION_NOT_PREPARING`, `SESSION_NOT_PARTICIPANT`), input rules 400. Technical validation (attributes size, `viewerZoneId`, controller query-param checks) stays un-coded and logs a `warn`. New throw sites must register a code in `documentation/md/ERROR_CODES.md` § session; `SessionErrorCodesIntegrationTest` is the real-pipeline check.

## Gotchas

- `SessionType.TOURNAMENT`/`TRAINING` are reserved enum values with **no** supporting logic —
  don't build features against them without a real design pass first.
- A **standalone** `CANCELLED` session has **no** notification/cleanup flow attached (joined participants aren't
  told) — cancelling only changes the row's own status/audit fields. A **group** session's cancel tells its audience and
  players (`session.group.cancelled`, SESSION-GROUP-1); the automatic cancels (a `PREPARING` session whose start passed) still tell nobody.
- A session with no `scheduledEndAt` **skips `ONGOING` entirely** — `findSessionsToStart` never
  matches it (a null `scheduledEndAt` fails the `> :now` comparison in JPQL), so it goes straight
  `SCHEDULED` → `COMPLETED` once `scheduledStart` passes, same as before this lifecycle existed.
- `GET /api/sessions/mine`/`getSessionsCreatedByUser` (standalone-only, creator-scoped) was
  **removed** by SESSION-27 in favor of `getUpcomingSessions`/`getSessionHistory(Dates)`, both
  participant-scoped (own `SessionParticipant` row, not `createdBy`) and covering standalone +
  group-linked alike. A group owner/admin's group-linked sessions they manage but never personally
  joined are still not covered by either — same pre-existing gap SESSION-27 flagged rather than
  fixed; still visible via `getGroupSessions`.
- Recurrence/auto-generation does **not** live in `SessionServiceImpl` (SESSION-GROUP-5, see rule 17): a recurrence's location sport is checked when the configuration is saved (`GroupSessionConfigServiceImpl`), not on every generated occurrence. The old single-rule generator (SESSION-2, SESSION-38: the `groups.recurrence_*` columns) is gone from this module.
- `SchedulingConfig` (`@EnableScheduling`) lives in `server/src/main/java/com/sportconnect/config/`,
  not in this module — app-wide `@EnableX` toggles are bootstrap-level config owned by the
  assembly module, while the `@Scheduled` job class itself lives here.
- The regular-session generator keeps **one nearest day** per group queued or generated at a time (each regular session's end queues the next day, rule 17), not a "N weeks ahead" window, by design.
- **A JPQL `(:param IS NULL OR ...)` optional-filter clause needs the `IS NULL` side cast too**
  (`CAST(:param AS <type>) IS NULL`, not bare `:param IS NULL`) — `SessionRepository
  .findDiscoverSessions` (SESSION-25) hit `"ERROR: could not determine data type of parameter $N"`
  against real Postgres for its `LocalDateTime` lower-bound param with only the comparison side
  cast; the `GroupRepository.searchPublicGroupsWithCounts` precedent this pattern is copied from
  happens not to trip it for its `String` param (verified live — temporal types are apparently a
  sharper edge for Postgres's parameter-type inference than `String`), but that's not a guarantee
  for every type. Only caught by an actual HTTP call against real Postgres — a mock-based Spock
  test proves the service calls the repository correctly, never that the JPQL itself is valid SQL.
  Cast every optional param's `IS NULL` check defensively when adding a new one here (SESSION-26).
- **Never apply a SQL date/time function (`CAST(... AS date/time)`, `EXTRACT(...)`) directly to
  `Session.scheduledStart` (or any `LocalDateTime`-mapped column) in a query — it silently reads
  the wrong value on this app.** This app sets `hibernate.jdbc.time_zone: UTC` (root
  `application.yml`), which shifts every stored `LocalDateTime` by the JVM's default-zone offset
  on write, but that shift is only *reapplied by Hibernate on a plain attribute read* — confirmed:
  `SELECT s.scheduledStart` correctly returns the intended wall-clock value, but
  `EXTRACT(HOUR FROM s.scheduledStart)` on that same row returned a value 7 hours off (this
  ICT/UTC+7 dev host), and `CAST(s.scheduledStart AS date)` on an early-morning session returned
  the **previous** calendar day. Confirmed on both H2 and real Postgres, and via a raw native
  query bypassing Hibernate entirely — this is not a Postgres-specific quirk. Found by
  `SessionDiscoverIntegrationTest` while building SESSION-25's `date`/`startTime` discover filters
  (three other time-typed/string-typed comparison strategies were tried first and each failed a
  different way — full history in `SessionRepository.findDiscoverSessions`'s Javadoc); a
  **pre-existing, already-shipped instance of the same bug** was found in `findHistoryDateCounts`
  (SESSION-27, a native query) and filed as **SESSION-31**, not fixed inline. The two safe patterns
  in this file: a plain `LocalDateTime`/`LocalDate` comparison (`>=`/`<`/`=` against the bare path
  expression — proven correct, e.g. `findUpcomingSessionsByDate`'s `[dayStart, dayEnd)` range), or,
  when a genuine time-of-day-regardless-of-date comparison is unavoidable, `EXTRACT` combined with
  a `MOD`-based correction using the JVM's current zone offset (see `findDiscoverSessions`'s
  `startTimeBeforeOrEqual`/`startTimeAfterOrEqual` clauses) — never a bare `CAST`/`EXTRACT` result
  compared directly. **Historical as of SESSION-33/34:** `scheduled_start` is now `TIMESTAMPTZ`, not
  the naive, implicitly-JVM-shifted `LocalDateTime` this bullet describes, and `findHistoryDateCounts`
  now buckets correctly via an explicit `AT TIME ZONE` conversion (SESSION-34) — this bullet stays
  for historical context and because the write-side shift it describes could resurface if a future
  `LocalDateTime`-mapped column reintroduces the same pattern.
- **H2's `CAST(timestamptz AS timestamp/date)` re-normalizes through the JDBC session's own default
  zone instead of preserving `AT TIME ZONE`-shifted wall-clock fields the way real Postgres does —
  confirmed empirically (SESSION-34), not documented behavior.** `AT TIME ZONE` itself computes the
  correct shifted value in H2 2.2.224 (`MODE=PostgreSQL`); only the subsequent narrowing cast to a
  zone-less type silently discards it and re-derives the date/time through the session zone instead,
  producing a *different, wrong* result than the same expression against real Postgres — this
  doesn't throw, so a test only against H2 can pass while being wrong on Postgres, or (as found
  here) fail on H2 while the underlying SQL is already correct on Postgres. Route through
  `TO_CHAR(x AT TIME ZONE zone, 'YYYY-MM-DD')` (or the equivalent format string for a time
  component) and cast *that* text result, never a direct `CAST(x AT TIME ZONE zone AS date/timestamp)`
  — verified to produce identical, correct output on both engines (see `SessionRepository
  .findHistoryDateCounts`'s Javadoc for the full empirical trail).
- **A second, narrower H2 quirk found in the same query (SESSION-34): `GROUP BY` on a repeated
  `CAST(TO_CHAR(x AT TIME ZONE :param, ...))` expression can fail with `Column "..." must be in the
  GROUP BY list` — through Hibernate specifically, not reproducible via a hand-written JDBC
  `PreparedStatement` sending the byte-identical SQL text (isolated to Hibernate's native-query
  execution path; root cause not fully isolated). The fix: `GROUP BY 1` (ordinal position of the
  `SELECT` list column) instead of repeating the expression — sidesteps expression-equivalence
  checking entirely, verified correct on both H2 and real Postgres. If a future query needs to
  `GROUP BY` a bind-parameter-containing expression, reach for ordinal `GROUP BY` first rather than
  re-debugging this from scratch.
- **HQL/JPQL has no `AT TIME ZONE` operator, and its Postgres function-call equivalent isn't
  portable to H2 (SESSION-35).** `findDiscoverSessions` stayed a JPQL query (not native, to keep
  returning `Session` entities + the `openSlots` scalar without a custom `@SqlResultSetMapping`), so
  the real `x AT TIME ZONE zone` operator `findHistoryDateCounts` uses (a native query) wasn't
  available here. The JPQL passthrough `function('timezone', :zone, s.scheduledStart)` compiles and
  runs correctly against real Postgres (`timezone(zone, x)` is Postgres's function-call form of the
  same operator) but fails at execution against H2 with
  `org.hibernate.exception.SQLGrammarException: Function "timezone" not found` — H2 implements the
  operator syntax but not this function-call form. SESSION-35 avoided the whole question by keeping
  the pre-existing `EXTRACT`+offset-shift correction (just sourcing the offset from the caller's own
  resolved zone instead of the JVM's), rather than switching to `AT TIME ZONE` — see
  `SessionRepository.findDiscoverSessions`'s Javadoc for the accepted residual DST gap that leaves.
  If a future query needs a real per-row `AT TIME ZONE` conversion inside a JPQL (not native) query,
  this function-call passthrough is not the way; either go native with a result-set mapping, or find
  another portable equivalent — don't re-attempt `function('timezone', ...)` expecting it to work on
  H2.
- **System comments carry a code (SESSION-GL-63).** `writeSystemComment` takes a `SystemCode` and its params (`name`), written next to the English `content` (the fallback the client shows when it does not know the code). `SessionRecordServiceImpl.applyChanges` writes one `SESSION_RECORDS_UPDATED` comment and one `session.record.changed` outbox event per change set in which an operation was saved (not for a rejected or unchanged one), in the same transaction; that comment never emits `session.comment.created`. Consumed by `notification-impl`'s `SessionEventsConsumer` (every JOINED, REQUESTED and INVITED participant but the actor, any session status).
- **A `PREPARING` edit writes one system comment per changed field (SESSION-67).** `SessionServiceImpl.updateSession` takes a `SessionFieldChanges.snapshot` before applying the request and diffs it with the saved session (the stored values, so a re-sent value is no change), then writes the result as one `createSystemSessionComments` batch in the same transaction, before the `session.details.updated` outbox row. Codes `SESSION_TITLE_CHANGED`, `_LOCATION_`, `_LOCATION_NOTE_`, `_START_`, `_DURATION_`, `_CAPACITY_`, `_FEE_`, `_FEE_NOTE_`, `_AUTO_APPROVE_`, `_INITIAL_SLOT_`, `_MALE_SLOTS_`, `_FEMALE_SLOTS_`, `_GAME_MOOD_`, `_ATTRIBUTES_CHANGED`; params `name` (the editor), `old`, `new` as strings, `""` meaning "no value" (the client reads added / changed / removed from which side is empty, "updated" for the three free-text fields); the fee carries `oldFeeType`, `oldFeeAmountVnd`, `newFeeType`, `newFeeAmountVnd`; attributes only `name`. The comment is authored by the session's creator and never emits `session.comment.created`. A **new editable field on `UpdateSessionRequest` needs its case in `SessionFieldChanges.diff`, a `SystemCode` value and a client case** (CLIENT-SESSION-51), or its changes are silently not told.
