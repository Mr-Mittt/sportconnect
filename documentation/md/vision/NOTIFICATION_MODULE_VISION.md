# Notification Module Vision

**Last updated:** 2026-08-16

## Vision statement

Give every user a single, cross-cutting notification system — in-app for v1, live-delivered — that
surfaces time-sensitive actions (join requests, friend requests, invites) and social activity
(likes, comments, thread replies) across every domain, without any producing domain importing
notification internals or notification-impl importing any domain's internals beyond its `-api`.

## Discussion summary

Opened at the user's request with architecture, not scope. The core tension: a notification needs
to hear about events from `post-impl`, `group-impl`, `session-impl`, and `user-impl`, but the
repo's cross-domain rule forbids importing another domain's `-impl`. Two shapes were compared —
direct synchronous calls through a `notification-api` interface (matches existing precedent, but
couples every producing domain to notification at compile time and puts notification-write latency
in unrelated request paths) vs. a decoupled event-driven shape where producers publish their own
domain events and notification-impl subscribes, never the other way around. The event-driven shape
was preferred as the better analog of "monolith-first, microservice-ready" — an in-process event
today becomes a real message tomorrow without a rewrite.

That led into transport: plain Spring `ApplicationEventPublisher` (no new infra, but loses events on
a crash) vs. Redis pub/sub (already-running infra, but equally fire-and-forget — doesn't actually
fix the durability gap) vs. a real broker. The user chose **RabbitMQ**. Durability was then examined
in detail: publisher confirms + a durable queue + persistent delivery mode protect a message once
it's actually published, but do **not** protect the window between "the triggering DB transaction
committed" and "the publish call is issued" — if the app crashes there, the event is lost with no
record it ever existed. Facebook's Iris system was used as a grounding comparison (hybrid
fan-out-on-write/read, sharded storage, aggregation, multi-channel dispatch, relevance ranking —
most of which is over-engineering at this scale, but its decoupled-producer/durable-queue shape
validated the same direction already chosen). The only way to close the crash-window gap is a
**transactional outbox** — the user confirmed adding one.

Scope was then worked domain-by-domain (post/social, group, session), settling on aggregated
per-recipient notifications (not one row per event) with a reset-on-read boundary, matching how
GitHub/Twitter do it. A follow-up question — should someone who commented on a post also be
notified when others comment on the same thread — extended the design to resolve a **recipient
set** per event (`{post owner} ∪ {distinct prior commenters} − {new commenter}`) rather than a
single fixed recipient. A separate question about "follow" notifications surfaced that
`user_follows` is dead schema, already replaced by a shipped, bidirectional Friendship system (`U1`)
— redirecting that candidate to friend-request-received/accepted instead, which closes a
`// TODO: notify` stub already sitting in `UserFriendServiceImpl`.

Client delivery and success metric closed the session: STOMP-over-RabbitMQ (reusing the same broker
as a relay target, plus an already-unused Spring STOMP dependency left over from chat's original
plan) was chosen over simple polling or SSE, for real live delivery. Success metric: read-rate only
(`is_read` flag, no new instrumentation) — time-to-action and a volume guardrail were both
explicitly declined for v1 — with rollout/measurement priority ordered **session > post > group >
friend**.

## Decisions

- **Propagation:** event-driven, not direct synchronous `-api` calls. Producing domains never
  depend on `notification-api`/`notification-impl`.
- **Broker:** RabbitMQ. One topic exchange, `sportconnect.events`, routing keys shaped
  `<domain>.<entity>.<action>` (e.g. `post.comment.created`, `group.join_request.created`,
  `session.comment.created`). `notification-impl` owns one durable queue bound to the patterns it
  cares about.
- **Durability:** transactional outbox pattern. Each producing domain gets its own outbox table
  (e.g. `post_outbox_events`), written in the **same transaction** as the domain write that should
  trigger a notification. A separate relay (poller, or `LISTEN/NOTIFY`) drains `PENDING` rows and
  publishes to RabbitMQ with **publisher confirms** (`correlated` mode), a **durable queue**, and
  **persistent** delivery mode, marking rows `SENT` on ack. This supersedes the earlier
  `@TransactionalEventListener(AFTER_COMMIT)`-does-the-publish idea — with an outbox table, the
  relay (not a transaction-bound listener) is what actually calls RabbitMQ, so no Spring
  application-event machinery is needed on the producing side at all.
- **Storage:** one `notifications` table, owned by a new `modules/notification` domain — replaces
  the dead, unused `V005` `notifications` table (cross-domain FKs, stale `type`/`entity_type`
  values). ID-only references (`recipientUserId`, `entityId`), no FKs to other domains' tables.
- **Aggregation:** grouped by `(recipientUserId, type, entityType, entityId)`. A new event on an
  already-unread group bumps `actor_count` + prepends to a bounded `actor_ids` list (last 3) instead
  of inserting a new row. Marking read closes the group — the next event on that same key starts a
  fresh row. No separate preferences table for v1 — single table, no per-type mute/opt-out yet.
