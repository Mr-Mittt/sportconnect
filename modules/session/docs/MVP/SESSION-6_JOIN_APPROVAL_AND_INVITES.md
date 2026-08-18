# SESSION-6 — Join-Approval Workflow + Invite-Friends-at-Creation

**Status:** DONE (2026-08-02)

## Scope

Split out of the same `CreateSessionModal` redesign as SESSION-5 (draft requirements: an "Invite
your friend" multi-select at creation, and an "Auto approve join request" checkbox — default
unchecked). Bundled into one ticket because they're coupled: an invited friend bypasses whatever
approval gate a non-invited joiner faces.

The backlog explicitly pointed at the group module's join-request/invitation precedent
(`modules/social/group-impl`, B11/B13/B14/B15) rather than inventing a new shape from scratch.
Research into that precedent (see decisions below) showed groups need a two-table reconciliation
system (`GroupJoinRequest` + `GroupInvitation`) specifically because either table can
independently target the same person — SESSION-6 doesn't have that problem, so it doesn't need
that complexity.

## Decisions made during scoping (several evolved mid-implementation — noted where the design changed)

- **No second table, no B11-style reconciliation.** `SessionParticipant` gets two new status
  values instead of a parallel invitation table. This is the one deliberate divergence from
  mirroring groups' shape exactly — justified because groups' complexity exists to reconcile two
  independent tables that can target the same person; sessions only ever have one
  (`SessionParticipant`).
