# Integration Test (IT) Overview

A living catalog of every real Spring integration test in `server/src/test/java/com/sportconnect/
integration/` and which Testcontainer(s) it forces to start. Companion to `SPOCK_TESTING_GUIDE.md`
(module-level Spock unit tests, mocked collaborators) and `client/docs/E2E_OVERVIEW.md` (the
client's own equivalent catalog) — this one covers the backend's `:server:test` task instead.

**Keep this current.** When an IT class is added, removed, or changes which base class it extends,
update this file in the same change — the same discipline `client/docs/E2E_OVERVIEW.md` already
asks for on the client side. A stale catalog here is worse than none, since it actively misleads
whoever picks it up next about which containers a given class actually pays for.

## Why this exists

CLAUDE.md's testing convention requires a real IT (not just a mocked Spock unit test) for any new
authorization/visibility boundary. Picking the right base class matters for suite speed: every
`@DynamicPropertySource` method only runs once its declaring class is *loaded*, so a container
lives only as long as some IT actually extends the base class that declares it — extend the wrong
one and you force a container the test never uses; extend too shallow a one and a test that
genuinely needs Redis/RabbitMQ silently runs against a broken connection instead. This doc exists
so that choice is a five-second table lookup, not a re-derivation from scratch each time (or worse,
copy-pasting whichever base class the nearest existing test happens to use, without checking that
it actually needs it — same domain-name-doesn't-imply-need caution `RedisBaseIT`'s own Javadoc
already gives).

## Base classes and what they start

| Base class | Extends | Starts | Notes |
|---|---|---|---|
| `BaseIT` | — | nothing beyond H2 (real Spring context, real MockMvc, real DB via H2) | Deliberately infra-free — see its own Javadoc. |
| `RedisBaseIT` | `BaseIT` | + Redis (`SharedRedisContainer.REDIS`) | For a test whose request path genuinely touches `StringRedisTemplate` — verified per class, never assumed from domain name. |
| `RedisTestContainerBase` | *(none)* | Redis only (`SharedRedisContainer.REDIS`) | Standalone — for a test that can't/shouldn't extend `BaseIT` (e.g. needs `webEnvironment = RANDOM_PORT`). References the **same** container instance as `RedisBaseIT`, never a second Redis. |
| `RabbitMqTestContainerBase` | `BaseIT` | + RabbitMQ, plain AMQP only (own container, port 5672) | Not Redis — this class's own ancestry stops at `BaseIT`. |
| `RabbitMqStompTestContainerBase` | `BaseIT` | + RabbitMQ, AMQP **and** the `rabbitmq_stomp` plugin (own, separate container, ports 5672 + 61613) | Deliberately a **different** container from `RabbitMqTestContainerBase`'s — a STOMP-only test shouldn't force a plain-AMQP test's container to also carry the plugin, and vice versa. |

All Testcontainers here use a plain `static final` field + `static { ... .start(); }` block — a
JVM-wide singleton started once when the declaring class first loads, not the JUnit5
`@Testcontainers`/`@Container` extension. See each base class's own Javadoc for the full reasoning.

Locally, single-container startup measured (redis:7-alpine ~2.3s, rabbitmq:3-management-alpine
plain ~8.4s, rabbitmq:3-management-alpine + STOMP plugin ~9.6s) — container spin-up itself is not
the source of the occasional very-long local `:server:test` run seen on this Windows/Docker Desktop
box.

**Resolved 2026-09-14 (see `documentation/sessions/103_log.md` for the first documented >40min
stall, and the session that closed SESSION-24 for the full investigation):** neither individual
container startup, nor 5 classes run together (forcing Redis + plain RabbitMQ + RabbitMQ-STOMP all
alive simultaneously across several distinct `@SpringBootTest` context configurations), nor
eventually the **full 19-class suite** showed any slowness once stale local state was cleared —
`BUILD SUCCESSFUL in 1m 41s`, 185/185 passed, comparable to `server-ci`'s ~2m36s on GitHub's
runner. The prior >40-55min stalls are most likely **stale Gradle daemon / locked-file state on
this box**, not a real performance problem with the suite, Testcontainers, or Windows itself. See
the note in root `CLAUDE.md`'s Testing section — **try that fix first** before assuming a local
`:server:test` run needs to be abandoned in favor of `server-ci`.

## Every IT class

| Class | Base class | Container(s) | Test methods | Covers |
|---|---|---|---|---|
| `GlobalExceptionMappingIntegrationTest` | `BaseIT` | none (H2 only) | 5 | C4 — Spring MVC framework exceptions (404/405/415/400) come back through the real dispatch pipeline wrapped in `ApiResponse`, not a generic 500. |
| `GroupControllerTest` | `BaseIT` | none (H2 only) | 37 | Group CRUD/membership/settings/invitation/join-request endpoints — `GroupService` is `@MockBean`, so this is a controller/request-mapping-layer test, not a full service-layer one. |
| `InternalServiceFilterScopeIT` | `RedisTestContainerBase` | Redis | 4 | Regression test (2026-07-27 bug): `InternalServiceAuthFilter` must not be Spring-auto-registered as a global servlet filter outside its intended `SecurityFilterChain`. Needs `webEnvironment = RANDOM_PORT`, so it can't extend `BaseIT`. |
| `NotificationAccessGateIntegrationTest` | `BaseIT` | none (H2 only) | 4 | NTF-1's `NotificationGate` — real `NotificationController`/`NotificationServiceImpl`/`NotificationGate` beans, real DB round trip. |
| `NotificationStompIntegrationTest` | `RabbitMqStompTestContainerBase` | RabbitMQ + STOMP | 1 | NTF-3's live-delivery path end to end: a session event on a real broker → `SessionEventsConsumer` → `SessionEventProcessor` → `NotificationService.recordEvent` → `NotificationLiveUpdateListener` (AFTER_COMMIT) → a real STOMP frame on the recipient's subscribed destination. |
| `PostAccessGateIntegrationTest` | `RedisBaseIT` | Redis | 19 | A14's `PostGate` — real `PostController`/`PostServiceImpl`/`CommentServiceImpl`/`PostGate`/`GroupServiceImpl`/`UserFriendServiceImpl` beans, real DB round trip. |
| `PostControllerIntegrationTest` | `RedisBaseIT` | Redis | 2 | Post/comment endpoints against real repositories (`PostRepository`, `CommentRepository`, `HashtagRepository`, etc.) — no mocked collaborators. |
| `ReferenceApiIntegrationTest` | `BaseIT` | none (H2 only) | 12 | REF-1 — the public `GET /api/reference/**` reads through the real `SecurityConfig` chain (anonymous allowed, non-GET still rejected), 404 for an unknown/inactive country, active-only lists, and the `ReferenceService` batch/validation contract against real rows. Executes the **real** `V073__seed_reference_data.sql` against H2 and asserts its content (Vietnam only, 63 regions, `en`/`vi`). |
| `SessionAttributeSchemaIntegrationTest` | `BaseIT` | none (H2 only) | 11 | A17 — session-attribute-schema endpoints, an authorization boundary (admin writes + active-only member GET); proves `@PreAuthorize` actually fires through real wiring. |
| `SessionAttributesIntegrationTest` | `RedisBaseIT` | Redis | 6 | SESSION-23 — a session-attributes write through the real `SessionController`/`SessionServiceImpl` → `SportService.getSessionAttributeSchemaRaw` → `SessionAttributeFilter` → the real `sessions.attributes` JSON column and back out on `SessionResponse`. |
| `SessionEventsConsumerIntegrationTest` | `RabbitMqTestContainerBase` | RabbitMQ (plain) | 4 (+2 parameterized invocations) | NTF-2's `SessionEventsConsumer` wiring — publishes directly onto a real broker, asserts a real `Notification` row through the actual exchange/queue/binding/listener path. This is SESSION-22's documented locally-flaky class (passed cleanly in the CI run verified 2026-09-14). |
| `SessionPostAccessGateIntegrationTest` | `RedisBaseIT` | Redis | 22 | SESSION-10/A17's one-way comment-thread design — real `SessionController`/`SessionServiceImpl`/`SessionGate`/`PostController`/`PostGate`/`CommentServiceImpl`/`GroupServiceImpl` beans, real DB round trip. |
| `SessionSystemCommentIntegrationTest` | `RedisBaseIT` | Redis | 5 | SESSION-21's system comments — real `SessionController`/`SessionServiceImpl`/`SessionGate`/`CommentServiceImpl` beans; proves what only real wiring can show (author/authorization of a system-authored comment). |
| `SportActiveGateIntegrationTest` | `BaseIT` | none (H2 only) | 5 | A7 — creating a sport-tagged entity requires the sport to still be active (404 if not) and the caller's sport profile to not be soft-deleted. |
| `SportAttributeSchemaIntegrationTest` | `BaseIT` | none (H2 only) | 21 | A9 — sport attribute-schema endpoints, an authorization boundary; proves what a mocked `SportServiceImplSpec` cannot. |
| `SportProfileAttributeWriteIntegrationTest` | `BaseIT` | none (H2 only) | 4 | A10 — a JSON `null` in the attributes map surviving `@RequestBody` binding into a `Map`, and the stored-map prune running through a real request + real JSON column round trip. |
| `SportProfileResumeAndVisibilityIntegrationTest` | `BaseIT` | none (H2 only) | 15 | A20 — sport-profile resume (`isResume:true`) and visibility, through the real request pipeline rather than a directly-built request object. |
| `UserDeactivationSessionRevocationIntegrationTest` | `RedisBaseIT` | Redis | 4 | U12 — deactivating a user revokes both refresh tokens and any already-issued access token, through the real `JwtAuthenticationFilter` and real `UserServiceImpl.deleteUser()`. |
| `UserFriendEventsConsumerIntegrationTest` | `RabbitMqTestContainerBase` | RabbitMQ (plain) | 3 | U13's `UserEventsConsumer` wiring — publishes `user.*` friend-request events onto a real broker, asserts a real `Notification` row through the actual exchange/queue/binding/listener path. |
| `UserLookupAccessIntegrationTest` | `BaseIT` | none (H2 only) | 11 | U11 — the user lookup + `check/*` availability endpoints reject anonymous callers and never leak a PII field. |

**Test-method counts are source-level `@Test`/`@ParameterizedTest` counts**, not runtime execution
counts — a parameterized method contributes one row here but multiple actual test executions (e.g.
`SessionEventsConsumerIntegrationTest`'s status-gate case runs twice, once per `SessionStatus`
value). Don't treat the sum of this column as the number JUnit reports at the end of a run.

## Summary

- **9 classes** use no Testcontainer at all (H2 only, via plain `BaseIT`) — plus `ReferenceApiIntegrationTest` (REF-1), added after the totals below were taken.
- **6 classes** use Redis via `RedisBaseIT`; **1 more** (`InternalServiceFilterScopeIT`) uses Redis
  standalone via `RedisTestContainerBase` — all 7 share the same single `SharedRedisContainer`
  instance.
- **2 classes** use the plain-AMQP RabbitMQ container (`RabbitMqTestContainerBase`).
- **1 class** uses the separate AMQP+STOMP RabbitMQ container (`RabbitMqStompTestContainerBase`).

19 classes total, matching the 19 distinct IT classes and 185 test executions confirmed green in
the `server-ci` run for PR merging SESSION-24 (2026-09-14).
