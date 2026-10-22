# A18 · Active-session list and revoke-one

**Status:** `SUPERSEDED` (2026-10-16, closed by A28; see the note at the end) · **Type:** Feature · **Depends on:** **A15** (the `sessionId` this lists and revokes)

**Filed:** 2026-10-11, split out of **A15** at pickup.

`GET /api/auth/sessions` returns the caller's active sessions (id, created, last used, and the display-only `User-Agent` and IP stored on the session row at login; never used as a security check) and `DELETE /api/auth/sessions/{id}` revokes one of the caller's own (404 for another user's id, same as for an unknown one). Marks which entry is the current session. Client: **AUTH-12**.

## Out of scope

Concurrent-session limits; suspicious-login alerts; geo-lookup of the IP.

---

**Closed by A28 (2026-10-16): superseded by Keycloak.** There is no `sessionId` or session table in this app any more (A15 is closed), so there is nothing to list or revoke here. If an active-sessions screen is wanted later it would read Keycloak's sessions (the account API) and is a new ticket; client **AUTH-12** is superseded with this one.
