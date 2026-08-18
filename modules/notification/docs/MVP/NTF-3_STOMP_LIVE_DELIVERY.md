# NTF-3 · STOMP-over-RabbitMQ live delivery to the client

**Status:** DONE
**Module:** `modules/notification`
**Related:** `documentation/md/vision/NOTIFICATION_MODULE_VISION.md` (hybrid-delivery decision),
`PROGRESS.md` §2.7 (mobile push confirmation), NTF-2
(`modules/notification/docs/MVP/NTF-2_RABBITMQ_CONSUMER.md`)

## Design (approved plan, restated)

Mid-ticket, the user raised a real architecture question: does STOMP-over-WebSocket make sense
given a future mobile app is planned? Investigation (web research + codebase check) confirmed iOS
does not support WebSocket connections in the background at all — a persistent socket only works
while the app is foregrounded — which is structurally the same gap Apple built APNs and Google
built FCM to solve. `PROGRESS.md` already earmarked Firebase Cloud Messaging for the future mobile
phase; `client/docs/BACKLOG_MVP.md`'s CLIENT-NOTIF-1 already scoped push notifications out of the
web bell ticket, deferring to that same phase. STOMP and FCM solve different problems (live in-app
update for a connected session vs. OS-delivered background/closed-app push) — most production
systems that need both run both, not one instead of the other.

**Decision: hybrid.** NTF-3 proceeds as STOMP-over-RabbitMQ, explicitly scoped to *web, in-app,
connected-session* delivery — not a mobile solution and not meant to become one. FCM is deferred to
the mobile phase as a separate, not-yet-scoped ticket. Documented in the vision doc's Client
delivery bullet, `PROGRESS.md` §2.7, and this ticket's own Delta note in `BACKLOG_MVP.md`, so a
future reader doesn't assume STOMP will "just work" for mobile later.

Confirmed implementation decisions:
- **Auth:** JWT in the STOMP `CONNECT` frame's `Authorization` header (STOMP frames support custom
  headers, unlike the raw WS handshake — no query-param workaround needed, unlike
  `services/chat`'s WS route).
- **`isActive` check:** deliberately not added — inherits the same known gap as the REST JWT filter
  (CLAUDE.md's account-lifecycle gaps, `user-impl`'s U12). Accepted, documented risk, not an
  oversight.
- **Client scope:** backend + a minimal client subscription (enough to prove live delivery), not
  the full bell/dropdown UI — that stays CLIENT-NOTIF-1's job.
- **Payload:** a lightweight ping (`notificationId`, `unreadCount`), not the full
  `NotificationResponse` — the client re-fetches full content via the existing REST endpoints when
  it needs to render something.
- **Trigger + fanout:** pushed only after the enclosing DB transaction commits, fanned out to every
  session the recipient has open (multi-tab/multi-device) via Spring's user-destination convention.

## What was built

**`modules/notification/notification-api`**: `NotificationRecordResult(Long notificationId, long
unreadCount)` — `NotificationService.recordEvent`'s return type changed from `void` to this, so a
caller can trigger a live-delivery push without a second query.

**`modules/notification/notification-impl`**:
- `NotificationServiceImpl.recordEvent` — returns the upserted row's id and the recipient's fresh
  unread count (reuses `countByRecipientUserIdAndIsReadFalse`, no new repository method).
- `consumer/SessionEventProcessor` — after each `recordEvent` call, publishes a
  `NotificationLiveUpdateEvent` via `ApplicationEventPublisher`.
- New `push/` package: `NotificationLiveUpdateEvent`, `NotificationLiveUpdateMessage` (the STOMP
  wire payload), `NotificationPushService` (wraps `SimpMessagingTemplate.convertAndSendToUser`),
  `NotificationLiveUpdateListener` (`@TransactionalEventListener(phase = AFTER_COMMIT)` — see Key
  decisions below for why this and not a direct call).
