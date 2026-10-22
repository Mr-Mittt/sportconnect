# NTF-6 · Disconnect a user's open STOMP sockets when their account is deactivated

**Status:** `TODO` · **Type:** Hardening, low priority · **Depends on:** none (A28 added the CONNECT-time check)

**Filed:** 2026-10-16, from A28 (closing A20's STOMP half). A28 made `StompAuthChannelInterceptor` run the A25 active gate on `CONNECT`, so a deactivated or unprovisioned user can no longer open a socket. The check runs only at `CONNECT`, so a socket that is already open when the account is deactivated stays open until the client reconnects (and is then refused).

## What

When `UserService` deactivates an account (`deleteUser`, `deactivateOwnAccount`), close that user's open STOMP sessions, or stop pushing to them. The socket only carries the user's own notifications (`/user/queue/notifications`), so the exposure is small; the point is to match the rule in CLAUDE.md that a deactivated user has no further interaction. To decide at pickup: a deactivation event on the existing RabbitMQ exchange that the notification module consumes and answers by disconnecting the user's sessions (cross-domain, no direct call into `user-impl`), versus checking the gate before each push in `NotificationPushService`.

## Out of scope

Chat's WebSocket (the chat service keeps its accepted 5-minute window, see A20 and CHAT-17); the REST gate (A25).
