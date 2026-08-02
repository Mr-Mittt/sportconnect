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
| 5 | SESSION-5 | Session capacity + fee/pricing | `TODO` |
| 6 | SESSION-6 | Join-approval workflow + invite-friends-at-creation | `TODO` |
| 7 | SESSION-7 | Partial index on `sessions.sport_id` for standalone sport filtering | `DONE` (bundled into SESSION-4) |

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
