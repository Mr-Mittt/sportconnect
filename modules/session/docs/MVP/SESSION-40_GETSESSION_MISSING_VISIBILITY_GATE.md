# SESSION-40 · `GET /api/sessions/{sessionId}` has no visibility gate at all

**Status:** `IN PROGRESS`
**Type:** Bug / security gap
**Depends on:** none
**Filed:** 2026-09-21, found while scoping SESSION-37/SESSION-39 (a question about whether `Session`
has any public/private visibility concept surfaced this). Unrelated to either ticket's actual scope
— filed separately per CLAUDE.md's "file the moment it comes out" rule rather than left as a prose
note.

## The gap

`SessionServiceImpl.getSession(sessionId, callerId)`:

```java
public SessionResponse getSession(Long sessionId, UUID callerId) {
    return toResponse(findSessionOrThrow(sessionId), callerId);
}
```

No membership/participant/visibility check at all. Any authenticated `ROLE_USER` can read the full
details of **any** session by id — including a session belonging to a **private** group they are not
a member of. `callerId` is only used to resolve the caller's own `callerParticipation` in the
response (SESSION-9), never to gate access.

This is inconsistent with every other list/detail path in this module:
- `getGroupSessions` (list) **does** enforce private-group visibility, via `groupService
  .getGroup(groupId, currentUserId)` — the same gate `GET /api/groups/{groupId}` itself uses.
- `SessionGate` (`ResourceGate<Session>`, SESSION-10) **does** gate the session's comment thread and
  its own like — participant status, or group membership for a group-linked session.
- The single-item `getSession` read, sitting between those two, has **neither** check.

This is structurally the same class of gap `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` (§5,
§9) was written to catch and fix for `post-impl` (A14 found and fixed 7 single-item paths with the
identical "list endpoint gates, single-item endpoint doesn't" shape) — just never audited for
`session-impl`'s own basic `GET`, likely because `SessionGate` already existing for comments made it
easy to assume session-level visibility was handled somewhere. It isn't.

## Scope (to be confirmed/refined at pickup — not fully designed here)

- Add a visibility check to `getSession` before returning. Likely shape, following
  `SessionGate.isVisibleTo`'s existing rule (participant, or group member for a group-linked
  session) — but confirm at pickup whether the single-item detail view should use the *same* rule as
  the comment thread, or something looser (e.g. any group member regardless of participant status,
  since viewing basic session details is a lower bar than commenting). Not decided here.
- Apply the **availability vs. visibility** two-question shape from the ADR (§1): availability first
  (`SessionGate.isAvailable` already checks the parent group's active status, B18-equivalent),
  visibility second.
- **Standalone sessions:** confirm they should stay fully open to any `ROLE_USER` (matching
  `SessionGate`'s own "standalone sessions are strictly participant-only for comments, but the
  session data itself has always been openly readable" — actually confirm this assumption too, don't
  assume standalone should be unrestricted just because it is today).

## Consumer census (do at pickup, CLAUDE.md § API Change Discipline)

Adding a check to an existing, previously-unrestricted endpoint is a real behavior change — grep
every backend caller of `SessionService.getSession` and every client caller of
`GET /api/sessions/{sessionId}` before implementing; a caller that currently works for a non-member
viewing a group-linked session's details would start getting `403`s.

## Out of scope

Any change to `SessionGate`'s existing, already-correct gate (comments/likes) — this ticket doesn't
touch it. (`getGroupSessions` was originally out of scope too — see the scope change below, which
brings it in.)

## Scope change (2026-09-22, at pickup — user decision)

Two changes to the original scope, both confirmed with the user before implementation:

1. **`getSession`'s visibility formula, fully specified** (the original scope explicitly left this
   undecided): `isPublic OR` a type-specific relationship — for a standalone session, the caller
   holds a `JOINED`/`REQUESTED`/`INVITED` participant row; for a group-linked session, the caller is
   a member of the parent group. Unlike `SessionGate`'s rule (participant, or group member — no
   `isPublic` concept at all), this adds the `isPublic` escape hatch on top, since viewing basic
   session details is a lower bar than commenting. Implemented as a **new `SessionDetailGate
   implements ResourceGate<Session>`** (user decision — kept separate from `SessionGate` rather than
   widening it, since the two features have genuinely different rules for the same entity).
   Availability check included (parent group still active), same rule as `SessionGate.isAvailable`.
