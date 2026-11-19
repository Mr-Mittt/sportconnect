# SESSION-GROUP-7 · The scheduled session jobs have no lock for more than one server instance

**Status:** `TODO`
**Type:** Enhancement (Architecture) · **Depends on:** none
**Filed:** 2026-11-19, found in the review of SESSION-GROUP-5's generation queue (owner asked whether the queue supports several pods): the queue itself is made safe by SESSION-GROUP-5's hardening (row lock with `SKIP LOCKED`, race-free insert), but the three jobs of `SessionGenerationJob` run on every instance with nothing to stop them overlapping.

`SessionGenerationJob` runs `startOngoingSessions`, `closePastSessions` and `cancelUnpreparedSessions` every 15 minutes (`@Scheduled`). With two or more server instances each one runs them. They were written for one instance: each reads the sessions that are due, changes them and writes the outbox rows (`session.status.started`) and system comments, with no row lock and no leader election (no ShedLock or similar). Two instances can read the same due session, so the same session can be started twice, tell its players twice, and get two system comments; `closePastSessions` also publishes `RegularSessionsEnded`, which the generation queue handles idempotently, so that part is harmless.

Pick one way and apply it to the three jobs: a scheduler lock (a lock row in the database, taken per job run, that only one instance can hold), or a row lock on the due sessions (`FOR UPDATE SKIP LOCKED`, the same as the generation queue), or run the jobs on one designated instance. The choice depends on how production will scale (today it is one box, INFRA). First step: reproduce the double start with two threads in an IT, then fix it.

**Out of scope:** The generation queue (done in SESSION-GROUP-5's hardening); any other `@Scheduled` job outside the session module.

**Tests:** An IT that runs two job runs concurrently and proves a session is started, and its players told, once. Verify against real Postgres if the chosen lock needs it (the ITs use H2).
