# SESSION-40 · `GET /api/sessions/{sessionId}` has no visibility gate at all

**Status:** `TODO`
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

Any change to `getGroupSessions`'s or `SessionGate`'s existing, already-correct gates — this ticket
is specifically about the ungated single-item `getSession` path.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
