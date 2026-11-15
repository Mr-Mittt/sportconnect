# SESSION-GL-64 · Search the people who can see a session's thread (for tagging)

**Status:** `TODO`
**Type:** New Feature
**Depends on:** none (the thread and its gate exist: SESSION-10, SESSION-21)
**Filed:** 2026-11-15, owner request after CLIENT-GL-39: the `@` picker should also work in normal comments, like tagging people, and it should offer everyone who can see the thread. The participants endpoint lists only `JOINED` people to an ordinary caller, so the client cannot build that list alone.

A new read endpoint, `GET /api/sessions/{sessionId}/thread-people?q=&size=`, returns the people who can see the session's discussion thread, narrowed by a name search as the user types and capped in size (default 10, ceiling 20). Who counts: the `JOINED`, `REQUESTED` and `INVITED` participants, plus, for a group session, the group's members (the same people `SessionGate` lets read the thread). Each item is `userId`, `fullName`, `avatarUrl` and nothing else (no email, no status). Used by CLIENT-GL-50 (the tag picker in the comment box); entry point is an authenticated call from the session detail modal.

Rules: the caller has to pass the same gate as the thread (`SessionGate`: available, then visible; 404 `SESSION_NOT_FOUND`, 403 `SESSION_FORBIDDEN`); a deactivated caller is refused by the JWT filter as on every authenticated path (no extra check, per CLAUDE.md); an empty `q` returns the first page ordered by name, a `q` matches the start of any word of the full name, case and accent insensitive; deactivated people are not returned; a person who is in the list twice (a participant and a group member) appears once; the caller may appear. Batch the user lookups (`getUserSummariesByIds`), never one call per row. A group's member list can be large, so the search runs in the database or in a batch of ids, never by loading the whole group into memory (decide at pickup; check the `group-api` and `user-api` for a name search).

Cross-domain: only `-api` interfaces (`group-api` for members, `user-api` for names); ids only. Error codes: none new (reuses the gate's). Client-visible enum: none.

**Out of scope:** validating the tags inside a comment (the server keeps storing the text as it is); notifying a tagged person (NOTIF-12); paging beyond the cap.

**Tests:** Spock for the merge, the de-duplication, the name matching and the cap; an integration test in `server/src/test/java/com/sportconnect/integration/` through the real endpoint: a standalone session (joined, requested and invited appear), a group session (members appear), a stranger gets 403, a missing session 404, a deactivated user is not listed.
