# Session Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/session/session-impl`
**Last updated:** 2026-08-01

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
| 8 | SESSION-8 | Session discover ranking algorithm | `TODO` |
| 9 | SESSION-9 | Expose the caller's own participant status (any status) via getSessionParticipants | `TODO` |
| 10 | SESSION-10 | Session comments — participant discussion thread on `SessionDetailModal` | `TODO` |

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

## SESSION-10 — Session comments: participant discussion thread

**Filed:** 2026-08-07, from a `/vision` session — see
`documentation/md/vision/SESSION_COMMENTS_VISION.md` for the full discussion, rejected
alternatives, and open questions.

New `SessionComment` entity, domain-scoped to `modules/session` (this repo's domain-scoped-tables
rule means it does **not** reuse `post-impl`'s `Comment` entity/table, even though the shape
matches — no cross-domain JPA relationship, no shared table). Shape mirrors `post-impl`'s comments:
one level of nesting via a `parentCommentId` (replies cannot themselves be replied to, same
enforcement as `post-impl`'s `CommentServiceImpl`), per-comment likes via a `SessionCommentLike`
join, and the same Redis preview-cache pattern `post-impl` uses.

**Gating:** readable/postable only by callers with a `SessionParticipant` row in `JOINED`,
`REQUESTED`, or `INVITED` status for that session — `LEFT` loses access. No public read for
non-participants (e.g. someone browsing a standalone session from Discover before joining).
Applies uniformly to standalone and group-linked sessions — not conditional on `groupId` (a
group-linked session's comment thread is scoped to that specific session, independent of the
group's own chat channel).

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
