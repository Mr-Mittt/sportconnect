# A18 · Active-session list and revoke-one

**Status:** `TODO` · **Type:** Feature · **Depends on:** **A15** (the `sessionId` this lists and revokes)

**Filed:** 2026-10-11, split out of **A15** at pickup.

`GET /api/auth/sessions` returns the caller's active sessions (id, created, last used, and the display-only `User-Agent` and IP stored on the session row at login; never used as a security check) and `DELETE /api/auth/sessions/{id}` revokes one of the caller's own (404 for another user's id, same as for an unknown one). Marks which entry is the current session. Client: **AUTH-12**.

## Out of scope

Concurrent-session limits; suspicious-login alerts; geo-lookup of the IP.