- New `config/` classes: `NotificationStompConfig` (`@EnableWebSocketMessageBroker`, broker-relay
  to RabbitMQ's STOMP plugin, `/ws` endpoint, no SockJS), `StompAuthChannelInterceptor` (validates
  the JWT via `auth-api`'s `JwtTokenService` — the same interface `JwtAuthenticationFilter` uses
  internally in `auth-impl` — on `CONNECT`, sets the session `Principal` to the user id).
- `build.gradle` — added `auth-api` (JWT validation), `spring-boot-starter-websocket` (already
  present, unused, in `server/build.gradle`, now actually wired here), and
  `io.projectreactor.netty:reactor-netty` (see Key decisions).

**`modules/auth/auth-impl`**: `SecurityConfig` — `/ws/**` added to the public-endpoint list. The
STOMP `CONNECT` frame carries the real auth; the HTTP upgrade request itself must be reachable
unauthenticated (a browser's native WebSocket handshake can't set custom headers).

**`server`**: `application.yml`/`application-prod.yml` — new `app.stomp-relay.host`/`port`
properties, env-overridable (`STOMP_RELAY_HOST`/`STOMP_RELAY_PORT`), defaulting to
`${spring.rabbitmq.host}`/`61613`. Relay login/passcode reuse `spring.rabbitmq.username`/`password`
— RabbitMQ's STOMP plugin shares AMQP's user accounts by default, no new credential needed.

**`infra/docker-compose.dev.yml`**: `rabbitmq_stomp` plugin enabled via a mounted
`infra/rabbitmq/enabled_plugins` file (overrides the `-management` image's baked-in one, which only
lists `rabbitmq_management`), port `61613` exposed.

**Client** (`client/src/features/notifications/`, minimal per confirmed scope):
- `types.ts` — `NotificationLiveUpdate`, 1:1 with the backend payload.
- `useUnreadNotificationCount.ts` — thin TanStack Query hook wrapping the existing
  `GET /api/notifications/unread-count`; exports its query key so the live-socket hook can write
  straight into the cache.
- `useNotificationLiveSocket.ts` — opens a `@stomp/stompjs` connection to `/ws`, sends the
  in-memory access token as the CONNECT frame's `Authorization` header, subscribes to
  `/user/queue/notifications`, and on each ping calls `queryClient.setQueryData` with the fresh
  count directly (no extra round trip — the ping already carries it). No reconnect/backoff logic,
  matching NTF-3's confirmed scope (CLIENT-NOTIF-1 owns that).
- `AppShell.tsx` — wires both hooks; `TopBar.tsx` gets a new optional `unreadCount` prop rendered
  as a small numeric badge on the bell icon — an explicit placeholder CLIENT-NOTIF-1 replaces with
  the real dropdown.
- `vite.config.ts` — new `/ws` proxy entry (`ws: true`), same pattern as `/api/chat`'s.
- New dependency: `@stomp/stompjs`.

**Docs**: `documentation/md/vision/NOTIFICATION_MODULE_VISION.md` (hybrid-delivery Decisions bullet
+ Open Questions entry for the future FCM ticket), `PROGRESS.md` §2.7 (push-notification decision
line, cross-referenced from the Phase 4-5 mobile block), this ticket's Delta note in
`modules/notification/docs/BACKLOG_MVP.md`.

## Key decisions / bugs found during implementation

- **`AFTER_COMMIT`, not a direct call from `recordEvent`.** `SessionEventProcessor.process()` wraps
  the dedup-marker insert *and* every `recordEvent` call for a fan-out event in one
  `@Transactional` method — pushing before that commits could race a client's REST re-fetch against
  not-yet-visible data, or fire for a recipient whose row later rolls back if a later recipient in
  the same loop throws. This is a different concern from the vision doc's earlier, since-superseded
  discussion of `@TransactionalEventListener(AFTER_COMMIT)` as an *outbox durability* mechanism —
  documented explicitly in the vision doc so the two uses of the same Spring mechanism aren't
  conflated.
