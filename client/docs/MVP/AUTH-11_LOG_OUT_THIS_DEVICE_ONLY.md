# AUTH-11 · "Log out" signs out this device only; "Log out everywhere" for the rest

**Status:** `TODO` · **Type:** Feature · **Depends on:** backend **A15** (auth backlog) — per-session logout. Do not start before A15 ships.
**Filed:** 2026-10-10, client half of A15.

## What

Today the logout call revokes every session of the user. Once A15 ships, plain logout affects only the current session, so the client needs to:

- keep the existing logout flow working against the A15 contract (clear in-memory token, call logout, redirect);
- add a "Log out everywhere" action (endpoint per A15's final contract);
- if A15 includes a device list, show sessions ("Chrome on Windows, last active …") with a per-session revoke.

## Notes

- Every new user-visible string gets en and vi copy in this ticket; new error codes go in `errors:codes` (I18N-4 census row if a form can show a server error).
- Check `client/e2e/mocks` MSW handlers and the logout tests for the contract change.
