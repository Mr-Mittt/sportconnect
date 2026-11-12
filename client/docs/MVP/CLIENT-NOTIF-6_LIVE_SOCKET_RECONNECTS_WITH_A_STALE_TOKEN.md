# CLIENT-NOTIF-6 · The live notification socket sends the token it had at mount, so it is refused once that token expires

**Status:** `DONE` (2026-11-12)
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

## Scope change 2026-11-12 (user decision, at pickup)

Why: the chat WebSocket (`useChatConversation`, token in `?token=` from `buildChatWebSocketUrl`) reads
the store on every connect, so it is not frozen at mount, but it never refreshes: an idle open chat
whose socket drops reconnects with an expired token, the Go verifier refuses the handshake (the browser
hides the 401, `onclose` only), and the 1 s→30 s backoff loops until some REST call refreshes. Same
class of bug, same fix, so it is folded in instead of filed separately.

**Agreed design (both sockets):**
1. Every connect attempt, including reconnects, reads the token from the auth store.
2. If the connection is refused or drops, refresh once through a single shared `refreshSession()`
   exported from `apiClient.ts` (the same in-flight `refreshPromise` the 401 handler uses), then
   reconnect with the new token. Notifications: refresh on a rejected STOMP CONNECT. Chat: refresh in
   `onclose` before the next `connect(true)`.
3. If the refresh fails, stop reconnecting. Definite refusal (4xx) ends the session as REST does;
   5xx / no response keeps the session and just stops the socket until the next mount.

**Hard requirement (worst case): several callers asking for a refresh at once must never sign the
user out.** Measures: one shared in-flight refresh for REST, notifications and chat; and a guard that a
failed refresh clears the session only if the store still holds the token that was rejected, so a
refresh that lost a race to another successful one cannot end a session that was just renewed. Realm
facts: refresh-token rotation is off (`revokeRefreshToken` off, A26/A28), so concurrent refreshes would
succeed anyway; the guard keeps it safe if rotation is ever switched on.

Also: correct the stale "backend rotates the refresh token on every use" comment in `apiClient.ts`
(auth `AuthController` Javadoc has the same wording; backend, noted, not changed here).

**Added to scope:** `useChatConversation` reconnect refresh; shared `refreshSession()`; clear-session
guard. **Added tests:** reconnect sends the new token (both sockets); rejected CONNECT / closed chat
socket triggers exactly one refresh; failed refresh stops reconnecting; REST + notification + chat
refreshing together make one `/auth/refresh` call; a refresh that fails after another one renewed the
store does not clear the session.

## Implementation summary (2026-11-12)

**Approved design (restated).** Both realtime sockets read the access token from the auth store on every
connect attempt. When a connection is refused or drops, they refresh once through a single shared
`refreshSession()` and reconnect with the new token. A definite refusal (4xx) ends the session and stops
the socket; a 5xx or no response keeps the session and keeps retrying with backoff. Several callers
asking at once must never sign the user out.

**What was built.**
- `apiClient.ts`: exported `refreshSession()` (one shared in-flight `/auth/refresh`, used by the 401
  handler and both sockets) and `isDefiniteRefusal(error)`. Clearing the session moved into the refresh
  itself and is guarded: it happens only on a 4xx **and** only if the store still holds the token the
  refresh started from, so a refusal that arrives after anything renewed the session is ignored. The
  stale "backend rotates the refresh token on every use" comment is replaced (rotation is off:
  `revokeRefreshToken` off, auth A26/A28).
- `useNotificationLiveSocket.ts`: async `beforeConnect` writes the current store token into
  `connectHeaders`; `onStompError` marks the next attempt to refresh first; a 4xx stops the client
  (`deactivate()`), anything else retries. `reconnectDelay` 5000 ms, exponential up to 30000 ms, set
  explicitly; the wrong "no auto-reconnect" comment is rewritten.
- `useChatConversation.ts`: a socket that closes before it ever opened (the browser hides a refused
  handshake) refreshes through `refreshSession()` before the next `connect(true)`; a 4xx sets the status
  to `closed` and stops; anything else keeps the existing 1 s to 30 s backoff. A socket that had opened
  and then dropped does not refresh.

**Diverged from the plan?** One refinement, agreed before building: a refresh that fails with 5xx or no
response keeps retrying instead of stopping the socket (a short offline blip must not kill live pings and
chat until a reload). 4xx stops it, as planned.

**Not changed (noted).** `AuthController` Javadoc (lines ~96 and ~102) still says the old refresh token
is "revoked server-side"; that is backend wording and untrue for this realm. Left for an auth ticket.

**Tests.** `apiClient.test.ts` (shared refresh, REST + notification + chat asking together make one
call, refusal ends the session once, a late refusal after a renewal does not, 5xx and no response keep
it, `isDefiniteRefusal`); `useNotificationLiveSocket.test.tsx` (reconnect delay, new token on reconnect,
no refresh when nothing was refused, one refresh after a refused CONNECT, 4xx stops, 5xx retries);
`useChatConversation.test.tsx` (no refresh after an opened socket drops, refresh then new token after a
close-before-open, 4xx stops, 5xx retries). 90 Vitest tests green across `apiClient`, the notification
hook and `src/features/chat`; `tsc -b` and ESLint on the changed files clean.

**E2E.** Scoped run, not the full suite: `e2e` project, 11 passed (`notification-bell`, `direct-chat`,
`group-chat`, `chat-errors`, `friends-journey`), `--workers=2`. No spec added or changed, so
`E2E_OVERVIEW.md` is unchanged. Full `pnpm e2e` not run here (token-saving rule: scoped subset only).

**Visual-regression expectation.** No baselined surface touched, so no baseline change is expected; a
failing `visual-regression` run would be the Windows noise floor, not a regression. Not run.

**i18n.** No user-visible text added or changed: no locale keys, no I18N-4 census row.
