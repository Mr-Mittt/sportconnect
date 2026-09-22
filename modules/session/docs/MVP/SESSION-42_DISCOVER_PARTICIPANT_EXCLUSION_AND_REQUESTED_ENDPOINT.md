# SESSION-42 · Widen Discover's participant exclusion (REQUESTED/INVITED, not just JOINED) + new "my pending requests" endpoint

**Status:** `DONE` (2026-09-22)
**Type:** Enhancement + New Feature
**Depends on:** none (touches SessionRepository's existing discoverSessions/findDiscoverDateCounts
queries, SessionServiceImpl, and SessionController — all shipped)
**Filed:** 2026-09-22, user request while reviewing Discover's/`upcoming`'s participant-filtering
behavior. SESSION-27 deliberately scoped `REQUESTED`-status visibility out of `/upcoming` ("a
pending request the caller hasn't been approved/accepted into yet doesn't belong in 'upcoming'"),
which means today there is no endpoint at all surfacing a caller's own pending join requests.

## Scope

1. **Widen Discover's participant exclusion.** `SessionRepository.findDiscoverSessions` and
   `findDiscoverDateCounts` (SESSION-25/37/39) currently exclude a session from Discover only when
   the caller's own `SessionParticipant` row is `JOINED`
   (`s.id NOT IN (... WHERE sp.userId = :callerId AND sp.status = 'JOINED')`), on top of the
   separate `s.createdBy <> :callerId` exclusion. Widen this to also exclude `REQUESTED` and
   `INVITED` — a session the caller already sent a join request for, or was invited to, shouldn't
   still surface as something to newly discover. Apply to **both** queries (user decision,
   2026-09-22) — they share the same exclusion clause today; widening only one would make
   `/discover/counts`'s numbers inconsistent with what `/discover` itself returns.
2. **New `GET /api/sessions/requested` endpoint** — "my pending requests." Lists sessions where the
   caller currently holds a `REQUESTED` `SessionParticipant` row, `Session.status IN (PREPARING,
   SCHEDULED, ONGOING)`, standalone or group-linked alike (same participant-row-scoping precedent
   as `/upcoming`/`/history` — not `createdBy`). Sort: `scheduledStart ASC`, non-overridable by the
   caller's own `Pageable.sort` (same precedent as `/upcoming`/`/history`, see
   `SessionServiceImpl.unsorted`). Paginated, matching `/upcoming`/`/history`'s existing shape
   (user decision, 2026-09-22).

**Scope correction (2026-09-22, at pickup):** the status filter above was originally drafted as
`PREPARING/SCHEDULED` only, on the assumption a `REQUESTED` row can't survive a session going
`ONGOING`. Verified false at pickup: no code path clears/transitions a `REQUESTED` row when a
session starts, completes, or is cancelled (`joinSession` only rejects `CANCELLED` at request
time; `startOngoingSessions`/`closePastSessions` never touch `SessionParticipant` rows). Widened
to `PREPARING/SCHEDULED/ONGOING` — the same status set `/upcoming` uses — so a still-pending
request for an already-started session doesn't silently drop out of this list (user decision).

## Edge cases / precedent

- **Account lifecycle:** no new explicit `isActive` check — matches every sibling listing endpoint
  (`/upcoming`, `/history`, `/discover`), none of which do one today; this ticket doesn't close
  that pre-existing gap (U12), just follows existing precedent.
- A session the caller was `INVITED` to (not yet accepted) is already visible via `/upcoming`
  (INVITED is included there) — excluding it from Discover too just stops it being
  double-surfaced, not a visibility loss.
- **A `REQUESTED` row for a session that later goes `CANCELLED` or `COMPLETED` is never
  auto-cleared**, and isn't covered by `/requested` (non-terminal statuses only, see the Scope
  correction above) or `/history` (`JOINED`-only). Accepted, pre-existing known gap — explicitly
  not handled by this ticket (user decision, 2026-09-22); see Out of scope.

## Out of scope

- Any change to the join-request workflow itself (`joinSession`/`approveParticipant`/
  `leaveSession`) — this ticket only changes *visibility*, not request creation/approval/decline.
- Group-owner/admin "requests to approve" (the *other* side of a join request — who's waiting on
  *my* approval) — **confirmed at pickup this already exists**: `GET /api/sessions/{sessionId}/
  participants?status=REQUESTED` (per-session, `canManage`-gated), consumed by the client's
  `useRequestedParticipants` hook as the approval queue. No follow-up needed — genuinely a
  different, already-solved feature from this ticket's caller-side "my own pending requests."
- `SESSION-26`'s attribute filtering — unrelated axis.
- Surfacing or cleaning up a stale `REQUESTED` row against a `CANCELLED`/`COMPLETED` session
  (known gap, see Edge cases) — no new "requested history" view, no auto-`LEFT` transition on
  cancel/complete.