- **`reactor-netty` is required, not optional, for the STOMP broker relay** —
  `StompBrokerRelayMessageHandler` uses Reactor Netty's TCP client to reach the broker, and it
  doesn't come transitively from `spring-boot-starter-websocket`. Missing it doesn't just break
  NTF-3's own feature — it throws `IllegalStateException: No compatible version of Reactor Netty` at
  `ApplicationContext` startup, which broke **every** `@SpringBootTest` in the server module
  (confirmed: `SessionEventsConsumerIntegrationTest`, unrelated to this ticket, failed until this
  was added). Found by running the full `:server:test` suite, not just the new test.
- **Real IT test container gotchas (Windows/Docker Desktop), all worked around in
  `RabbitMqStompTestContainerBase`, not worth carrying into real dev infra:**
  - Testcontainers' file-mounting (`withClasspathResourceMapping`/`withCopyFileToContainer`) to
    enable the `rabbitmq_stomp` plugin was unreliable on this host — the bind-mount variant never
    opened its ports at all, and the copy variant hit an unrelated, pre-existing classpath conflict
    (`commons-compress:1.28.0` needing a newer `commons-lang3` API than the version this project
    pins). Fixed by enabling the plugin live via `execInContainer("rabbitmq-plugins", "enable",
    "rabbitmq_stomp")` after container start instead — RabbitMQ hot-loads a plugin without a
    restart, so no file involved at all.
  - The default host-port-probe wait strategy was flaky against Docker Desktop's network proxy on
    this host even though the container was verifiably listening — switched to
    `Wait.forLogMessage(".*Server startup complete.*", 1)` (reads the container's own stdout via
    the Docker API instead of a host-side socket probe).
  - `StompBrokerRelayMessageHandler` is a `SmartLifecycle` bean — its own connection to the broker
    finishes asynchronously *after* context refresh returns, not before. A test client connecting
    immediately can get a STOMP `ERROR` frame ("Broker not available.") even though everything is
    correctly configured. Fixed by polling `stompBrokerRelayMessageHandler.isBrokerAvailable()`
    before connecting the test's own STOMP client.
- **Client-side `@stomp/stompjs` mock in tests must be a `function`, not an arrow function** — `new
  Client(...)` requires a constructible mock; `vi.fn().mockImplementation(() => {...})` throws `is
  not a constructor`.
- **`App.test.tsx`'s existing `apiClient.get` mocks needed a new branch.** Three of its test-specific
  mocks (Home Feed, Groups page, "selecting a group") have a catch-all fallback shaped for a
  different endpoint (a `Page<T>` object) rather than throwing on an unmocked URL. Since `AppShell`
  now unconditionally calls `GET /notifications/unread-count`
  (`useUnreadNotificationCount`, mounted the same way `useSportCatalog`'s `GET /sports` already is),
  the fallback's `Page` object was rendered straight into `TopBar`'s badge, crashing with "Objects
  are not valid as a React child." Fixed by adding an explicit `/notifications/unread-count` branch
  to each of the three mocks, matching this file's own established convention (its own comment:
  "every apiClient.get mock in this file needs a branch for it, or the catch-all fallback below...
  breaks [it]").

## Out of scope

- FCM/mobile push — separate, future, not-yet-scoped ticket (Phase 4-5 mobile phase). See the
  vision doc's Open Questions for what that ticket needs to cover (token-registration subsystem,
  service-account credential management, whether to also extend to web).
- The full bell/dropdown UI, reconnect/backoff on disconnect, poll fallback — CLIENT-NOTIF-1.
- Multi-instance `:server` fanout — `convertAndSendToUser` works out of the box at current
  (single-instance) scale; scaling `:server` horizontally would need
  `setUserDestinationBroadcast`/a shared `SimpUserRegistry` strategy to reach a session connected to
  a different instance's relay client. Documented as a known gap, not solved here, matching how
  `services/chat/CLAUDE.md` documents its own known gaps.

## Verification

- `./gradlew :modules:notification:notification-impl:test` — new Spock coverage: `recordEvent`'s
  new return shape, `SessionEventProcessor` publishing one `NotificationLiveUpdateEvent` per
  resolved recipient, `NotificationPushService`, `NotificationLiveUpdateListener`,
  `StompAuthChannelInterceptor` (accepts a valid token, rejects missing/invalid/expired ones, and
  passes non-CONNECT frames through untouched). All pass.
