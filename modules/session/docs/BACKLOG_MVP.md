# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-08-13

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/feature <ticket-id>` to plan, `/implement` to execute

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | SESSION-1 | Session domain core — manual create/join/leave, group or standalone | `DONE` |
| 2 | SESSION-2 | Scheduled auto-generation job for group-recurring sessions | `DONE` |
| 3 | SESSION-3 | Full status lifecycle (ONGOING, CANCELLED) + cancel reason/who/when | `DONE` |
| 4 | SESSION-4 | Standalone session discovery — browse/join sessions you didn't create | `DONE` |
| 5 | SESSION-5 | Session capacity + fee/pricing | `DONE` |
| 6 | SESSION-6 | Join-approval workflow + invite-friends-at-creation | `DONE` |
| 7 | SESSION-7 | Partial index on `sessions.sport_id` for standalone sport filtering | `DONE` (bundled into SESSION-4) |
| 8 | SESSION-9 | Expose the caller's own participant status (any status) via getSessionParticipants | `DONE` |
| 9 | SESSION-11 | Drop DB-level FKs on session tables' cross-domain columns | `DONE` |
| 10 | SESSION-10 | Session comments — reuses post-impl's Comment via a companion `SESSION_POST` anchor | `DONE` |
| 11 | SESSION-12 | Partial index on `sessions` scoped to `status = SCHEDULED` for the generation job's hot queries | `DONE` |
| 12 | SESSION-8 | Session discover ranking algorithm | `TODO` |
| 13 | SESSION-13 | `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method | `DONE` |
| 14 | SESSION-14 | Reduce `mapToResponses`' round trips (2 points) | `TODO` |

---

## SESSION-1 — Session domain core (manual only)

New `modules/session` domain. A `Session` is a scheduled sports activity — group-linked
(`groupId` set, owner/admin-gated) or standalone (`groupId` null, open to any user). Always
references a `Location` (`modules/location`) by id, validated to be for the same sport as the
session, plus an optional free-text `locationNote` (e.g. "Court 3") scoped to the session itself.
Minimal `SessionParticipant` join/leave. Deliberately excludes recurrence/auto-generation — see
SESSION-2. See `documentation/md/SESSION_LOCATION_DESIGN.md` for the full design context.

**Endpoints:**
```
POST   /api/sessions                          ROLE_USER
GET    /api/sessions/{id}
GET    /api/sessions/group/{groupId}          paginated, private-group visibility enforced
GET    /api/sessions/mine                     paginated, caller's standalone sessions
PUT    /api/sessions/{id}                     creator (standalone) or owner/admin (group)
POST   /api/sessions/{id}/cancel               same gating; soft — see SESSION-3
POST   /api/sessions/{id}/join
DELETE /api/sessions/{id}/leave
GET    /api/sessions/{id}/participants        paginated, JOINED-only
```

**Deferred (not part of SESSION-1):** recurrence/auto-generation (SESSION-2), full status
lifecycle/cancellation (SESSION-3), `TOURNAMENT`/`TRAINING` session types (enum values reserved
only), session capacity/waitlist, geo-proximity/nearby session search.

## SESSION-2 — Scheduled auto-generation job

Adds `SchedulingConfig` (`@EnableScheduling`, in `server/`, sibling to the existing
`AsyncConfig`), `SessionGenerationService` (internal, not exposed via `session-api` — generates
the single next occurrence per group with `autoGenerateSessions` enabled via
`GroupService.getGroupsWithAutoGenerateSessionsEnabled()`, copying `recurrenceLocationNote` into
the new `Session.locationNote`, and closes past `SCHEDULED` sessions to `COMPLETED`), and
`SessionGenerationJob` (`@Scheduled`: hourly generate, every-15-min close). No distributed lock
— single-instance deployment today; the `unique_group_session_start` DB constraint is the
idempotency backstop for a race.

## SESSION-3 — Full status lifecycle (ONGOING, CANCELLED)

