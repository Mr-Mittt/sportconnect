# NTF-7 · Find and fix the flaky SessionEventsConsumerIntegrationTest

**Status:** `TODO` · **Type:** Testing (flaky test), low priority · **Depends on:** none

**Filed:** 2026-10-23, from the A29 PR (#362) CI run. `SessionEventsConsumerIntegrationTest > redeliveredMessage_isDedupedAndDoesNotDoubleCountTheAggregation()` failed, together with some of the cases after it, and was green on re-run. A29 touches no Spring module, so it was unrelated. This is the second time: `documentation/md/IT_OVERVIEW.md` already lists the class as locally flaky (SESSION-22), and NTF-3 saw an unrelated failure in it. The owner chose to file this rather than keep re-running.

## What

Find the root cause and fix it, so the class stops failing intermittently in CI. Two hypotheses, neither tested, from reading the test:

1. **Dedup race.** The test publishes the same `messageId` twice. If the listener runs more than one consumer, both copies might get past the dedup check before either marker row is written, which would give 2 notifications or `actorCount == 2`. NTF-2 replaced the dedup with `ProcessedMessageRepository.insertIfAbsent`, which should make this safe. Check that it really is, with concurrent consumers.
2. **Timeout.** Every case waits at most 10 s. The first message into a freshly started RabbitMQ container on a loaded runner may take longer, and the cases after it fail on the backlog.

Pickup starts by getting the real assertion text from a failing CI log. `Expecting actual: []` points at hypothesis 2, and a size or `actorCount` of 2 points at hypothesis 1. Then explain the root cause and get sign-off before changing anything. A fix may live in the test (wait for the listener to be ready, a longer or readiness-based await) or in the consumer, depending on the cause.

## Out of scope

Other flaky ITs; changing the dedup design beyond what the root cause needs; the RabbitMQ container base class for other tests, unless the root cause is there.

**Tests:** the class itself is the test. Prove the fix by running it repeatedly (for example 20 times in a loop) and check the result XML, and mutation-check the fix if it is a consumer change.