- **`ParticipantStatus` gains `REQUESTED` and `INVITED`, not a single `PENDING` value.** The
  initial design (matching the backlog's literal sketch) used one `PENDING` status plus an
  `invited` boolean on `SessionParticipant`. Mid-implementation, this was restructured per
  explicit feedback into two distinct status values instead — the status itself is now
  self-explanatory rather than requiring a side flag to disambiguate "awaiting creator approval"
  from "awaiting the invitee's own acceptance." `REQUESTED` = self-initiated join, awaiting
  creator/owner-admin decision. `INVITED` = pre-created at session creation from
  `CreateSessionRequest.inviteeIds`, resolved only by the invitee's own `joinSession` call
  (which is itself their "acceptance" — no separate accept endpoint was built). Once a row leaves
  `INVITED` (accepted or later left), that history isn't tracked; a leave-and-rejoin goes through
  the normal `autoApprove` gate.
- **Capacity is never enforced** (SESSION-1/SESSION-5's existing informational-only stance) — this
  ticket doesn't change that.
- **`autoApprove`**: optional on `CreateSessionRequest` (unlike SESSION-5's mandatory
  `capacity`/`feeType` — the backlog said "default false", implying optional), editable via
  `updateSession` (partial-update pattern, consistent with SESSION-5). **Backfill:** existing
  sessions got `auto_approve=true` (preserving their pre-ticket instant-join behavior); the
  column default then flips to `false` for new inserts, matching the client's unchecked checkbox
  default. Verified zero behavior regression for pre-existing sessions via the running server.
- **Approval queue is not a new endpoint.** `GET /api/sessions/{id}/participants` was extended
  with an optional `status` param instead of adding a dedicated route (explicit choice over the
  group-module precedent's separate `GET /join-requests` route). `status` omitted still defaults
  to `JOINED` and stays public (unchanged contract for existing callers); any other status (in
  practice `REQUESTED`) requires the same `requireCanModify` gate as `cancelSession`/
  `updateSession`.
- **Reject carries an optional reason** (`RejectParticipantRequest.reason`, mirroring
  `CancelSessionRequest`), persisted on `SessionParticipant.rejectReason`.
- **The session creator is auto-added as a `JOINED` participant at creation — standalone
  sessions only.** This was an explicit addition made mid-design (not in the original backlog
  sketch). Group-linked session creators are already implicitly the group's owner/admin and
  aren't auto-added.
- **No notifications** — confirmed during research that the group precedent has zero
  notification wiring for either of its flows (a `// TODO: notify` comment was never
  implemented). SESSION-6 follows the same default: approve/reject/invite are silent, matching
  how `cancelSession` already has no notification/cleanup flow.
- **No pre-validation of invitee eligibility.** `inviteeIds` isn't checked against group
  membership at creation time — the existing group-membership check in `joinSession` already
  blocks a non-member from ever actually joining, invited or not. The creator's own id and
  duplicate ids in `inviteeIds` are silently deduped/ignored, not rejected.

## What was built

**Migration** — `V041__add_session_join_approval.sql`:
```sql
ALTER TABLE sessions ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sessions ALTER COLUMN auto_approve SET DEFAULT false;
ALTER TABLE session_participants ADD COLUMN reject_reason VARCHAR(500);
```
`REQUESTED`/`INVITED` need no new column — same as the existing `JOINED`/`LEFT` values, `status`
is a Java enum with no DB `CHECK` constraint. Verified against the real dev Postgres: the 3
pre-existing sessions backfilled to `auto_approve=true`.

**Enum** — `ParticipantStatus`: `JOINED`, `LEFT`, `REQUESTED`, `INVITED`.

**Entities:**
- `Session` gains `autoApprove` (`Boolean`, `nullable=false`, `@Builder.Default = false`).
- `SessionParticipant` gains `rejectReason` (`String`, nullable, set only by `rejectParticipant`).

**`createSession`:**
1. `autoApprove` resolves to `false` if omitted from the request.
2. After the session is saved (needs its id), seeds `SessionParticipant` rows in one batch
   (`saveAll`, no N+1): a `JOINED` row for the creator (standalone only), and an `INVITED` row per
   deduped `inviteeIds` entry (excluding the creator's own id).

**`joinSession`** (rewritten branch, after the existing `CANCELLED`/group-membership checks):
resolves fresh on every call — an existing row already `INVITED` **or** `session.autoApprove`
→ `JOINED`; otherwise → `REQUESTED`. The upsert pattern from before this ticket is unchanged.

**New service methods** — `approveParticipant`/`rejectParticipant(sessionId, callerId, userId, [request])`:
shared private `requireRequestedParticipant` helper does `findSessionOrThrow` +
`requireCanModify` (reused as-is) + reject if `CANCELLED` + require an existing `REQUESTED` row
(an `INVITED` row is explicitly not approvable this way — verified via a dedicated test and a
live-server check). Approve → `JOINED`. Reject → `LEFT` + `rejectReason`.

**`getSessionParticipants`** extended: new `callerId`/`status` params. `status` omitted → `JOINED`,
public. Any other status → gated via `requireCanModify`.

**New endpoints:**
```
POST /api/sessions/{sessionId}/participants/{userId}/approve
POST /api/sessions/{sessionId}/participants/{userId}/reject   (optional body: {"reason": "..."})
```
`GET /api/sessions/{sessionId}/participants` gained `?status=` and now requires auth
(`@AuthenticationPrincipal`) — it always did per `SecurityConfig`'s catch-all, this just uses the
identity that was already guaranteed present; also added the `@PreAuthorize("hasRole('USER')")`
this endpoint was previously missing, for consistency with the rest of the controller.

**DTOs:** `CreateSessionRequest` gains `autoApprove`/`inviteeIds`. `UpdateSessionRequest` gains
`autoApprove`. `SessionResponse` gains `autoApprove`. `SessionParticipantResponse` gains
`rejectReason`. New `RejectParticipantRequest` (`reason: String @Size(max=500)`, nullable).

**Tests** — Spock cases for: creator auto-join (standalone yes, group-linked no), invitee seeding
(dedupe + self-exclusion), `joinSession`'s four branches (`autoApprove=true` instant-join and
LEFT→JOINED upsert, `autoApprove=false` → `REQUESTED`, `INVITED` row bypasses regardless of
`autoApprove`), `getSessionParticipants` default/gating, `approveParticipant`/`rejectParticipant`
happy paths, rejecting a non-`REQUESTED` row (including an `INVITED` one), rejecting a
`CANCELLED` session, and gating parity with `cancelSession`/`updateSession`.

## Verification

- `:modules:session:session-impl:test` — all pass (3 pre-existing tests updated: two `joinSession`
  tests needed `autoApprove(true)` set explicitly since the entity default is now `false`; the
  `getSessionParticipants` test needed the new `callerId`/`status` params).
- `:server:test` — 38/38 pass.
- Migration applied cleanly against the real dev Postgres; `\d sessions` and a direct row query
  confirmed the 3 pre-existing sessions backfilled to `auto_approve=true`.
- Full manual end-to-end flow against the running server (4 real users, one creator, one
  self-joiner, one invitee, one self-joiner-later-rejected):
  - Session created with `autoApprove=false` + one invitee → `participantCount=1` immediately
    (creator auto-joined).
  - Non-invited joiner and a second non-invited user both land at `REQUESTED` on `join`.
  - Invited user's `join` call resolves straight to `JOINED`, bypassing approval.
  - A non-creator querying `?status=REQUESTED` gets rejected; the creator sees both `REQUESTED`
    rows.
  - Approve transitions to `JOINED` (`participantCount` increments); reject transitions to `LEFT`
    with the reason persisted and visible via `?status=LEFT`.
  - Re-approving an already-resolved user, or approving the invitee's `JOINED`-via-bypass row,
    both correctly 400 with "No pending join request for this user".
  - A second session created with `autoApprove=true` confirmed instant-join still works exactly
    as before this ticket — no regression for the opt-in-to-instant-join path.

## Out of scope / follow-ups

- **Client:** the "Invite your friend" search + multi-select, the "Auto approve join request"
  checkbox + confirm warning, and an approval queue UI (`SessionDetailModal`, mirroring the
  Groups page's Members tab). Not filed yet.
- **Not built:** any notification to the invitee, requester, or approver at any stage of this
  flow — matches the group precedent's own (unimplemented) scope.
- **Not built:** re-inviting someone after session creation, or any invitee-list mutation via
  `updateSession` — `inviteeIds` only exists on `CreateSessionRequest`.

---

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
`modules/session/docs/MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md` for why. Approval queue reuses `GET
.../participants?status=REQUESTED` rather than a new dedicated route. Added beyond the original
sketch: the session creator is now auto-added as a `JOINED` participant at creation (standalone
only), and reject carries an optional reason (`RejectParticipantRequest.reason`). `autoApprove` is
optional (not mandatory like SESSION-5's `capacity`/`feeType`) and backfills existing sessions to
`true` to preserve their pre-ticket instant-join behavior. Full writeup:
`modules/session/docs/MVP/SESSION-6_JOIN_APPROVAL_AND_INVITES.md`.
