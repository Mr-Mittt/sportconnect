# AUTH-11 · "Log out" signs out this device only; "Log out everywhere" for the rest

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend **A15** (auth backlog) — per-session logout. Do not start before A15 ships.
**Filed:** 2026-10-10, client half of A15.

## What

Today the logout call revokes every session of the user. Once A15 ships, plain logout affects only the current session, so the client needs to:

- keep the existing logout flow working against the A15 contract (clear in-memory token, call logout, redirect);
- add a "Log out everywhere" action calling the new `POST /api/auth/logout-all` (authenticated, no body, idempotent; scope decision of 2026-10-11, A15). It clears the in-memory token and redirects exactly like plain logout; the server also clears the refresh cookie;
- the device list is **not** part of A15 (split out as backend A18 and client **AUTH-12**); this ticket covers plain logout and "Log out everywhere" only.

## Notes

- Every new user-visible string gets en and vi copy in this ticket; new error codes go in `errors:codes` (I18N-4 census row if a form can show a server error).
- Check `client/e2e/mocks` MSW handlers and the logout tests for the contract change.
