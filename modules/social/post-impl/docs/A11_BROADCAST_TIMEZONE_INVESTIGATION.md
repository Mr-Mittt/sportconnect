# A11 · Broadcast-expiry timezone mismatch — investigation, closed not reproducible

**Status:** DONE (2026-08-10) — closed as not reproducible, no code change
**Type:** Bug Fix (originally filed) → Investigation

## Original ticket

Filed 2026-08-07 (found 2026-07-17 during client ticket FEED-9's QA/acceptance checklist).
Claimed: `broadcastEndTime` is validated/defaulted using the application server's JVM-local clock
(`LocalDateTime.now()`, observed at UTC+7 in dev), but Postgres's `CURRENT_TIMESTAMP` (used by
`PostRepository.existsActiveGroupBroadcast`/`findActiveBroadcasts` to decide whether a broadcast
is still active) runs in UTC — supposedly causing a broadcast set a few seconds in the future to
read as already-expired immediately after creation.

**Original live-verification data:**
- Sent `broadcastEndTime: "2026-07-17T11:18:45"` (~8s after the app server's own `now()`,
  `11:18:37`) — passed the "must be in the future" check.
- Row landed in Postgres as `broadcast_end_time = 2026-07-17 04:18:45` — 7 hours earlier than the
  literal value sent, while Postgres's `NOW()` at the same moment was `2026-07-17 04:19:32`.
  `broadcast_end_time > CURRENT_TIMESTAMP` evaluated `false` immediately.

## Why this was picked up for re-investigation

While confirming the fix approach (during a `/workon post mvp` session, 2026-08-10), a question
about the exact mechanics of the proposed UTC-normalization fix ("wouldn't a correct UTC
conversion actually preserve the intended delta?") led to checking `application.yml` before
writing any code. It has:

```yaml
spring:
  jpa:
    properties:
      hibernate:
        jdbc:
          time_zone: UTC
```

`git blame` confirmed this line has been present since the repo's **initial commit** (`16a7cd4`,
2026-03-03) — not a later undocumented fix, not something recently added. This setting makes
Hibernate treat a naive `LocalDateTime` parameter as a JVM-local wall-clock reading and convert it
to the true corresponding UTC instant before binding it to the JDBC statement — meaning the write
path should already be doing exactly the kind of normalization the ticket's proposed fix called
for, today, unconditionally.

That contradicted the ticket's premise, so rather than implement a fix for a bug that might not
exist, the bug was re-verified empirically first.

## Empirical reproduction (against real dev Postgres, not mocked)

1. Registered a test user, created a sport profile and a group (owner), started the real backend
   (`:server:bootRun`) against the live `sportconnect_dev` Postgres container.
2. At real local time `14:30:28` (UTC+7 host, confirmed via `date`), `POST /api/posts`
   (`GROUP_BROADCAST`) with `broadcastEndTime: "2026-08-10T14:30:58"` (30s later, local wall-clock
   — a longer window than the original 8s, specifically to control for request/test latency).
3. Immediately inspected the raw row:
   ```
   created_at          = 2026-08-10 07:30:28.716024
   broadcast_end_time  = 2026-08-10 07:30:58
   ```
   Both correctly shifted by exactly the UTC+7 offset — i.e. both are the **true, correct UTC
   instant** corresponding to the local wall-clock values sent/computed. `created_at`'s value was
   cross-checked against the host's actual `date -u` reading at that moment and matched.
4. Checked while still inside the window (UTC `07:30:39`, 19s before expiry):
   `is_still_active = true` (direct SQL `broadcast_end_time > NOW()`), and
   `GET /api/posts/broadcast?groupIds=47` correctly returned the post as active.
5. Checked after the real window elapsed (UTC `07:31:43`, 45s after expiry):
   `is_still_active = false`, and the same endpoint correctly returned it as no longer active
   (empty result).

No premature or incorrect expiry occurred at any point — the full lifecycle tracked correctly
against real wall-clock time, end to end, through the real controller/service/repository/Postgres
stack.

## Root cause of the original report (most likely)

The original test used an **8-second** validity window and captured Postgres's `NOW()` reading
**47 seconds after** the intended expiry — i.e. ~55 real seconds elapsed between the `POST` and
the follow-up verification check. An 8-second window is razor-thin for manual `curl`/`psql`-based
testing (typing commands, switching windows, etc.). The broadcast most likely just genuinely
expired during ordinary test-timing lag — a timing artifact of the verification method, not a
timezone bug in the code. This re-investigation used a 30-second window and checked at controlled,
known offsets specifically to rule this out, and found no discrepancy.

## Secondary correction

The original ticket also framed part of the risk as needing a *future* ticket to "expose the
existing-but-unused `updateBroadcastEndTime` service method to a real endpoint/client call." That
endpoint already exists today — `PATCH /api/posts/{postId}/broadcast-end-time`
(`PostController.java:160-169`), gated to group owner/admin, `ROLE_USER` — it just has no client
UI caller yet (confirmed via grep, nothing in `client/src` references it). This doesn't change the
conclusion (the endpoint's own validation, `PostServiceImpl.updateBroadcastEndTime` line 555, uses
the same correctly-UTC-normalized `LocalDateTime.now()` comparison and works correctly), but the
"not yet reachable" framing in the original ticket was factually wrong.

## Why no test was added

The original ticket's own "Tests" section called for a `server:test`-level integration test. This
was deliberately **not added**: `:server:test` runs against H2 in-memory
(`application-test.yml`: `jdbc:h2:mem:testdb;MODE=PostgreSQL`, with `spring.liquibase.enabled:
false` — a hand-written `schema.sql` instead). H2 is an in-process embedded database with no
separate server process or timezone configuration of its own — its `CURRENT_TIMESTAMP` reads the
same JVM clock the application code already uses for `LocalDateTime.now()`. This specific bug
class — an application-JVM clock disagreeing with a *separate*, independently-clocked DB server —
structurally cannot be reproduced or regression-tested against H2: a test written there would pass
today, and would keep passing even if `hibernate.jdbc.time_zone: UTC` were later removed entirely,
because both sides of any comparison would still be reading the same in-process JVM clock. Adding
such a test would create false confidence rather than real protection, so it was flagged as a
testing-infrastructure limitation instead of worked around.

If this class of bug ever needs automated regression coverage, it would require either a
Testcontainers-backed Postgres test (like the empirical verification done manually here, but
automated) or an explicit assertion on the exact SQL Hibernate generates — neither was judged
worth the added test-infrastructure complexity for a bug that, per this investigation, doesn't
currently exist.

## Outcome

- **No production code changed** — nothing was broken.
- **No test added** — see above.
- Ticket closed `DONE` (investigated, not reproducible) rather than left `TODO` indefinitely or
  silently dropped, so the investigation and its evidence are preserved for anyone who
  re-encounters similar symptoms in the future.
- The general observation that "JPQL `CURRENT_TIMESTAMP` against a `LocalDateTime`-typed column is
  a fragile pattern in principle" remains true and worth remembering in code review — but
  `hibernate.jdbc.time_zone: UTC` already covers every existing usage of that pattern in this
  codebase correctly today, confirmed by grep (`existsActiveGroupBroadcast`/`findActiveBroadcasts`
  are the only two `CURRENT_TIMESTAMP` usages compared against a `LocalDateTime` column in the
  repo).