2. **`getGroupSessions` brought into scope** (originally explicitly out of scope) — user decision:
   tighten it to **member-only regardless of the group's own public/private flag**, closing a real
   gap the original ticket text didn't call out: a *public* group's sessions were listable by any
   authenticated user, not just members. Widened from the previous `GroupService.getGroup(groupId,
   currentUserId)` delegation (which only gated a *private* group) to `GroupService.isGroupMember`,
   thrown as `BadRequestException` uniformly for a non-member/non-existent/inactive group (same
   convention `joinSession`'s own group-membership check already uses in this class — and
   deliberately doesn't distinguish "doesn't exist" from "exists but you can't see it", unlike
   `getGroup`, since that's arguably the safer choice).

Today, since every standalone session has `isPublic = true` and every group-linked session has
`isPublic = false` (`Session.isPublic`'s own Javadoc — set from `groupId == null` at creation), (1)'s
formula currently collapses to "standalone stays fully open" (no regression) and "group-linked
requires membership" (the actual fix) — the `isPublic` branch and the standalone participant-status
clause are both currently dormant, forward-compatible pieces that start doing real work only once a
private standalone session or a public group-linked session can actually exist.

## Consumer census (done at pickup, CLAUDE.md § API Change Discipline)

- **Backend:** only `SessionController` calls `SessionService.getSession`/`getGroupSessions` — no
  other module.
- **Client `useSession.ts`** (→ `useSessionDetailModalData` → every page's `SessionDetailModal`):
  the only real flow needing unrestricted access is Discover (standalone, `isPublic=true` today) —
  compatible as-is. No client flow depends on a non-member viewing a *private* group's session
  details — sessionIds only ever reach the client via `getGroupSessions`, already gated for private
  groups.
- **Client `useGroupSessions`/`useGroupSessionsForGroups`:** only the fan-out variant
  (`useGroupSessionsForGroups`) is actually called anywhere, always scoped to "every group the
  caller belongs to" (zero call sites pass an arbitrary/non-member groupId) — compatible as-is, the
  newly-tightened public-group-non-member case has no real caller today.
- **MSW handlers** (`/api/sessions/:sessionId`, `/api/sessions/group/:groupId`): static mocks that
  never simulated the privacy gate to begin with — compatible as-is.
- **Backend tests:** existing Spock coverage for both methods updated; new `SessionDetailGateSpec`
  (gate logic in isolation) and new `SessionAccessGateIntegrationTest` (13 real `MockMvc`+H2 cases)
  added, per CLAUDE.md's authorization-boundary IT rule.

## Implementation summary (2026-09-22)

**`SessionDetailGate`** (`session-impl/access/`) — new `ResourceGate<Session>`: `isAvailable`
duplicates `SessionGate.isAvailable`'s two-line check (deliberately not shared — this module's
existing gates don't share logic with each other either); `isVisibleTo` implements the formula
above. **`SessionServiceImpl.getSession`** now resolves the session via `sessionRepository.findById`
then calls `sessionDetailGate.require(...)` before mapping to a response (previously
`findSessionOrThrow` with no gate at all) — 404 (`NotFoundException`, not the previous
`ResourceNotFoundException`, though both map to the same HTTP status) if unavailable, 403
(`ForbiddenException`) if available but not visible. **`SessionServiceImpl.getGroupSessions`**
replaced its `groupService.getGroup(...)` call with an explicit `groupService.isGroupMember(...)`
check.

**Tests:** `SessionDetailGateSpec` (new, 11 cases mirroring `SessionGateSpec`'s style) +
`SessionServiceImplSpec` (existing `getSession`/`getGroupSessions` cases updated for the new gate
delegation, 2 new cases each for the gate-denial/membership-denial paths) +
`SessionAccessGateIntegrationTest` (new, 13 real `MockMvc`+H2 cases covering both endpoints' full
matrix — standalone public/private × participant status, group-linked public/private × membership,
inactive-group availability, nonexistent session, and `getGroupSessions`' public/private ×
member/non-member). Green: `session-impl` full Spock suite + new IT class in isolation (13 tests) +
full `:server:test`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
