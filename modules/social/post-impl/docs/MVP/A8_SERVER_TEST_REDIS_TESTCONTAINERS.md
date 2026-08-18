# A8 · `server:test` needs Redis (Testcontainers)

**Status:** `DONE`
**Type:** Bug Fix (Test infra)
**Date:** 2026-07-08

## Design

`PostServiceImpl`/`CommentServiceImpl` call `StringRedisTemplate` unconditionally (like counters,
comment-preview cache — B3/B4) with no try/catch fallback. The `test` Spring profile has no real
Redis (`spring.data.redis.enabled: false` in `application-test.yml` is dead/no-op — not a real
Spring Boot property), so `PostControllerIntegrationTest.shouldCreatePost` threw
`RedisConnectionFailureException`. This isn't limited to the two counter operations the ticket
originally named — `getCount()` is called inside `mapToResponse()`, which runs on every response
build, including `createPost`'s own return value — so any test returning a `PostResponse`/
`CommentResponse` needs Redis reachable, not just tests that exercise like/unlike.

Two fixes were on the table (per the ticket): give `server:test` a real Redis, or make the
Redis-backed paths degrade gracefully. Chose the former — making the paths Redis-optional would've
meant adding fallback logic to ~10 call sites across both service classes that don't have any
today, a meaningfully larger production-code change just to satisfy a test gap. Docker was
confirmed installed and running locally, and Testcontainers needs no GitHub Actions-specific
wiring (`ubuntu-latest` runners have Docker preinstalled) — the same Java-side container setup
that runs locally runs unchanged in CI, unlike a GitHub Actions `services:` block, which is
YAML-only and wouldn't help local `./gradlew test` runs.

Approach: a **singleton Testcontainers Redis container** in `BaseIT`, started once per JVM test
run via a static initializer (not the `@Testcontainers`/`@Container` JUnit5 extension, which would
start/stop per test class) — reaped automatically by Testcontainers' Ryuk sidecar at JVM exit.

## What was built

### `server/src/test/java/com/sportconnect/integration/BaseIT.java`

```java
private static final GenericContainer<?> REDIS =
        new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                .withExposedPorts(6379);

static {
    REDIS.start();
}

@DynamicPropertySource
static void redisProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.data.redis.host", REDIS::getHost);
    registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
}
```

Shared by every `BaseIT` subclass in the run. `GroupControllerTest` (the only other subclass)
mocks `GroupService` via `@MockBean` and never touches Redis — confirmed unaffected, it just
inherits an unused container.

### `server/src/test/resources/application-test.yml`

Removed the dead `spring.data.redis.enabled: false` line — it sat right next to the config this
ticket touches and would have misleadingly suggested Redis was still being toggled off.

## Divergence from the approved plan

The plan assumed `org.testcontainers:testcontainers:1.19.3` (already a `server/build.gradle`
dependency) would work as-is. It didn't — verification surfaced two real blockers not anticipated
during design:

1. **Stale Docker API version.** `NpipeSocketClientProviderStrategy` failed with `client version
   1.32 is too old. Minimum supported API version is 1.41`. Testcontainers 1.19.3's bundled
   `docker-java` hardcodes an old default API version; only 2.0.x+ auto-negotiates with the
   engine. Fixed by bumping `org.testcontainers:testcontainers` to `2.0.5`.
2. **Dead sibling dependency broke on the bump.** `org.testcontainers:postgresql:1.19.3` (already
   present, confirmed to have zero references anywhere in `server/src/test/java` — tests run on
   H2) doesn't have a `2.0.5` release under the same coordinates. Rather than chase a matching
   version for code that's provably unused, removed it outright.

Neither change was in the original plan (which explicitly said to leave the unused Postgres
dependency alone), but both were forced by making the chosen approach actually work — a mismatched
or unresolvable Testcontainers module version on the same classpath isn't a viable "leave it as
is."

Locally, Rancher Desktop additionally required `DOCKER_HOST=npipe:////./pipe/docker_engine` to be
set for the JVM to detect Docker at all (a `MalformedChunkCodingException` otherwise, a known
Testcontainers/Rancher Desktop npipe quirk). This is a local machine/tool configuration issue, not
a code or CI concern — GitHub Actions' `ubuntu-latest` runners use the standard Docker socket and
don't need it. Not added to any committed config.

## Verification

- `./gradlew :server:test --tests "*PostControllerIntegrationTest*"` — `shouldCreatePost` passes.
- `./gradlew :server:test --tests "*GroupControllerTest*"` — all 25 tests still pass, no
  regression from the shared `BaseIT` change.
- `./gradlew test` (full suite) — 26/27 pass. The 1 remaining failure was `JavaRevisionTest`, a
  pre-existing, unrelated Java pass-by-reference demo test with a stale assertion (confirmed via
  `git log` — last touched in a commit that predates this ticket entirely, and traced to a personal
  scratch file swept into an unrelated feature commit, not real product code). Investigated and
  removed separately (both `JavaRevision.java` and `JavaRevisionTest.groovy` deleted, user
  confirmed) — `server:test` is now 27/27 green.
- Confirmed via `docker ps` that the Redis container and Ryuk sidecar are both gone after the JVM
  exits — no manual cleanup needed.

---

**Status:** `DONE` — see `modules/social/post-impl/docs/MVP/A8_SERVER_TEST_REDIS_TESTCONTAINERS.md`  
**Type:** Bug Fix (Test infra)  
**Scope:** `server/src/test/resources/application-test.yml`, possibly `PostServiceImpl`'s
Redis-counter code path (B3/B4)

**Found during:** auth module A2/A3 work (2026-07-08), while chasing an unrelated integration-test
schema-drift detour (see auth module's A2/A3 closeout docs). `PostControllerIntegrationTest
.shouldCreatePost` fails with `RedisConnectionFailureException: Unable to connect to Redis` — the
`test` profile's `spring.data.redis.enabled: false` in `application-test.yml` is **not a real
Spring Boot property** (confirmed by this failure — it's a no-op, same category of dead config as
`spring.security.enabled: false` in the same file, which also does nothing in Spring Boot 3.x).
`PostServiceImpl.createPost` unconditionally touches Redis for the B3/B4 like-counter/comment-
preview-cache features, so the test genuinely needs a real (or embedded/fake) Redis to pass — it
isn't optional infrastructure for this code path.

**Two possible fixes, need a decision before implementing:**
1. **Give `server:test` a real Redis.** Natural fit with `infra/documentation/BACKLOG_MVP.md`'s
   **INFRA-2** (dev docker-compose) — either reuse that compose file for CI/test runs too, or wire
   Testcontainers' Redis module into `BaseIT` (spins up a throwaway container per test run,
   `@Container` + `@DynamicPropertySource` overriding `spring.data.redis.host/port`).
2. **Make the Redis-backed counter path test-profile-aware** so it degrades gracefully without
   Redis (e.g. skip the cache write, fall back to a DB count) — changes production code to
   accommodate a test gap, generally the less preferred direction unless Redis-optional behavior
   is independently desired.

**Not fixed as part of A2/A3** — deliberately left `PostControllerIntegrationTest.shouldCreatePost`
red rather than scope-creep further into Redis test infrastructure; that session's actual schema-
drift-in-`schema.sql` fixes (unrelated missing columns/tables) are unaffected and remain fixed.

---
