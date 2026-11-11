# CLIENT-NOTIF-6 · The live notification socket sends the token it had at mount, so it is refused once that token expires

**Status:** `TODO`
**Type:** Bug Fix · **Depends on:** none (related: CLIENT-NOTIF-1, reconnect UX) ·
**Filed:** 2026-11-11, found live: the server logged "Missing or invalid token on STOMP CONNECT"
with "Jwt expired" while REST calls worked.

## What's wrong

`useNotificationLiveSocket` reads `accessToken` once at mount and puts it in `connectHeaders`;
the effect depends only on `queryClient`. REST reads the store on every request and refreshes on a
401, so after the 5-minute Keycloak token the socket still holds the old one. `@stomp/stompjs` v7
reconnects by default (5000 ms), so it keeps resending the expired token. The file comment says
there is no auto-reconnect, which is wrong.

## Fix direction

Read the current token at connect time (`beforeConnect`), set `reconnectDelay` deliberately, and
fix the comment. Decide at pickup what happens when the refresh is itself failing (stop vs back
off). Backend wording ("Missing or invalid token") is not changed here.

**Out of scope:** the reconnect/poll-fallback UX (CLIENT-NOTIF-1); backend error text.

**Tests:** unit test that a reconnect after a token refresh sends the new token.
