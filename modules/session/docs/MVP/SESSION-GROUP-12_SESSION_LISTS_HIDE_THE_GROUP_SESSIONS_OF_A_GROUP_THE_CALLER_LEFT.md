# SESSION-GROUP-12 · The session lists hide the group sessions of a group the caller has left

**Status:** `TODO`
**Type:** Bug Fix · **Depends on:** SESSION-GROUP-1 (group sessions and their access rule), `GroupService` (`group-api`) for the caller's group ids
**Filed:** 2026-11-20, found in use by the owner while testing CLIENT-GROUP-SESSION-1: after leaving a group, a group session the user had joined still shows on the **Upcoming** rail, and opening it answers "You don't have access to this." (the detail gate refuses a non-member with `403 SESSION_GROUP_MEMBER_REQUIRED`). Expected: it is not listed at all.

## Root cause

`GET /sessions/upcoming`, `GET /sessions/requested` and the history lists find a session **only through the caller's own `SessionParticipant` row** (`SessionRepository.findUpcomingSessions`, `findUpcomingSessionsByDate`, `findHistorySessionsByDate`, the native `findHistoryDateCounts`; `getRequestedSessions` reuses `findUpcomingSessions` with `REQUESTED`). Leaving a group removes the `GroupMember` row and leaves every participant row as it was, so the session is still "theirs" to the list queries, while the single-session gate (`SessionDetailGate`, a group session needs a group member) correctly refuses it. The list and the gate disagree.

## Expected

A group session (`sessions.group_id` not null) appears in the caller's Upcoming, Requested and History lists (and the history date counts) **only while the caller is a member of that group, and the group is active** (the gate's rule). A standalone session is unchanged. Rejoining the group makes the sessions listed again (the participant rows were never touched).

## How (decide at pickup, `/workon` Phase 1)

Add `AND (s.groupId IS NULL OR s.groupId IN :groupIds)` to the four queries, with `groupIds` the caller's active group ids from `group-api` (one batch call per request, never per row; an empty list needs a sentinel such as `-1`, JPQL `IN ()` is not portable). `GroupService.getGroupIdsForMember(UUID)` exists but may include inactive groups, while the gate also requires an active group: either filter it, or add an active-only batch method to `group-api` so the list and the gate use one rule. Page totals stay right because the filter is in the query (a post-filter in the service would break paging).

Rejected: flipping the participant rows to `LEFT` when someone leaves the group (a data change, a cross-module hook, and it misses a removed or kicked member and a group deleted later).

## Tests

Spock for the id lookup and the empty sentinel; real ITs in `server/src/test/java/com/sportconnect/integration/` (this is a visibility rule): a member sees the group session in all four lists, after leaving they do not (list and counts), after rejoining they do again, a standalone session is unaffected, an inactive group's sessions are hidden. Mutation check for each query.

## Consumer census (to re-run at pickup)

- Endpoints: `GET /api/sessions/upcoming`, `/requested`, `/history` (response shape unchanged; fewer rows). Client: `useUpcomingSessions`, `useRequestedSessions`, the history hooks, the e2e MSW handlers (`client/e2e/mocks/handlers/sessions.ts`).
- `GroupService` (`group-api`): a new method means every implementation and every Spock `Mock(GroupService)` of `SessionServiceImpl` is touched.
- Client: **done in CLIENT-GROUP-SESSION-1** (2026-11-20): leaving a group drops the cached session detail and refreshes the session lists (`useLeaveGroup`), and the detail modal shows only the no-access message when the detail load answers 403 or 404 (no stale session information). Nothing left to do on the client for this ticket.

**Out of scope:** the notification a session creation sent before the user left (it stays in the list; opening it shows the no-access message, as intended); a session discover list (already member-gated for group sessions).
