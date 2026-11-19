# SESSION-GROUP-9 · Scale the generation runners with the backlog, up to a limit

**Status:** `TODO`
**Type:** Enhancement (Architecture) · **Depends on:** SESSION-GROUP-5 (its queue hardening, which makes the runner asynchronous)
**Filed:** 2026-11-19, owner decision in the review of SESSION-GROUP-5's generation queue: the queue hardening makes the runner **one asynchronous worker per instance** (a single thread, nudged by the triggers and by a 60-second safety-net call), so a save never waits for generation. When the queue is crowded one worker may be too slow; the owner asked for a follow-up where that worker scales itself.

Today (after the hardening) one worker drains the queue per server instance, in slot order, and the instances share the work safely through the row lock (`FOR UPDATE SKIP LOCKED`). This ticket lets the worker look at how crowded the queue is (the number of due `PENDING` items, one count query) and, above a threshold, start more runners, never more than a configured maximum in parallel for the instance (a property, for example `app.session.generation.max-runners`, default 1 so nothing changes until it is raised). Extra runners stop when the queue is drained again. The limit also bounds the database connections the runners use (a connection pool of 20, 50 in production, is shared with every request thread).

Decide at pickup: the threshold and how a runner decides to start another (the owner's idea: the fixed runner checks and starts them), whether the extra runners are a pool that grows and shrinks or a fixed set that idles, and what to log or count so the backlog and the number of runners are visible. The first step is a measurement: how long does one slot take, how many slots are due in the worst realistic moment (a restart after hours of downtime), so the threshold is not a guess.

**Out of scope:** The first asynchronous worker, the lock and the queue fixes (SESSION-GROUP-5's hardening); the other scheduled jobs (SESSION-GROUP-7).

**Tests:** An IT with a backlog larger than the threshold proving more than one runner works and never more than the maximum; the connection use stays under the pool.
