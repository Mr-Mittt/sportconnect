# SESSION-GL-PERF-61 · Benchmark the session records change-set API against real Postgres

**Status:** `TODO`
**Type:** Testing
**Depends on:** SESSION-50 (merged 2026-11-13, PR #437)
**Filed:** 2026-11-13, owner asked to benchmark the add/update/delete API after SESSION-50 merged. Its ITs run on H2, so row-lock behaviour, plan shapes and real latency under concurrent writers were never measured.

Measure `POST /api/sessions/{id}/records/changes` and `GET /api/sessions/{id}/records` on a real server (`bootRun`) against the dev Postgres, driven by a k6 script, and record the numbers. Used by the dev team; entry point is a script under `infra/scripts/` (name chosen at pickup, port checked against `infra/documentation/PORTS.md`). No behaviour change: this ticket produces measurements and a results doc, not tuning.

Scenarios, each reporting p50/p95/p99 latency, requests per second and error count:
1. Add 1 record; add 50 small records (the operation cap).
2. Update 1; update 50.
3. Delete 1; delete 50.
4. Mixed change set (adds, updates, deletes together).
5. Change set with rejected items (bad record, player not JOINED, limit reached) beside valid ones.
6. Retry replay: the same `clientRef` sent again.
7. Session already holding 100 and 500 records (the `maxRecords` default and ceiling): add, update and `GET`, to see the cost of the count and `findForUpdate` queries.
8. Concurrency: N parallel change sets on one session (distinct ids, update vs delete of the same record), and the same on many sessions at once. Include two identical `clientRef` requests at the same instant, the known gap from SESSION-50 (the unique constraint may surface as a 500): record what happens.

Also record, per scenario: SQL statements per request (no N+1), `EXPLAIN (ANALYZE)` of the count, lock and replay queries at 500 rows, and any row-lock waits. Run locally first (JWTs for a handful of dev Keycloak users, a throwaway sport with a result schema and an ONGOING session with JOINED participants; remove it all afterwards). A second run on the Oracle box is a follow-up, not part of this ticket.

Account lifecycle: no new endpoint; the script uses active users only. No notification use case. No client-visible enum or type changes.

**Out of scope:** tuning or fixing anything found (a finding becomes its own ticket); target budgets or pass/fail gates; the Oracle production run; the chat-command path; a CI job.

**Tests:** none beyond the script. Output: `modules/session/docs/SESSION_RECORDS_BENCHMARK.md` with the numbers, machine, data sizes, k6 version and commit, summarized into `PROGRESS.md` when the ticket closes.