`SessionStatus` gains `ONGOING` (automatic, via `SessionGenerationJob.startOngoingSessions`,
every 15 min — `SCHEDULED` → `ONGOING` once `scheduledStart` arrives, only for sessions with a
`scheduledEndAt`; no-duration sessions skip straight to `COMPLETED` as before) and `CANCELLED`
(manual only, via the new `POST /api/sessions/{id}/cancel`, same creator/owner-admin gating as
`updateSession`). `Session` gains `cancelReason` (optional free text), `cancelledBy`,
`cancelledAt`. **`deleteSession`/`DELETE /api/sessions/{id}` was removed entirely** — cancel is
now the only way to remove a session from active use, always soft (row kept). `joinSession`
rejects joining a `CANCELLED` session. No notification/cleanup flow on cancel (joined
participants aren't told) — not requested, not built.

## SESSION-4 — Standalone session discovery

**Filed:** 2026-08-01, while scoping the client's `UpcomingMatches` rail "Join a match" CTA
(`client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md`) — the same gap CLIENT-SESSION-1's
summary already flagged: `GET /sessions/mine` returns only the caller's own standalone sessions and
`GET /sessions/group/{groupId}` only one group's — there is no way for a user to browse a standalone
session someone else created and isn't in any of their groups.

Adds an endpoint (e.g. `GET /api/sessions/discover`, paginated, `sportId` filter optional) returning
`STANDALONE` sessions with `status IN (SCHEDULED, ONGOING)`, excluding sessions the caller created
(those already surface via `/sessions/mine`) and, likely, excluding sessions the caller already
joined (surfaces via participant status instead — exact exclusion rule is this ticket's to decide,
not predetermined here). Whether private/group visibility rules have any bearing here is moot —
standalone sessions have no group, so today's `groupService.getGroup` visibility gate doesn't apply;
confirm there's no other visibility concept intended (e.g. sport-profile-only, friends-only) before
building the query as fully public-to-any-`ROLE_USER`.

**Client follow-up (not filed yet):** a browse/discovery UI, and repointing `UpcomingMatches`'s
`onJoinMatch` (currently just `navigate('/matches')`, per CLIENT-SESSION-2) at it.

**Delta (2026-08-02, at pickup):** status filter is **`SCHEDULED` only**, not
`IN (SCHEDULED, ONGOING)` as sketched above — once a session starts it's no longer something to
discover-and-join, only something the caller sees in their own joined list. Exclusion rule decided
as: excludes both created and currently-`JOINED` sessions (a `LEFT` session is eligible to
reappear). Visibility decided as: gated to sports the caller holds an **active** `UserSportProfile`
for (not fully public). Also added `GET /api/sessions/joined` (required `status` param) for a
not-yet-built 3-section matches page's other two sections (joined+ongoing, joined+completed) — a
related need surfaced during scoping, not part of the original sketch. Full writeup:
`modules/session/docs/SESSION-4_STANDALONE_DISCOVERY.md`.

## SESSION-5 — Session capacity + fee/pricing

**Filed:** 2026-08-01, split out of the `CreateSessionModal` redesign scoped in
`client/docs/CLIENT-SESSION-2_RAIL_CTAS_AND_CREATE_REDESIGN.md` (draft requirements: "Taken slot"/
"Open slot" numeric inputs 1–24, and a "Fee" group — mutually exclusive "Free" checkbox, "Split cost"
checkbox, or a fixed VND amount).

`Session` gains `capacity` (nullable int — "open slots"; "taken" is derived from the existing
`participantCount`, not a second stored counter that could drift). Fee: `feeType` enum
(`FREE`/`SPLIT`/`FIXED`) and `feeAmountVnd` (nullable, meaningful only when `feeType = FIXED`; VND
is the only currency for now, per the draft requirement). New fields on `CreateSessionRequest`/
`UpdateSessionRequest`/`SessionResponse`.

**Open design question for whoever picks this up:** should `joinSession` reject once
`participantCount >= capacity`? SESSION-1's original "Deferred" list explicitly excluded
"session capacity/waitlist" — a waitlist stays out of scope here too; this ticket is capacity as a
display/informational cap unless a hard join-reject is deliberately decided at pickup time.

**Client follow-up (not filed yet):** capacity/fee display on `SessionListCard`/`UpcomingMatches`/
`SessionDetailModal`, and the "Taken slot"/"Open slot"/"Fee" inputs in `CreateSessionModal`'s
"Session basic information" section (both excluded from CLIENT-SESSION-2 for lacking backend
support).

**Delta (2026-08-02, at pickup):** open design question resolved — capacity stays purely
informational/display-only, `joinSession` never enforces it, no waitlist. Both `capacity` and
`feeType` are **mandatory** on `CreateSessionRequest` (no default fallback for a missing field);
`feeAmountVnd` is required only when `feeType=FIXED`, cross-field-validated in
`SessionServiceImpl`, not the DTO. `capacity` bound is `>= 0` with no upper cap (the client's
1–24 picker is a UI constraint only). Both fields are editable via `updateSession`. Pre-existing
rows and auto-generated `GROUP_RECURRING` sessions backfill to `capacity=9999` (sentinel =
uncapped) / `feeType=FREE`. Full writeup: `modules/session/docs/SESSION-5_CAPACITY_AND_FEE.md`.

## SESSION-6 — Join-approval workflow + invite-friends-at-creation

**Filed:** 2026-08-01, split out of the same `CreateSessionModal` redesign (draft requirements: an
"Invite your friend" search-and-multi-select at creation, and an "Auto approve join request"
checkbox — default **unchecked** — with a yes/no confirm warning when checked, since checking it
means "everyone can join without your review"). Bundled into one ticket because they're coupled: an
explicitly invited friend most plausibly bypasses whatever approval gate a non-invited joiner faces,
which only makes sense to design with both in view at once — same reasoning that kept them one ticket
rather than two.

Mirrors the group join-request precedent already built in `modules/social/group-impl` (see its
`docs/BACKLOG_MVP.md`, tickets around B11/B13/B14/B15) rather than inventing a new shape from
scratch. Rough sketch, not a final design: `ParticipantStatus` gains a `PENDING` value; `Session`
gains an `autoApprove` boolean set at creation (default `false`, matching the draft's unchecked
default); `joinSession` branches on it — `true` keeps today's instant-`JOINED` behavior, `false`
creates a `PENDING` row and needs a new approve/reject endpoint gated the same way
`cancelSession`/`updateSession` already are (creator for standalone, owner/admin for group-linked).
`CreateSessionRequest` gains an optional `inviteeIds: List<UUID>` — **exact behavior for invitees
(auto-`JOINED`, or a distinct "invited" status the recipient still has to accept) is this ticket's
design decision, not predetermined here.**

**Client follow-up (not filed yet):** the "Invite your friend" search (client-side fullname filter
over `useFriends()`'s existing full-list result — no new search endpoint needed, confirmed while
scoping CLIENT-SESSION-2) with dismissible-badge multi-select in `CreateSessionModal`; the "Auto
approve join request" checkbox + confirm warning; and an approval queue surfaced for
creators/managers, most likely in `SessionDetailModal` (mirroring how the Groups page's Members tab
already surfaces its own join-request approval queue).

**Delta (2026-08-02, at pickup):** invitee behavior resolved as **not** auto-`JOINED` — mirrors the
group precedent, the invitee still calls `joinSession` themselves (that call *is* their
acceptance; no separate accept endpoint). `ParticipantStatus` ended up with **two** new values,
not one `PENDING` — `REQUESTED` (self-initiated, needs creator/owner-admin approval) and
`INVITED` (pre-seeded from `inviteeIds`, bypasses approval, needs only the invitee's own
`joinSession` call). No second table/reconciliation layer was needed unlike groups' — see
`modules/session/docs/SESSION-6_JOIN_APPROVAL_AND_INVITES.md` for why. Approval queue reuses `GET
.../participants?status=REQUESTED` rather than a new dedicated route. Added beyond the original
sketch: the session creator is now auto-added as a `JOINED` participant at creation (standalone
only), and reject carries an optional reason (`RejectParticipantRequest.reason`). `autoApprove` is
optional (not mandatory like SESSION-5's `capacity`/`feeType`) and backfills existing sessions to
`true` to preserve their pre-ticket instant-join behavior. Full writeup:
`modules/session/docs/SESSION-6_JOIN_APPROVAL_AND_INVITES.md`.

## SESSION-7 — Partial index on `sessions.sport_id`

**Filed:** 2026-08-01, found auditing `sport_id`-as-filter indexing across the app (client-side
discussion, `client/docs/BACKLOG_MVP.md`) — `V031__create_sessions_table.sql` indexes `group_id`,
`created_by`, `(status, scheduled_start)`, and `location_id`, but **`sport_id` has no index at
all**, confirmed by reading the migration directly, not assumed.

No query filters by `sport_id` server-side today — `MatchesPage`/`UpcomingMatches` filter by sport
client-side after fetching. This index is filed **ahead of** its real consumer: SESSION-4
(standalone session discovery, `TODO` above) will need exactly this once it's picked up — "browse
standalone sessions for sport X" is the query this index targets.

**Migration:**
```sql
CREATE INDEX idx_sessions_sport_id_standalone ON sessions(sport_id) WHERE group_id IS NULL;
```
Partial, not plain — scoped to standalone sessions only (`group_id IS NULL`), since a group-linked
session is already found via `idx_sessions_group_id` and never needs a sport-scoped lookup of its
own. Deliberately just `sport_id` alone, not a composite with `status` — SESSION-4's exact query
shape (whether it also needs `status` or `scheduled_start` in the same index) isn't written yet;
extending this index is SESSION-4's call once its real query exists, not a guess made here ahead of
time (same "don't design for hypothetical future requirements" reasoning as everywhere else in this
codebase). Register in `db.changelog-master.xml` per the usual convention.

**No code changes** — pure index addition, nothing in `SessionServiceImpl`/`SessionRepository`
uses `sport_id` as a filter yet.

**Verification:** no new Spock tests (no new logic). Once SESSION-4 exists, `EXPLAIN ANALYZE` its
real query against a populated `sessions` table and confirm the planner uses this index (extending
it first if SESSION-4's query needs more than a bare `sport_id` equality/`IN` check).

**Delta (2026-08-02):** bundled into SESSION-4 rather than picked up separately, once SESSION-4's
real query shape was known. Shipped as the composite `(sport_id, status, scheduled_start)`, not the
bare `sport_id` sketched above — SESSION-4's query filters on `sportId IN (...)`, `status =
SCHEDULED`, and sorts by `scheduledStart`, so the composite serves it directly. See
`modules/session/docs/SESSION-4_STANDALONE_DISCOVERY.md`.

## SESSION-8 — Session discover ranking algorithm

**Filed:** 2026-08-03. `GET /api/sessions/discover` (SESSION-4) currently sorts results by a plain
`scheduledStart ASC` (`@PageableDefault` on the controller, client-overridable via `?sort=` like
any Spring Data `Pageable`) — soonest-first, nothing else. This ticket replaces that with a real
ranking algorithm so the sessions most relevant to the caller surface first, rather than just the
next chronological one.

Signal candidates to evaluate at pickup (not predetermined — confirm against what data actually
exists before committing to any of these): distance from the caller to the session's location,
match between the session's sport and the caller's `UserSportProfile` (e.g. skill level), how full
the session is (`participantCount` vs `capacity`), how soon it starts. Exact scoring formula,
which signals make the cut, and SQL-side vs in-app scoring is this ticket's design decision.

**Deferred (2026-08-03):** paused at Phase 1 pending the client-side discover UI work — pick up
scoping again once there's a concrete UI to design the ranking against. Groundwork from the
Phase 1/2 discussion so far, worth reading before re-scoping:
- No `ST_Distance`/`ST_DWithin` geo-distance query exists anywhere in the codebase yet — a true
  proximity signal would be new plumbing (`User.location`/`Location.location` are both
  `geography(Point,4326)`, but nothing queries distance on them today).
- `User.city`/`User.country` (`modules/user/user-impl/.../entity/User.java:78-82`) already exist
  as plain free-text columns, set directly from `UpdateProfileRequest` with no normalization/
  reverse-geocoding — usable as a coarse, zero-new-infra proximity signal ("same city") without
  touching PostGIS, at the cost of being typo/format-inconsistent ("NYC" vs "New York").
- OpenStreetMap's Nominatim could auto-detect/normalize `city`/`country` from `location`
  (self-hosted or the public rate-limited API), but that's data-quality work that belongs on
  `modules/user`, not this ticket — a separate ticket if/when it's wanted, not a prerequisite here.
- `UserSportProfile.skillLevel` (`modules/sport/sport-impl/.../entity/UserSportProfile.java:46-47`)
  is free-text, not an ordered enum — a skill-match signal starts as exact-string-match only.
- `participantCount` (fill-rate signal) is computed post-query in `mapToResponses`, not a raw SQL
  column — ranking on it means either moving that computation earlier or paginating in-app.
- No weighted/multi-factor ranking precedent exists elsewhere in the codebase (the closest is the
  personalized feed's flat `ORDER BY lastInteractionAt DESC`) — whatever this ticket builds sets a
  new pattern, not a copy of an existing one.
- Also unresolved: whether combining signals should be a tiered priority sort (simple, stays
  SQL-`ORDER BY`-compatible with `Page`/`LIMIT`-`OFFSET` pagination) or a weighted composite score
  (more flexible, real added complexity to keep DB-side-paginatable).

## SESSION-9 — Expose the caller's own participant status (any status) via getSessionParticipants

**Filed:** 2026-08-03. Found while wiring `SessionDetailModal` to show the right action
(Join/Leave/"Accept this session"/"Waiting for approval") based on the *caller's own*
`SessionParticipant.status` for that session. SESSION-6 added `INVITED`/`REQUESTED` to
`ParticipantStatus`, but `getSessionParticipants`'s existing gate —
`effectiveStatus != JOINED` requires `requireCanModify` (creator/owner-admin only) — means a
regular invitee or a user with a pending join request has **no way to see their own row** unless
they also happen to manage the session. `GET /participants` (defaulting to `status=JOINED`) simply
omits them entirely if they're `INVITED` or `REQUESTED`, and querying `?status=INVITED` or
`?status=REQUESTED` themselves 400s for a non-manager.

**What ships (user decision on approach — "add self to the existing query", not a new endpoint):**
`getSessionParticipants` always includes the caller's own `SessionParticipant` row in the result,
regardless of the `status` filter and regardless of `canManage` — since it's always the caller's
*own* row, not someone else's, this doesn't leak anything the manager-only gate is meant to
protect (that gate stays exactly as-is for every other participant's non-JOINED row). Exact
mechanism is this ticket's design decision at pickup: e.g. union the caller's own
`findBySessionIdAndUserId` result into the paginated status-filtered query's content (careful not
to duplicate it if it already matches the filter, and not to break the `Page`'s
total-count/pagination math), vs. a separate small "my participation" field bolted onto the
response shape callers already fetch.

**Client follow-up (not built yet, this ticket unblocks it):** `SessionDetailModal` resolves the
caller's own status from the (now-complete) participants list instead of only checking for a
`JOINED` row, and swaps its Join/Leave button for one of four states:
- No row (or `LEFT`) → "Join" button (unchanged from today).
- `JOINED` → "Leave" button (unchanged from today).
- `INVITED` → "Accept this session" button — still calls the existing `joinSession` endpoint,
  which already resolves an `INVITED` row straight to `JOINED` regardless of `autoApprove`
  (SESSION-6), just needs its own label instead of reusing "Join".
- `REQUESTED` → "Waiting for approval" — disabled, no action; there's nothing for the requester
  themselves to do until the creator/owner-admin approves or rejects it.

**Explicitly out of scope (stays with CLIENT-SESSION-4, `client/docs/BACKLOG_MVP.md`, still
`TODO`):** the "Invite your friend" search + multi-select and "Auto approve join request" checkbox
at creation, and the owner/creator-side approval queue UI for reviewing *other* users'
`REQUESTED` rows. This ticket is scoped to the caller's own status only (user decision, 2026-08-03)
— CLIENT-SESSION-4 remains the ticket for those two pieces once picked up.

**Delta (2026-08-08, at implementation — re-clarified scope + design pivot):** the user expanded
scope beyond this text before pickup: the caller's status needed to drive Accept/**Decline**
(INVITED) and **Cancel** (REQUESTED) as real actions, not just a disabled "Waiting for approval",
and needed to cover the session card (list surfaces) in addition to `SessionDetailModal`. Given
that, the mechanism also changed from what this ticket originally proposed: instead of exposing the
caller's row via `getSessionParticipants` (which has real shipped client consumers expecting a raw
`Page` — wrapping it would have broken them), `callerParticipation: SessionParticipantResponse` was
added to `SessionResponse` instead, batch-resolved for every session-returning endpoint.
`getSessionParticipants` itself ships unchanged. Decline/Cancel needed no new endpoint —
`leaveSession`'s status filter was widened to accept `INVITED`/`REQUESTED` in addition to `JOINED`,
all transitioning to `LEFT` via the existing `DELETE /sessions/{id}/leave`. Full writeup:
`modules/session/docs/SESSION-9_CALLER_PARTICIPATION_STATUS.md`. Client follow-up filed as
**CLIENT-SESSION-9** (`client/docs/BACKLOG_MVP.md`).

## SESSION-10 — Session comments: reuses post-impl's Comment via a companion SESSION_POST

**Status:** `DONE` (2026-08-12) · **Full design record:**
`modules/session/docs/SESSION-10_SESSION_POST_COMMENTS.md`

**Filed:** 2026-08-07, from a `/vision` session — see
`documentation/md/vision/SESSION_COMMENTS_VISION.md` for the original discussion. **Redesigned
twice, 2026-08-12** (superseding both that vision doc and
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` §7's rejection of reusing `Post`, both of which
now carry supersession notes): rather than a new domain-scoped `SessionComment`/`SessionCommentLike`
entity pair, every `Session` gets one companion `Post` (`PostType.SESSION_POST`, post-impl A17),
created synchronously in the same transaction as the session, used purely as a comment-thread
anchor. Comments are `post-impl`'s *real*, already-shipped `Comment` entity, reused via internal
bypass methods on `CommentService` — but the client never touches `post-impl`'s endpoints directly:
`GET/POST /api/sessions/{sessionId}/comments` and `.../comments/{commentId}/like` are new
`session-api` endpoints, and the underlying `SESSION_POST` is unconditionally invisible via
`/api/posts/**` for everyone, including the session's own creator/participants.

**Why two reversals:** the ADR's stated objection was the bidirectional cross-domain dependency
reuse requires (`session-impl → post-api` to create the anchor, `post-impl → session-api` to gate
it). An interim pass built exactly that, reasoning it wasn't unprecedented (`group-impl ↔
post-impl` already has the same shape, B3 + B9) — and it worked, after fixing the predicted
circular Spring bean dependency with `@Lazy` (same fix `GroupServiceImpl` already uses). The user
then asked for something stricter: a genuinely **one-way** dependency, with `post-impl` carrying
zero awareness of sessions. See the SESSION-10 doc for the full path through both passes.

**Gating — `session-impl` finally gets the standalone `SessionGate implements ResourceGate<Session>`
the ADR originally specced in §6:**
```java
class SessionGate implements ResourceGate<Session> {
    public boolean isAvailable(Session session) {
        return session.getGroupId() == null || groupService.isGroupActive(session.getGroupId());
    }
    public boolean isVisibleTo(Session session, UUID viewerId) {
        boolean isParticipant = /* JOINED/REQUESTED/INVITED */;
        return isParticipant || (session.getGroupId() != null && groupService.isGroupMember(session.getGroupId(), viewerId));
    }
}
```
`SessionServiceImpl`'s comment-proxy methods (`createSessionComment`/`getSessionComments`/
`likeSessionComment`/`unlikeSessionComment`) call `sessionGate.require(...)` then delegate to
`CommentService`'s bypass methods, keyed on `session.getPostId()`. `post-impl` never checks — its
own `PostGate` already made the post unconditionally unavailable.

**Delta from the original vision-doc decision (unchanged by either redesign):** for a
**group-linked** session, group members are also visible/postable, not just `SessionParticipant`s —
the original decision (`SESSION_COMMENTS_VISION.md`) scoped this participants-only even for
group-linked sessions; the ADR discussion widened it, since a group-linked session's thread is also
effectively a group post. Standalone sessions are unaffected — still strictly participant-only.

**Post-ship additions (same day):** `POST/DELETE /api/sessions/{sessionId}/like` — same bypass
shape extended to the `SESSION_POST` anchor's own like/unlike (`PostService.likeSessionPost`/
`unlikeSessionPost`, delegating from `SessionServiceImpl` via the same `SessionGate`). Also fixed
a real IDOR in the comment-like bypass (a caller authorized for one session could like/unlike a
comment on a *different* session's thread by id alone) — `likeSessionComment`/`unlikeSessionComment`
now take an explicit `postId` cross-checked against the comment's real parent. `SessionController`
also had its auth-extraction unified: every endpoint uses `@PreAuthorize("hasRole('USER')")` +
`Authentication authentication` + `SecurityUtils.extractUserId()`, uniformly — simpler than
`PostController`'s own mixed A1 convention (`@AuthenticationPrincipal` for mutation/"MY OWN"
endpoints, `Authentication`+`SecurityUtils` for "viewing a resource by id" ones). `@PreAuthorize`
and the extraction mechanism are orthogonal (an AOP gate evaluated before the method runs vs. how
the method reads the already-authenticated principal), so pairing `@PreAuthorize` with
`Authentication`+`SecurityUtils` instead of `@AuthenticationPrincipal` is valid and deliberate.

**Delete:** own comment only — no creator/owner moderation capability in v1.

**Lifecycle:** no `SessionStatus` gating — the thread stays open for new comments regardless of
status, including `CANCELLED` or a session whose scheduled time has already passed.

**Endpoints (mirror `post-impl`'s comment shape):**
```
POST   /api/sessions/{sessionId}/comments
GET    /api/sessions/{sessionId}/comments
DELETE /api/sessions/comments/{commentId}
POST   /api/sessions/comments/{commentId}/like
DELETE /api/sessions/comments/{commentId}/like
```

**Client follow-up (not built yet, this ticket unblocks it):** `CLIENT-SESSION-8`
(`client/docs/BACKLOG_MVP.md`) — the comment section rendered in `SessionDetailModal`.

**Explicitly out of scope (v1):** live/real-time updates (client refetches on modal open — see
CLIENT-SESSION-8), notifications on new comment, creator/owner moderation (deleting others'
comments), locking the thread on cancellation.

**Open questions (not resolved in the vision session):** whether new comments should notify other
participants; what success looks like for this feature.

## SESSION-11 — Drop DB-level FKs on session tables' cross-domain columns

**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/session/docs/SESSION-11_DROP_CROSS_DOMAIN_FKS.md`
**Type:** Enhancement (Architecture) · **Filed:** 2026-08-10, as part of a
repo-wide sweep for cross-domain DB-level FKs, following the precedent set by `post-impl`'s A13
(`posts.sport_id`, `TODO`) — same rationale, applied domain-by-domain.

**Found:** four `session-impl`-owned columns carry a real Postgres FK across into a different
domain's table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `sessions.created_by` → `sessions_created_by_fkey` (into `user-impl`'s `users`, `NO ACTION`)
- `sessions.cancelled_by` → `sessions_cancelled_by_fkey` (into `users`, `NO ACTION`)
- `sessions.location_id` → `sessions_location_id_fkey` (into `location-impl`'s `locations`,
  `NO ACTION`)
- `session_participants.user_id` → `session_participants_user_id_fkey` (into `users`, `NO ACTION`)

**This one is not a "predates the rule" story like A13/A8/A15/B17.** `V031__create_sessions_table.sql`
and `V032__create_session_participants_table.sql` were both first committed **2026-07-30** — nearly
a month *after* root `CLAUDE.md`'s "cross-domain references use IDs only" rule was added
(2026-07-07), and this module's own `sessions.sport_id` column (same migration) already gets this
right — it's a plain unenforced `BIGINT`, no FK. `created_by`/`cancelled_by`/`location_id` were
missed despite the same file getting `sport_id` correct, and despite `groups.sport_id`
(`group-impl`) and `locations.sport_id` (`location-impl`) both already having established the
FK-free pattern by the time this module was built. All four columns are already plain `UUID`/`Long`
fields in their JPA entities (`Session.createdBy`/`cancelledBy`/`locationId`,
`SessionParticipant.userId`), no `@ManyToOne` — confirmed by reading the entities directly, not
assumed — so the application layer already complies; only the schema constraint doesn't, same end
state as the pre-rule cases even though the cause here is a miss, not an artifact of timing.

**Why it matters:** same as A13 — each of these is a hard schema coupling between `session-impl` and
either `user-impl` or `location-impl`, working against "monolith-first, microservice-ready."

**Fix approach:**
```sql
ALTER TABLE sessions DROP CONSTRAINT sessions_created_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_cancelled_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_fkey;
ALTER TABLE session_participants DROP CONSTRAINT session_participants_user_id_fkey;
```
Confirm every constraint name via `\d <table>` before writing the migration. One new Liquibase
changeset, next sequential `Vxxx` file, registered in `db.changelog-master.xml`. No entity/service/
DTO change — purely schema-level.

**Verify before/after:** all four are `NO ACTION` (not `CASCADE`), so there's no delete-cascade
behavior to lose — dropping these is lower-risk than A13/A8/A15/B17's `CASCADE` cases. Confirm no
code path relies on the FK rejecting an insert with a dangling `created_by`/`cancelled_by`/
`location_id`/`user_id` (e.g. a test deliberately asserting a DB-level constraint violation rather
than the service layer's own `ResourceNotFoundException`/`BadRequestException` checks) before
dropping.

**Out of scope:** `sessions.sport_id` (already correctly FK-free, nothing to do); the intra-domain
`session_participants.session_id → sessions.id` FK — same domain, correctly scoped, nothing to
remove; any change to any JPA entity, service, or repository in this module.

## SESSION-12 — Partial index on `sessions` scoped to `status = SCHEDULED`

**Status:** `DONE` (2026-08-12) · **Full writeup:**
`modules/session/docs/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md`

**Filed:** 2026-08-12. `V031__create_sessions_table.sql` indexes `(status, scheduled_start)` —
`idx_sessions_status_scheduled_start` — a plain, unscoped composite covering all four
`SessionStatus` values. Confirmed by reading the migration directly (see SESSION-1's entry above),
not assumed.

The index's real hot consumer is `SessionRepository.findSessionsToStart` (`status = :status AND
scheduledStart <= :now AND scheduledEndAt > :now`, called with `status=SCHEDULED` only), driven by
`SessionGenerationJob.startOngoingSessions` on a fixed **15-minute** `@Scheduled` cadence per
`session-impl`'s `CLAUDE.md`. Sessions are never deleted or purged — cancelled sessions are kept
soft (`SESSION-3`), completed ones stay rows forever — so the table's `COMPLETED`/`CANCELLED` share
only grows over time while the fraction still `SCHEDULED` at any moment stays comparatively small
and roughly constant. A plain index across all four statuses grows with the whole table's history;
a partial index scoped to `status = 'SCHEDULED'` would instead track only the live/pending slice
this query actually cares about, same "partial index on the actual hot query" reasoning as
SESSION-7 (`sport_id`, standalone-only) and SESSION-4's discover index.

**Migration (sketch, confirm exact shape at pickup):**
```sql
CREATE INDEX idx_sessions_scheduled_status_only ON sessions(scheduled_start, scheduled_end_at)
    WHERE status = 'SCHEDULED';
```
Register in `db.changelog-master.xml` per the usual convention, next sequential `Vxxx` file.
Whether the existing unscoped `idx_sessions_status_scheduled_start` should be dropped once this
ships, or left in place (it still serves the `status IN (SCHEDULED, ONGOING)`
`findSessionsToComplete` query, which a `status = 'SCHEDULED'`-only partial index can't fully
cover — that query is explicitly out of scope for this ticket, not overlooked) is this ticket's
call at pickup, not decided here.

**No code changes** — pure index addition/possible-drop, nothing in `SessionServiceImpl`/
`SessionRepository` changes.

**Verification:** no new Spock tests (no new logic). `EXPLAIN ANALYZE` `findSessionsToStart`'s
generated query against a populated `sessions` table (real mix of terminal and `SCHEDULED` rows,
not just fixture-sized) and confirm the planner picks the new partial index over the existing
composite or a seq scan.

**Delta (2026-08-12, at pickup):** both open calls above resolved. Existing
`idx_sessions_status_scheduled_start` **kept**, not dropped — still serves
`findSessionsToComplete`. Index shipped as **`scheduled_start` alone**, not
`(scheduled_start, scheduled_end_at)` as sketched — `scheduled_end_at > :now` stays a cheap
in-memory `Filter` on the already-small partial match set, confirmed via `EXPLAIN`. Shipped as
`V052__add_sessions_scheduled_status_partial_index.sql`. Full writeup:
`modules/session/docs/SESSION-12_PARTIAL_SCHEDULED_STATUS_INDEX.md`.

## SESSION-13 — `SessionResponse.likeCount`/`isLikedByCurrentUser` + `PostService.getSessionPostLikeInfo` batch method

**Status:** `DONE` (2026-08-12) · **Full writeup:**
`client/docs/CLIENT-SESSION-8_SESSION_COMMENTS.md` (this ticket is the backend half of that
client ticket's heart-button follow-up, not a separately-written summary doc)

**Filed:** 2026-08-12, mid-pickup on `CLIENT-SESSION-8` (`client/docs/BACKLOG_MVP.md`) — the user
asked for the session detail modal's heart (like) button, and a real gap surfaced while scoping
it: SESSION-10's "post-ship addition" shipped `POST/DELETE /api/sessions/{id}/like` (write-only)
but never added a way to read back whether a session is already liked or how many likes it has —
`SessionResponse` had no `likeCount`/`isLikedByCurrentUser` fields at all, so a client heart
button could accept a click but never show real state.

**What shipped:**
- `PostLikeInfoResponse` (`post-api`, new DTO): `{ likeCount, isLikedByCurrentUser }`.
- `PostService.getSessionPostLikeInfo(List<Long> postIds, UUID currentUserId)` (`post-api`/
  `post-impl`) — batch method, per this repo's no-N+1 rule applying across domain boundaries
  ("a batch method on a cross-domain -api interface is preferred over N calls to its single-item
  method"). Bypasses `PostGate` same as `likeSessionPost`, silently drops any `postId` that
  doesn't resolve to a real active `SESSION_POST` (same "resolve what you can" precedent as
  `getPostsByIds`). Backed by two new `PostLikeRepository` queries
  (`countGroupedByPostIdIn`/`findLikedPostIdsByUserIdAndPostIdIn`) — a **real batch DB query, not
  the per-post Redis-cache-with-fallback (`getCount`) pattern** `mapToResponse` uses for a
  regular post's own like count. That Redis key is only ever populated by a call through
  `getCount` itself, which nothing in the `SESSION_POST` path ever reaches
  (`likeSessionPost`/`unlikeSessionPost`'s `INCR_IF_EXISTS`/`DECR_IF_EXISTS` are no-ops against a
  key that was never initialized) — a Redis-first lookup would have silently read nothing for
  every session.
- `SessionResponse` gains `likeCount: Long`/`isLikedByCurrentUser: Boolean` (`session-api`), never
  null. `SessionServiceImpl.mapToResponses` batch-resolves them via the new `PostService` method,
  keyed by each session's own `postId`, alongside the existing creator/sport/location/
  participant-count/`callerParticipation` batch resolution.
- Fixed a stale doc comment on `SessionResponse.postId` while in the file — it described the
  pre-SESSION-10-second-pass design (client calling `/api/posts/{postId}/comments` directly),
  which stopped being true when SESSION-10's second pass shipped session-scoped endpoints instead.

**Tests:** new Spock coverage in `PostServiceImplSpec` (batch happy path, silently-dropped
non-`SESSION_POST`/nonexistent ids, empty input, null `currentUserId`) and
`SessionServiceImplSpec` (`mapToResponses` resolves `likeCount`/`isLikedByCurrentUser` from the
batch result, defaults to `0`/`false` when a postId is absent from it) —
`stubBatchEnrichment()`'s shared lenient stub extended with the new call so the other ~20 tests
routing through `mapToResponses` didn't each need updating individually. `:modules:social:
post-impl:test`, `:modules:session:session-impl:test`, and `:server:test` all green.

**Out of scope:** any change to `likeSession`/`unlikeSession` themselves (SESSION-10, unchanged);
an IT test — this isn't a new access-control boundary, just new read-only fields resolved through
an already-gated write path's sibling data.

## SESSION-14 — Reduce `mapToResponses`' round trips (2 points)

**Filed:** 2026-08-13. `SessionServiceImpl.mapToResponses` — the shared batch-resolution path
behind every session-returning endpoint (`getSession`, `discoverSessions`, `getGroupSessions`,
`getSessionsCreatedByUser`, `getJoinedSessions`, create/update/cancel) — currently issues **8–9
DB round trips per call** (a single `getSession(sessionId, callerId)` was used to count these
live): `sessionRepository.findById`, `userRepository.findAllById` (creator/cancelledBy),
`sportRepository.findAll` (only on a cold `@Cacheable("sports")` — free in steady state),
`locationRepository.findByIdIn`, `sessionParticipantRepository.countBySessionIdsAndStatus`
(JOINED count), `sessionParticipantRepository.findBySessionIdInAndUserId` (SESSION-9's
`callerParticipation`), and `PostService.getSessionPostLikeInfo`'s own 3 queries
(`postRepository.findByIdInAndIsActiveTrue`, `postLikeRepository.countGroupedByPostIdIn`,
`postLikeRepository.findLikedPostIdsByUserIdAndPostIdIn`). None of this is N+1 in the classic
sense (every query is already batch-shaped, list-safe) — this ticket is about round-trip count on
the already-batched path, not fixing a scaling bug.

**Two mergeable pairs identified (not yet implemented — scoping only):**

1. **Post-like count + caller-liked flag → 1 query** (low risk). `countGroupedByPostIdIn` and
   `findLikedPostIdsByUserIdAndPostIdIn` both hit `PostLikeRepository` for the same `postIds`.
   Mergeable via one grouped, conditional-aggregation query:
   ```java
   @Query("SELECT pl.postId, COUNT(pl), SUM(CASE WHEN pl.userId = :userId THEN 1 ELSE 0 END) "
        + "FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
   List<Object[]> countAndCallerLikedGroupedByPostIdIn(
       @Param("postIds") List<Long> postIds, @Param("userId") UUID userId);
   ```
   Same table, same aggregate shape (`GROUP BY` already caps to one row per post) — no data-volume
   tradeoff. Lives in `post-impl` (`PostLikeRepository`/`PostServiceImpl.getSessionPostLikeInfo`),
   so this half of the ticket touches a different module than the one below.

2. **Participant JOINED-count + caller's own row → 1 query** (medium risk — shared code path).
   `countBySessionIdsAndStatus` (aggregate) and `findBySessionIdInAndUserId` (caller's own row,
   any status) both hit `SessionParticipantRepository` for the same `sessionIds`. Mergeable into
   one row-fetch query, deriving both values in Java:
   ```java
   @Query("SELECT sp FROM SessionParticipant sp WHERE sp.sessionId IN :sessionIds "
        + "AND (sp.status = 'JOINED' OR sp.userId = :callerId)")
   List<SessionParticipant> findJoinedOrCallerBySessionIdIn(
       @Param("sessionIds") List<Long> sessionIds, @Param("callerId") UUID callerId);
   // then group by sessionId in Java: count JOINED entries for participantCount,
   // find the row with userId == callerId for callerParticipation
   ```
   Real tradeoff: swaps an aggregate `COUNT` for fetching full rows — a session with hundreds of
   JOINED participants pulls more bytes per query (still one round trip; latency usually still
   dominates over payload at this scale, but worth confirming before committing). Bigger blast
   radius than #1: this is `session-impl`'s own core batch-resolution path, exercised by every
   session list/detail endpoint — needs full `SessionServiceImplSpec`/`:server:test` coverage
   before landing, not just a `getSession`-scoped check.

**Not reducible, by design — do not attempt:**
- **Users/Sports/Locations queries** — separate domain modules (`user-api`/`sport-api`/
  `location-api`). `CLAUDE.md`'s architecture rule forbids collapsing cross-domain queries into a
  SQL join ("Cross-domain communication through `-api` interfaces only"; "Cross-domain references
  use IDs only — no JPA `@ManyToOne` across domain boundaries") — these calls have to stay
  independent, swappable-to-a-real-RPC interfaces for a future microservice split. Sports is
  already `@Cacheable`, so it's already a non-issue in steady state.
- **Post existence/type check** (`findByIdInAndIsActiveTrue`) — defensive validation that
  `Session.postId` resolves to a real active `SESSION_POST`. Technically droppable (`postId` is
  set once at creation and never changes — see SESSION-10's own notes), but that trades a safety
  net for one query. Flagged, not recommended, unless this endpoint becomes a profiled bottleneck.

**Expected result if #1 and #2 both land:** 8–9 queries → **6** for a single `getSession()` call
(~25–33% fewer round trips). **Not scheduled** — filed for later prioritization, no target date.
