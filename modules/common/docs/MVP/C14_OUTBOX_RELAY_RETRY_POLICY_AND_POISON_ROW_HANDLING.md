# C14 · Outbox relay: a retry policy for repeatedly failing rows (backoff, a cap, and no head-of-line blocking)

**Status:** `TODO`
**Module:** `modules/common` (`OutboxRelay`, `OutboxEvent`, `OutboxEventStatus`), with a Liquibase migration per outbox table in `server` (`session_outbox_events`, `user_outbox_events`, and any later one)
**Type:** Enhancement (Architecture / reliability)
**Depends on:** none
**Filed:** 2026-11-23, found while writing `documentation/md/BACKGROUND_JOBS.md` (SESSION-53 pickup) and reading each job's failure path. C3 left "backoff/dead-letter policy for repeatedly-failing rows" open (`C3_TRANSACTIONAL_OUTBOX.md`, out-of-scope list) and no ticket ever picked it up; this is that ticket. Duplicate check: the common backlog has no outbox ticket besides C3 (done), and a search of the other module docs found only C3 and a passing mention in SESSION-70.

## What happens today (verified in the code, 2026-11-23)

`OutboxRelay.drain()` takes the pending rows the caller's fetcher returns (`findTop50ByStatusOrderByCreatedAtAsc(PENDING)`), and for each one sends it and waits up to 5 seconds for the broker's confirm. A nack or a timeout (`AmqpException`) leaves the row `PENDING`, bumps `attemptCount` and `lastAttemptAt` and logs a warning; the next tick (every 10 seconds, `SessionOutboxRelayJob` and `UserOutboxRelayJob`) takes the same oldest rows again.

- **There is no cap and no backoff.** A row that can never be published is retried every 10 seconds for ever, and each attempt can cost the whole 5-second confirm wait.
- **Head-of-line blocking.** The fetch is the 50 *oldest* pending rows, so 50 rows that keep failing would hold every newer event behind them, including ones that would publish fine. A broker outage fails every row alike and clears when the broker returns; the dangerous case is a handful of rows that fail for a reason of their own (a payload the broker side refuses), which nothing today can tell apart from an outage.
- **No visibility beyond the log.** `attemptCount` is stored, but nothing reads it: no metric, no alert, no way to list the stuck rows except a SQL query by hand.

Say plainly in the ticket's conclusion whether a single poison row has ever been observed in dev or production; at filing time none is known, so this is a reliability gap found by reading the code, not a reproduced incident.

## What to decide at pickup (design first, owner sign-off before code)

- A status or a column for "gave up" (for example `FAILED` after N attempts, or a `next_attempt_at` that spaces attempts out), and what revives a row (an operator action, or a long cool-down).
- The fetch must skip rows that are not due yet, so a stuck row stops blocking the others (`WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`), keeping the existing partial index useful (SESSION-17 built `session_outbox_events`' pending partial index; check its predicate against the new column).
- Visibility: at least a log line at error level when a row gives up, and a way to count the stuck rows (a query documented in `BACKGROUND_JOBS.md`, or a metric if the repo has any by then).
- The consumers already deduplicate by `messageId` (`routingKey:id`), so a retry after a late confirm is safe; keep that.
- Census at pickup: every `OutboxRelay` constructor call (`SessionOutboxRelayJob`, `UserOutboxRelayJob`), the `OutboxEvent` subclasses and their tables and indexes, `OutboxRelayIntegration`-style tests, the H2 `schema.sql` mirror, and `BACKGROUND_JOBS.md` (update the "when it fails" row).

**Out of scope:** changing the broker topology, the notification consumer's own redelivery rules, a dead-letter exchange on the RabbitMQ side.

**Tests:** Spock for the relay (a row past the cap is not fetched again, a due row is, a row that fails then succeeds is `SENT`), an integration test through the real fetch query on H2, and a mutation check per rule. PostgreSQL-only behaviour (the partial index plan) is listed as not run unless a real-Postgres harness exists by then.
