# AUTH-12 · Active sessions list with per-session sign-out

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend **A18** (auth backlog), which depends on **A15**. Do not start before A18 ships.
**Filed:** 2026-10-11, the device-list half split out of **AUTH-11** when A15 dropped it.

Show the caller's sessions ("Chrome on Windows, last active …", current one marked) and a sign-out action per other session, against A18's `GET /api/auth/sessions` and `DELETE /api/auth/sessions/{id}`. Every new user-visible string gets en and vi copy in this ticket; new error codes go in `errors:codes`.