**Tests:** Spock coverage for both widened Discover queries (REQUESTED excluded, INVITED excluded,
JOINED still excluded, a genuinely-eligible session still included) + new `/requested` endpoint
(REQUESTED-only inclusion, PREPARING/SCHEDULED/ONGOING included — CANCELLED/COMPLETED excluded,
standalone + group-linked, `scheduledStart ASC` sort, pagination, another user's REQUESTED row not
leaking).

---

## Implementation summary (2026-09-22)

Built exactly as approved in Phase 3, plus one real design nuance found while touching the
repository code (not a scope change — a query-correctness detail the Phase 3 plan already
anticipated at a high level but hadn't traced through in full):

**The widened exclusion required a genuinely new repository parameter, not a widened existing
one.** `findDiscoverSessions`'s single `:joinedStatus` param served **two different roles** in the
same query — the caller-exclusion `NOT IN` subquery (what needed widening) *and* the
`openSlots`/`minOpenSlots` capacity-counting subqueries (which must stay `JOINED`-only forever —
widening it there would have silently undercounted a session's remaining capacity by also
subtracting pending requests/invites as if they occupied a slot). Fixed by adding a new,
independent `excludedParticipantStatuses` param used only in the exclusion subquery, leaving
`joinedStatus` completely untouched everywhere else. Same split applied to `findDiscoverDateCounts`
(native query, string-typed enum names). Documented in both methods' Javadoc so a future reader
doesn't try to merge the two params back into one.

**`/requested` needed zero new repository code.** `findUpcomingSessions` (SESSION-27) was already
fully generic over `participantStatuses` — `getRequestedSessions` calls it unchanged with
`List.of(REQUESTED)` and the same `UPCOMING_SESSION_STATUSES` (`PREPARING`/`SCHEDULED`/`ONGOING`)
constant `/upcoming` uses, matching the pickup-time scope correction above. Same sort,
same non-overridable-`Pageable` contract, same `toResponsePage` enrichment path.

**Client:** `client/e2e/mocks/handlers/sessions.ts`'s `/api/sessions/discover` MSW handler was
widened inline in this same change (user decision at Phase 2) — it only excluded `JOINED` before,
which would have silently diverged from the real backend contract the moment this shipped. No
`/discover/counts` MSW handler exists (unconsumed by the client so far, per SESSION-39's own
note), so nothing to update there. No real `/requested` UI was built — wasn't asked for; a client
follow-up ticket for that UI can be filed on request, not filed speculatively here.

**Consumer census (re-confirmed post-implementation):** `discoverSessions`/
`getSessionDiscoverDateCounts` are `SessionServiceImpl`'s only two callers of the widened
repository methods — both updated in this change. `/requested` is a brand-new endpoint with no
existing consumers (backend or client) — verified via a repo-wide grep before wiring the
controller.

### IT changes report

**Modified:**
- `SessionServiceImplSpec` (`session-impl`) — every existing `discoverSessions`/
  `getSessionDiscoverDateCounts` mock-call-arg assertion (23 call sites across 19 + 4 tests)
  updated to include the new `excludedParticipantStatuses` param at its new position; behavior
  unchanged, purely mechanical after the signature widening. Two new tests added:
  `getRequestedSessions queries REQUESTED-only across PREPARING/SCHEDULED/ONGOING` (delegation +
  exact repo-call args) and `getRequestedSessions strips any client-supplied sort, keeping only
  page/size` (mirrors `getUpcomingSessions`'s own sort-stripping test).
- `SessionDiscoverIntegrationTest` (`server`) — new
  `baseline_excludesAlreadyRequestedAndInvitedSessionsToo`, seeding a REQUESTED row and an INVITED
  row for the caller alongside a genuinely-eligible session, proving only the eligible one survives
  a real `MockMvc` + H2 round trip.
- `SessionDiscoverDateCountsIntegrationTest` (`server`) — same shape,
  `baseline_excludesAlreadyRequestedAndInvitedSessionsToo`, proving `/discover/counts`'s count
  reflects the same widened exclusion.
- `SessionListingIntegrationTest` (`server`) — new `── /requested ──` section, 6 tests: status-set
  inclusion (`PREPARING`/`SCHEDULED`/`ONGOING` included, `CANCELLED`/`COMPLETED` excluded —
  directly proving the known-gap edge case behaves as documented, not just asserted in prose),
  REQUESTED-only participant-status inclusion (JOINED/INVITED excluded), group-linked alongside
  standalone, no cross-user leakage of another caller's REQUESTED row, real pagination past page 0,
  and an empty-result case.

**Green:** `session-impl` full Spock suite (unchanged pass count, all updated/new tests included) +
the three touched IT classes in isolation (`SessionDiscoverIntegrationTest`,
`SessionDiscoverDateCountsIntegrationTest`, `SessionListingIntegrationTest` — 89 tests combined) +
full `:server:test` (0 failures across every test class). Client: `npx tsc -b` clean, and
`matches-journey.spec.ts` (the one `e2e` flow spec exercising Discover) re-run and passing against
the widened MSW mock — the full `e2e`/`visual-regression` projects were not run wholesale, since
this is a backend ticket with one small inline client mock fix, not a client ticket triggering the
full client Phase 5 discipline.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