- `./gradlew :server:test` — full suite (91 tests), including a new
  `NotificationStompIntegrationTest` (real `@SpringBootTest(webEnvironment = RANDOM_PORT)`, real
  RabbitMQ+STOMP via `RabbitMqStompTestContainerBase`, a real `@stomp/stompjs`-equivalent Java STOMP
  client) proving a consumed session event produces a real STOMP frame on the recipient's subscribed
  destination end to end. 0 failures.
- `pnpm exec vitest run` (client) — full suite, 847 tests across 125 files, 0 failures (includes the
  3 `App.test.tsx` fixes above).
- `pnpm exec tsc -b` and `pnpm exec eslint` on all changed/new client files — clean.
- **Live verification against the actual dev stack** (not just the isolated Testcontainers
  environment) — `infra/docker-compose.dev.yml`'s RabbitMQ recreated with the `rabbitmq_stomp`
  plugin, confirmed via `rabbitmq-plugins list -e`. Registered a real user against a running
  `:server:bootRun`, confirmed `GET /notifications/unread-count` starts at 0, published a real
  `session.join_request.created` event onto the real exchange (via the RabbitMQ management HTTP
  API) and confirmed the REST count advanced to 1. Then, using the client's own `@stomp/stompjs`
  library from a small Node script (Chrome browser automation wasn't available in this
  environment): connected directly to the running server's `/ws` and received a real live push
  frame; separately connected **through the actual Vite dev server's `/ws` proxy** (`ws://
  localhost:5173/ws`) and confirmed the full round trip — CONNECT, SUBSCRIBE, and a live MESSAGE
  frame — all worked through the proxy exactly as a real browser tab would experience it. Full
  browser-visual confirmation of the TopBar badge rendering was not performed (no Chrome extension
  connection in this environment) — everything upstream of that rendering (real backend, real
  broker, real proxy, real client library) is verified; the badge's own rendering logic has direct
  Vitest/RTL coverage (`TopBar.test.tsx`).

**Divergence from the approved design:** none in shape — the plan's Part 2/Part 3 structure was
followed as written. The `reactor-netty` dependency and the three IT-test-container workarounds
above weren't anticipated in the plan (the plan didn't get into Testcontainers-level detail) but
don't change anything the plan committed to; they're implementation-level corrections found once
real end-to-end testing was attempted, same character as NTF-2's dedup-mechanism corrections.

---

**Status:** `DONE` — see `modules/notification/docs/MVP/NTF-3_STOMP_LIVE_DELIVERY.md`
**Type:** New Feature
**Depends on:** NTF-2

**Delta (2026-08-17):** scope explicitly confirmed as *web, in-app, connected-session* delivery
only, after a mid-ticket architecture discussion — see
`documentation/md/vision/NOTIFICATION_MODULE_VISION.md`'s hybrid-delivery decision and
`PROGRESS.md` §2.7 for the full rationale. STOMP-over-WebSocket structurally cannot reach a
backgrounded/closed mobile app (iOS forbids background WebSocket sessions outright; Android's Doze
mode is similarly hostile) — this is **not** a gap this ticket needs to close, and STOMP is not
meant to become a mobile solution. Mobile push notifications stay a separate, future,
not-yet-scoped ticket built on Firebase Cloud Messaging once the Phase 4-5 mobile phase starts, per
the vision doc's now-updated Client delivery bullet and its Open Questions section.

Spring WebSocket STOMP support in broker-relay mode, pointed at RabbitMQ's STOMP plugin instead of
the in-memory broker. Per-user delivery via Spring's `/user/queue/notifications` destination
convention — a separate exchange/purpose from `sportconnect.events`.

**New dev-infra requirement:** enable the `rabbitmq_stomp` plugin on the RabbitMQ image in
`infra/docker-compose.dev.yml` (not on by default).

**Tests:** integration test verifying a consumed event results in a STOMP frame on the recipient's
subscribed destination; client reconnect behavior is a `CLIENT-NOTIF-1` concern, not this ticket's.

---
