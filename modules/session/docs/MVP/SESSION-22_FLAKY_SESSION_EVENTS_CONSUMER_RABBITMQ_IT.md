# SESSION-22 · `SessionEventsConsumerIntegrationTest` fails intermittently on its RabbitMQ container

**Status:** `TODO`
**Type:** Bug Fix (test reliability)
**Filed:** 2026-08-20, found while verifying sport `A7` — the failures were initially mis-attributed
to that ticket before same-code re-runs proved otherwise.
**Depends on:** nothing

## Symptom

All 6 tests in
`server/src/test/java/com/sportconnect/integration/SessionEventsConsumerIntegrationTest` fail
together with:

```
org.springframework.amqp.AmqpIOException: java.io.IOException
    at RabbitExceptionTranslator.convertRabbitAccessException
    at AbstractConnectionFactory.createBareConnection
    at CachingConnectionFactory.createConnection
    ... RabbitTemplate.convertAndSend
```

It is a **connection** failure to the Testcontainers RabbitMQ broker, not an assertion failure — the
first `convertAndSend` in each test cannot open a connection, so all 6 fail as a block.

## Evidence that it is flaky, not deterministic

Measured across 12 full `./gradlew :server:test --rerun-tasks` runs during the A7 session:

- **6 failed, 6 passed.**
- It failed once, then passed twice on *identical* code.
- It then failed again after a change that was **nothing but a method rename**
  (`getSportById` → `getActiveSportById`) — an identifier change cannot cause an AMQP connection
  IOException.
- It passed on immediate retry with byte-identical code, more than once.
- It passes reliably when run **in isolation** (`--tests "*SessionEventsConsumerIntegrationTest*"`),
  which is what points at a whole-suite interaction rather than the class itself.
- Docker was confirmed healthy throughout (the `sportconnect-dev-*` stack was up the whole time).

**Cautionary note for whoever picks this up:** a single green run on a clean tree is *not* evidence
that a change caused this. That inference was made during A7 and was wrong. Attribute a failure here
only after several same-code runs.

## Hypotheses worth checking, in order

1. **Spring context churn.** It passes in isolation and fails in a full suite, which is the classic
   signature. `BaseIT` deliberately has no infra in its ancestry, and the RabbitMQ container is
   started by `RabbitMqTestContainerBase`/`RabbitMqStompTestContainerBase` via
   `@DynamicPropertySource`. If Spring's context cache evicts (and therefore *closes*) a
   RabbitMQ-backed context while its container/connection factory is still needed by a later class,
   the next `convertAndSend` would fail exactly like this. Check whether the container is a JVM-wide
   singleton (`SharedRedisContainer` is the precedent in this repo) or per-context.
2. **Container lifecycle vs. test ordering.** If the broker is stopped when one context closes but
   another class expects it, ordering changes flip the outcome — consistent with a rename changing
   nothing but shuffling execution.
3. **Startup race.** The connection is attempted before the broker finishes booting. Less likely
   given it fails as a block and passes in isolation, but cheap to rule out with a readiness wait.

## Fix direction

Whatever the cause, the fix should make the broker's lifetime explicitly JVM-wide (the
`SharedRedisContainer` pattern already in this repo) rather than tied to any one Spring context, so
context eviction cannot take it down. Avoid papering over it with a retry annotation — a 50% flake
rate on an integration test that verifies real message delivery is worth fixing properly.

## Tests

Reliability is the deliverable: run the full `./gradlew :server:test --rerun-tasks` at least 5 times
consecutively and require 5 clean passes before calling it done. A single pass proves nothing here.