- **Comment-thread recipients:** a new comment's recipient set is
  `{post owner} ∪ {distinct prior commenters on that post} − {the new commenter}`, resolved once at
  consume time via a new batch method on `post-api` — not two separate notification types.
- **Event scope, v1:**
  - **Post/social** (`post-impl`): post liked, comment on your post (+ thread-participant fan-out
    per the rule above), reply to your comment.
  - **Friend** (`user-impl`): friend request received, friend request **accepted**. Declined stays
    silent — deliberately, by user decision. Replaces the retired "new follower" concept.
  - **Group** (`group-impl`): join request received, join request approved/rejected, invited to a
    group, invite accepted/declined.
  - **Session** (`session-impl`): new session comment (closes `NOTIF-1`), join request received,
    join request approved/rejected, invited to a session.
- **Client delivery:** STOMP-over-RabbitMQ — Spring WebSocket STOMP support in broker-relay mode,
  pointed at RabbitMQ's STOMP plugin (`rabbitmq_stomp`, not on by default — new dev-infra
  requirement) instead of the in-memory broker. Per-user delivery via Spring's
  `/user/queue/notifications` destination convention — a separate concern from the
  `sportconnect.events` exchange used for domain-event ingestion.
- **Delivery architecture is hybrid, by design (added 2026-08-17, at NTF-3 pickup):** STOMP is
  scoped to *web, in-app, connected-session* delivery only — it is deliberately not a mobile
  solution and isn't meant to become one. iOS does not support WebSocket connections in the
  background at all (a persistent socket only works while the app is foregrounded), and Android's
  Doze mode is similarly hostile to background sockets — this is structurally the same gap Apple
  built APNs and Google built FCM to solve, not a config problem STOMP can be tuned around. The
  future mobile phase (`PROGRESS.md`'s Phase 4-5) already earmarks **Firebase Cloud Messaging** for
  push notifications — that stays the plan, and is not replaced or superseded by STOMP. The two are
  complementary, not competing: STOMP/WebSocket suits an actively-connected session (lower latency,
  no permission prompt, no new vendor dependency), FCM suits reaching a user whose app is
  backgrounded or closed (OS-managed, battery-efficient, the only way to reach a killed mobile app).
  FCM was deliberately **not** pulled forward into this ticket — it requires a real new subsystem
  (device/browser token registration, refresh, invalidation; FCM has no concept of "user," only
  tokens) whose payoff (mobile background delivery) has no mobile client yet to receive it. Building
  it now would be paying that cost before there's any benefit to collect.
- **Deactivated users:** no new logic needed. Read endpoints gate on `isActive` like every other
  authenticated endpoint (per `CLAUDE.md`'s account-lifecycle rule); a deactivated user can't trigger
  events either, since they can't act at all.
- **Success metric:** read-rate (`is_read` flag) only, no new instrumentation, no volume guardrail
  for v1. Rollout/measurement priority order: **session > post > group > friend**.

## Rejected alternatives

- **Direct synchronous `-api` calls** (each producing domain calls `NotificationService` directly)
  — rejected: couples every domain to notification at compile time, doesn't map cleanly onto a
  future service-extraction seam the way an async event does.
- **Plain Spring `ApplicationEventPublisher` as the durability mechanism** — rejected once the
  crash-window gap was made concrete; superseded by the outbox pattern. Note this is a different
  question from NTF-3's `@TransactionalEventListener(AFTER_COMMIT)` use to trigger the *live STOMP
  push* after `recordEvent`'s transaction commits — that one isn't a durability mechanism (a missed
  live-update ping isn't data loss; NTF-1's REST endpoints stay the source of truth, and
  `CLIENT-NOTIF-1` already specs a poll fallback on disconnect), just a "don't push before the write
  is visible" ordering guard. Don't conflate the two uses of the same Spring mechanism.
- **Redis pub/sub** (originally scoped in `REDIS_RESEARCH.MD` for this exact use case) — rejected:
  fire-and-forget, no persistence, no replay — doesn't actually close the durability gap that was
  the whole point of considering a broker.
- **"New follower" notification** — rejected: `user_follows`/`UserFollow` is dead schema, already
  replaced by the shipped bidirectional Friendship system (`U1`, `DONE`). Building against it would
  be wasted work.
- **Live delivery via the Go chat service's existing WebSocket Hub** — rejected, same reasoning as
  `SESSION_COMMENTS_VISION.md`: its sync boundary is designed for one specific purpose and wasn't
  built around general-purpose app-event push.
- **Time-to-action as the primary success metric** — considered (comparing join/friend-request
  latency before vs. after shipping), but the user chose read-rate only for v1.
- **Notification-volume-per-user-per-day guardrail** — explicitly declined for v1.
- **Kafka** — not separately evaluated once RabbitMQ was the direct pick; nothing about
  SportConnect's current scale (single Postgres instance, no independent multi-consumer fan-out
  need) argues for Kafka's extra operational surface over RabbitMQ.

## Open questions

- **Bounded actor-list size** for the "X, Y and N others" aggregation text — defaulted to **3**,
  not explicitly confirmed. Revisit if it reads oddly once built.
- **Read-rate metric window** — defaulted to **24h** ("read within 24h of creation"), not explicitly
  confirmed.
- **Outbox relay topology** — one shared generic poller iterating every domain's outbox table, or
  each domain runs its own poller instance. Left to `C3`/`NTF-2`'s implementation scoping.
- **Notification preferences** (per-type mute/opt-out, multi-channel dispatch) — explicitly deferred
  past v1 by the single-table decision. Revisit once push notifications (already tracked under the
  Phase 4–5 mobile roadmap in `PROGRESS.md`) get scoped.
- **FCM/mobile push ticket** — not yet scoped, no ticket ID minted (there's no mobile module to file
  it under yet). Needs its own Phase 1/2/3 pass whenever the Phase 4-5 mobile phase starts: a device/
  browser token-registration subsystem (table, registration endpoint, refresh/invalidation handling),
  Firebase Admin SDK wiring (new `firebase-admin` dependency, a new service-account-credential secret
  managed the same way `services/chat`'s `JWT_SECRET`/`INTERNAL_SERVICE_SECRET` are — env-injected,
  fails fast if missing, never a repo secret), and a decision on whether to also extend it to web
  (FCM supports Web Push) once STOMP's limits are felt at scale, or leave web on STOMP indefinitely.

## Proposed tickets

### modules/common
- **C3** — Generic transactional-outbox mechanism: an `OutboxEvent` mapped-superclass (id,
  eventType, JSON payload, status `PENDING`/`SENT`, timestamps) + a reusable relay component pattern
  each domain builds its own outbox table on top of. Filed in
  `modules/common/docs/BACKLOG_MVP.md`. Prerequisite for every domain ticket below.

### modules/notification (new module)
- **NTF-1** — Module scaffolding: `notification-api`/`notification-impl`, `Notification`
  entity/table (replaces the dead `V005` table via a new migration), aggregation-per-recipient
  upsert logic, `GET /api/notifications`, `GET /api/notifications/unread-count`,
  `PUT /api/notifications/{id}/read`. Depends on C3. Filed in
  `modules/notification/docs/BACKLOG_MVP.md`.
- **NTF-2** — RabbitMQ consumer: `sportconnect.events` topic exchange, durable queue, `@RabbitListener`,
  recipient-set resolution (incl. the new `post-api` thread-participant batch method). Depends on
  NTF-1. Filed in `modules/notification/docs/BACKLOG_MVP.md`.
- **NTF-3** — STOMP-over-RabbitMQ live delivery: WebSocket STOMP broker-relay config, per-user
  `/user/queue/notifications` destination, `rabbitmq_stomp` plugin enabled in
  `infra/docker-compose.dev.yml`. Depends on NTF-2. Filed in
  `modules/notification/docs/BACKLOG_MVP.md`.

### modules/social/post-impl
- **B7** — Notification outbox wiring: `post_outbox_events` table, outbox row written on post-liked
  /comment-created/comment-reply in the same transaction as the triggering write; new
  `PostService.getDistinctCommenterIds(postId)` batch method. Depends on C3. Filed in
  `modules/social/post-impl/docs/BACKLOG_MVP.md`.

### modules/social/group-impl
- **B21** — Notification outbox wiring: `group_outbox_events` table, outbox row on join-request
  received/approved/rejected, invited-to-group, invite-accepted/declined. Depends on C3. Filed in
  `modules/social/group-impl/docs/BACKLOG_MVP.md`.

### modules/session
- **SESSION-15** — Notification outbox wiring, closes `NOTIF-1`: `session_outbox_events` table,
  outbox row on new session comment, join-request received/approved/rejected, invited-to-session.
  Depends on C3. Filed in `modules/session/docs/BACKLOG_MVP.md`.

### modules/user
- **U13** — Notification outbox wiring, closes `U1`'s `// TODO: notify` stub: outbox table, outbox
  row on friend-request-received and friend-request-accepted (declined stays silent). Depends on C3.
  Filed in `modules/user/user-impl/docs/BACKLOG_MVP.md`.

### Client
- **CLIENT-NOTIF-1** — Notification bell/dropdown: unread badge via live STOMP subscription to
  `/user/queue/notifications` (fallback poll on disconnect), dropdown list backed by
  `GET /api/notifications`, mark-as-read wiring. Depends on NTF-1, NTF-3. Filed in
  `client/docs/BACKLOG_MVP.md`.
