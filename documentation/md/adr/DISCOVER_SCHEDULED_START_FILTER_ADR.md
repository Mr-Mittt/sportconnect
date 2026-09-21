# ADR: `/discover`'s `scheduledStart` Filtering — `date` / `startTimeFilter` / `startTime`

**Status: Decided (2026-09-21).** See **§0d Final decision** below for the resolution and the two
tickets it produced (**SESSION-37**, **SESSION-39**). Sections 0–0c below are the investigation
trail that led there (real `EXPLAIN ANALYZE` evidence, every query shape tried, the priority
weighting that justified the depth of this investigation) — kept for the record, not superseded,
since the final decision builds directly on their findings rather than replacing them. Originally
written 2026-09-19 while scoping SESSION-37, once that ticket's scope grew mid-pickup from "make
`date` an open-ended lower bound" into "redefine the whole `date`/`startTimeFilter`/`startTime`
request shape."

## 0. Priority weighting — read this before §4

**`/discover` is the single most important feature of the current MVP version (user, 2026-09-19).**
Two stated reasons: it's the MVP's top-priority feature outright, and it's the app's core "find a
game to join" loop — for a social app (Instagram + Meetup + booking marketplace, per root
`CLAUDE.md`), a slow or clunky Discover experience directly costs user retention/engagement. This
changes how the whole §4 comparison should be read on **two** axes, not one:

- **Backend performance is a first-class decision axis for this endpoint specifically**, not a
  tiebreaker to defer "until real usage data exists" the way this repo normally treats a secondary
  endpoint's performance question (e.g. SESSION-29's retention concern was correctly left undecided
  pending real data — `/discover` doesn't get that same benefit of the doubt). §4's performance
  discussion so far has been reasoned about abstractly (Hibernate 6 behavior, query-plan-cache shape
  counts); given this weighting, that reasoning should be **verified against real `EXPLAIN ANALYZE`
  output at realistic MVP data volumes** before the decision is finalized, not accepted on argument
  alone.
- **Perceived UX responsiveness is its own criterion, separate from raw backend query latency.**
  Retention is the actual underlying goal, and a user's felt experience of speed (an instant
  first-paint, progressive/lazy loading) can matter more to that goal than DB-side query time alone.
  This raises the bar for §4c specifically: if its caller-specific-filtering problem (concern 2) can
  be solved, it's the only one of the three options that changes the *shape* of what the user sees —
  instant date-section headers with counts, lazy per-day drill-down — rather than just changing how
  fast one query returns a full page. That's worth weighing against 4c's added complexity more
  seriously than a "wash under a cap" framing would suggest for a less critical endpoint, and
  independently of whichever of 4a/4b/4c wins on raw backend latency.

## 0a. Verification results (2026-09-21) — real `EXPLAIN ANALYZE`, not argument

Per §0's directive, ran real queries against the dev Postgres (`sportconnect_dev`) inside a
transaction seeded with 1,000 synthetic standalone `PREPARING`/`SCHEDULED` sessions (uniformly
spread over the next 30 days, sport ids 1–12, plus ~150 rows given a `JOINED` `session_participants`
row against a test caller so the exclusion subquery had real work to do) — chosen as a reasonable
"early but real" MVP-scale estimate for the *live* discoverable-session subset (not total sessions
ever created). Rolled back afterward — confirmed `sessions` back to 27 rows / `session_participants`
back to 29, zero lasting effect on the dev DB.

| Query | Shape | Execution time | Index used |
|---|---|---|---|
| **List, one specific day** | Full `findDiscoverSessions`-equivalent (every filter, the `openSlots` correlated subquery, `ORDER BY`, `LIMIT 20`), scoped to `[now(), now()+1day)` | **0.163 ms** | `unique_group_session_start` (`group_id, scheduled_start`) — see note below |
| **Count, one specific day** | Same filters, `COUNT(*)`, no sort/limit | **0.080 ms** | same |
| **Count, whole 7-day window, grouped by day** | Timezone-correct (`AT TIME ZONE` + `TO_CHAR` + `GROUP BY 1`, matching `findHistoryDateCounts`'s pattern — the §4d/session-per-day-counting design), same filters, `[now(), now()+7day)` | **1.500 ms** | `idx_sessions_sport_id_standalone` |

**Conclusion: at ~1,000-row realistic MVP scale, none of 4a/4b/4c would be meaningfully bottlenecked
by the DB.** All three query shapes execute in low-single-digit milliseconds or less — negligible
next to ordinary HTTP/network round-trip time (typically tens of ms). This gives §4's "performance
is a wash under a cap" conclusion (4a vs. 4b) real evidence instead of argument, and it directly
weakens §4c concern 1's justification for caching at all: a live, uncached `GROUP BY` count is fast
enough on its own at this volume that avoiding "an expensive query" isn't a strong reason to accept
4c's caller-specific-filtering problem and write-path complexity.

**A genuinely useful, non-obvious finding, not assumed beforehand:** the single-day list/count
queries did **not** use the partial index purpose-built for this (`idx_sessions_sport_id_standalone`,
scoped to `sportId+status+scheduledStart` for standalone sessions) — Postgres chose
`unique_group_session_start` (`group_id, scheduled_start`) instead, because at this data
distribution the date range was more selective than the sport filter, pushing `sport_id`/`status`
into a post-scan `Filter` instead of the index condition. The 7-day grouped count *did* use the
sport-scoped partial index, since grouping across 7 days makes the sport filter relatively more
selective than one day's narrow range. **Which index actually gets used isn't fixed — it depends on
the real selectivity of each predicate, which shifts with data shape** (and will shift again once
`ONGOING` drops from the default status list, per this ticket's own scope item 1, changing the
status predicate's selectivity too). This is exactly the class of thing §0 asked to verify rather
than assume.

**Not yet done:** a higher-volume run (e.g. ~10,000 rows) to check whether timings or index choice
shift meaningfully at larger scale — offered, not yet run. Worth doing before finalizing if any of
4a/4b/4c's decision turns out to be close on other grounds — per §0b's methodology lesson, run with
repeated, order-alternated trials, not a single shot per query shape.

## 0b. Follow-up: is `AT TIME ZONE` itself the cost, or where it's applied? (2026-09-21)

Triggered by a question about why the single-day "count" query (§0a) ran with a plain instant range
instead of Query C's `AT TIME ZONE` treatment. Investigated with real, **repeated** `EXPLAIN ANALYZE`
runs (not single-shot numbers — see the methodology lesson at the end) against the same 1,000-row
seed, rolled back each time.

**Three variants of the single-day count query:**
- **B1** — plain constants: `scheduled_start >= now() AND < now() + interval '1 day'`.
- **B2** — same shape, but the boundary constants are computed *via* `AT TIME ZONE`:
  `scheduled_start >= ((now() AT TIME ZONE zone)::date AT TIME ZONE zone)`, and the upper bound the
  same expression `+ interval '1 day'`. The zone conversion runs once per query execution, on `now()`
  only — `scheduled_start` itself stays bare.
- **B3** — `AT TIME ZONE` applied to the column itself: `(scheduled_start AT TIME ZONE zone)::date =
  (now() AT TIME ZONE zone)::date`.

**B1 vs. B2 — first single-run comparison was misleading; repeated, order-alternated trials show no
real difference:**

| Round | B1 | B2 |
|---|---|---|
| 1 | 0.079 ms | 0.086 ms |
| 2 (order flipped) | 0.072 ms | 0.086 ms |
| 3 | 0.083 ms | 0.075 ms |

No consistent winner — B1 wins twice, B2 once, gap is a few hundredths of a millisecond both ways.
The very first single-shot comparison (0.152ms vs. 0.105ms, in §0a-adjacent testing) suggested B2 was
faster; repeating it with order flipped shows that was noise, not signal, at this row count. Query
plans for B1/B2 are structurally identical — same index (`unique_group_session_start`), same
`Index Cond` shape — there's no structural reason either should consistently win.

**B1 vs. B3 — repeated trials confirm this one *is* real, not noise:**

| Round | B1 | B3 |
|---|---|---|
| 1 | 0.088 ms | 0.301 ms |
| 2 (order flipped) | 0.079 ms | 0.305 ms |
| 3 | 0.070 ms | 0.295 ms |
| 4 | 0.068 ms | 0.294 ms |

B3 clustered tightly around ~0.29–0.30ms across all four rounds — a consistent ~4x gap over B1,
regardless of order. On this run B3's plan didn't even use `idx_sessions_sport_id_standalone` (the
partial index it used in an earlier single-shot run) — it fell back to a flat `Seq Scan` over the
whole table, filtering 1,022 of ~1,027 rows one by one.

**Why the same function (`AT TIME ZONE`) produces opposite outcomes — the real rule:**

The deciding factor isn't "does the query call `AT TIME ZONE`" — it's **which side of the comparison
the function is applied to**:

- **B2** applies it only to `now()` — a constant, computed once per query execution.
  `s.scheduled_start` stays bare on the other side of the comparison. The predicate Postgres sees is
  still `column >= constant AND column < constant`, structurally identical to B1 — any index on that
  column can still be used for a normal range seek, regardless of how complex the constant's own
  computation was.
- **B3** applies it to **the column itself**. The predicate becomes "the output of a function applied
  to the column, compared to a value" — not "the column, compared to a value." A plain btree index on
  `scheduled_start` orders rows by the raw column value, not by `(scheduled_start AT TIME ZONE
  zone)::date` — those aren't the same ordering, and Postgres has no way to use the index for this
  comparison unless a matching **expression index** exists on that exact expression (none does here).
  With no index recording "function of column" order, Postgres must evaluate the function on every
  candidate row and check it — a scan, not a seek.

**The precise, general rule (not just "avoid `AT TIME ZONE` per row" — that's too broad and would
wrongly indict Query C, which is correct):**

- **Filtering/narrowing the row set** (any `WHERE`-clause range or equality condition) → always
  compare a bare column against a precomputed constant. Never wrap the filtering column in a
  function — whether that's `AT TIME ZONE`, `CAST`, or `EXTRACT` (this is the same underlying
  anti-pattern `SessionRepository.findDiscoverSessions`'s own Javadoc already documents as a
  *correctness* bug on the old naive-datetime schema — this is that same anti-pattern's *performance*
  consequence on the current, correctly-typed `TIMESTAMPTZ` schema; two symptoms, one root cause).
  The constant can be computed in Java (`date.atStartOfDay(zone).toInstant()` — SESSION-35's existing
  pattern for `date` today) or in SQL (B2's demonstrated equivalent) — both keep the column bare and
  both are equally index-friendly.
- **Deriving a per-row value from an already-narrowed row set** (a `GROUP BY` key, a computed
  `SELECT`-list column) → per-row computation is fine, sometimes unavoidable, and does not defeat an
  index that already did its job upstream. **Query C does exactly this correctly**: its own `WHERE`
  clause range condition (`scheduled_start >= now() AND < now()+7days`) is a plain bare-column
  comparison against constants — same shape as B1/B2 — which correctly used the sport-scoped partial
  index to narrow to the 7-day candidate set *first*. The per-row `AT TIME ZONE` only appears
  afterward, in the `GROUP BY`/`SELECT` clause, to bucket already-narrowed rows — there's no constant
  to precompute there, since the bucket itself is the thing being derived per row. B3's mistake wasn't
  using `AT TIME ZONE` per row — it's using it *to filter*, where Query C uses it only *to group*.

**Methodology lesson, applies to any future performance claim on this endpoint (§0):** a single
`EXPLAIN ANALYZE` run at sub-millisecond timings is not sufficient to declare a winner — a "first
query in the sequence" effect (precisely explained below), OS scheduling jitter, and the
instrumentation overhead of `EXPLAIN ANALYZE` itself can each swing a result by tens of
microseconds, which is the same order of magnitude as the actual query cost at this row count. The
B1-vs-B2 case above was reported once and looked real (a ~50% gap) until repeated, order-alternated
trials showed it wasn't. Any future performance comparison for `/discover` should run multiple
trials with alternated order before concluding one shape is actually faster than another, not trust
a single run.

**What the "first query in the sequence" effect actually is (verified 2026-09-21, corrects the
"buffer-cache warmth" explanation given initially — real evidence below, not just a data-page-warmup
guess).** Re-ran the same query three times in a row, unchanged, using `EXPLAIN (ANALYZE, BUFFERS,
...)` to see exactly what each run touched:

```sql
EXPLAIN (ANALYZE, BUFFERS, TIMING, SUMMARY)
SELECT COUNT(*) FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= now() AND s.scheduled_start < now() + interval '7 day';
```

Every row-scan `Buffers` line in all three runs showed `shared hit=N`, never `shared read=N` — i.e.
every page was already in memory even on the very first run, because the rows had just been written
moments earlier by `INSERT` **in the same transaction/session**, so there was no disk-level page-in
to warm up. The actual difference was in the `Planning:` block specifically: run 1 showed
`Planning: Buffers: shared hit=134`; runs 2 and 3 showed no `Planning: Buffers` line at all — zero
buffer accesses during planning. That 134-buffer cost is Postgres resolving catalog metadata (which
tables/columns/indexes exist, their types, their statistics — read from `pg_class`/`pg_attribute`/
`pg_statistic`/etc., themselves ordinary tables read through the buffer cache) the first time this
session needs to plan a query against these tables. Once resolved, that metadata is cached in the
**backend process's own local memory** (Postgres's syscache/relcache — per-connection, not shared
with other sessions); every later query in that same session that touches the same tables skips the
lookup entirely, which is exactly what runs 2/3 show.

**This is a DB-*connection*-scoped effect, not a per-query one, and it maps directly onto how the
real app behaves.** Each test script ran as one single `psql` invocation — one TCP connection, one
backend process, for the whole script (seed → all three rounds → rollback) — so "run 1 vs. runs 2/3"
above is a same-connection warmup, not a comparison across separate connections. In production,
Spring Boot's connection pool (HikariCP) maintains a small set of long-lived connections reused
across many HTTP requests, rather than opening a fresh connection per request. Only the rare
first query on a newly-opened pooled connection (pool startup, or replacing one that was closed/idle)
pays the catalog-lookup cost my "run 1" showed; every subsequent request that reuses that same
pooled connection — the overwhelming majority — gets it for free, same as runs 2/3. So this cost is
paid once per connection's entire lifetime (minutes to hours, serving many requests), not once per
request — it amortizes to effectively nothing in aggregate, which is why the warm-round numbers
throughout §0a–§0c are the right ones to treat as representative of typical request latency on this
endpoint, not a cherry-picked best case. A genuinely cold scenario (e.g. a Postgres restart, or a
freshly-opened connection after the pool scaled down) is real but rare, and closer to what an
isolated, un-repeated single run would show — which is exactly why a single run shouldn't be trusted
as the typical case.

### Follow-up test: does the "bare column vs. constant" rule extend to *bucketing*, not just *filtering*?

Tested whether Query C's per-row `AT TIME ZONE`+`TO_CHAR`+`GROUP BY` (§0a) could be replaced with a
"Query D" — 7 precomputed constant day-boundaries (one `WITH bounds AS (...)` CTE, computed once, the
same "constant not column" idea as B2) combined with `SUM(CASE WHEN <bare column> >= const AND <
const THEN 1 ELSE 0 END)` per day, i.e. zero per-row function calls anywhere. Full SQL for both in
§0c below. Three repeated, order-alternated rounds:

| Round | Query C | Query D |
|---|---|---|
| 1 | 3.798 ms *(outlier, see below)* | 0.933 ms |
| 2 (order flipped) | 0.294 ms | 0.578 ms |
| 3 | 0.213 ms | 0.372 ms |

Round 1 is an outlier for **both** (far above either query's own later runs) — the same
"first query in this connection/session" catalog-lookup warmup documented in the methodology lesson
above, not a property of either query shape (see that section for the `Buffers`-backed evidence of
what this actually is). Looking at the two clean, warm comparisons (rounds 2–3): **Query C was
consistently faster than Query D**, the opposite of what the B1/B2/B3 finding might suggest.

**Why this doesn't contradict §0b's rule — it reveals its actual scope.** The earlier finding was
*qualitative*: wrapping the filtering column in a function defeats the index outright (seek → scan).
That's not in play here — both C and D use the identical index for their `WHERE`-clause range
condition (both correctly keep that part bare-column-vs-constant), narrowing to the same ~35
candidate rows first. The difference is only in how those 35 already-narrowed rows get turned into
per-day counts. Query D's `CASE WHEN` evaluates 7 range comparisons **unconditionally, for every
row** (SQL doesn't short-circuit a `CASE` list this way) — 14 comparisons × 35 rows. Query C does one
`AT TIME ZONE`+`TO_CHAR` call per row, then a cheap sort/group over 35 elements. At this row count,
one function call plus a small sort was cheaper than fourteen unconditional comparisons per row.

**Corrected, precise conclusion:** "bare column vs. constant" matters decisively for **filtering**
(B1/B2 vs. B3 — index-defeating, ~4x, structural, confirmed real). It does **not** straightforwardly
extend to **bucketing an already index-narrowed row set** — there, Query C's native approach held its
own against the constants-based alternative at this scale. Both are still sub-millisecond regardless
(this doesn't change §0a's "nothing here is a real bottleneck at MVP volume" conclusion), but Query D
is not a free win the way B2 was, and shouldn't be assumed to be one without testing again if this
matters more at a larger scale than tested here.

## 0c. Verification appendix — every query tried, exact SQL (2026-09-21)

All runs: dev Postgres (`sportconnect_dev`), inside a transaction seeded with 1,000 synthetic
standalone `PREPARING`/`SCHEDULED` sessions (`sport_id` 1–12, `scheduled_start` uniform over the next
30 days) plus 150 `session_participants` rows (`JOINED`, against test caller
`11111111-1111-1111-1111-111111111111`) for the exclusion subquery, then `ROLLBACK` — confirmed
`sessions`/`session_participants` back to their pre-test row counts (27 / 29) after every run, zero
lasting effect on the dev DB. Seed script:

```sql
INSERT INTO sessions (group_id, session_type, created_by, sport_id, title, scheduled_start, status,
                       capacity, fee_type, initial_slot, auto_approve, post_id)
SELECT NULL, 'STANDALONE', md5(random()::text || g)::uuid, (1 + floor(random()*12))::bigint,
       'Synthetic Session ' || g, now() + (random() * interval '30 days'),
       (ARRAY['PREPARING','SCHEDULED'])[1 + floor(random()*2)], 10, 'FREE', 0, false, 900000000 + g
FROM generate_series(1,1000) AS g;

INSERT INTO session_participants (session_id, user_id, status)
SELECT s.id, '11111111-1111-1111-1111-111111111111'::uuid, 'JOINED'
FROM sessions s WHERE s.post_id BETWEEN 900000001 AND 900001000
ORDER BY random() LIMIT 150;
```

**Query A — list, one specific day** (§0a). Full `findDiscoverSessions`-equivalent shape:

```sql
SELECT s.id, (s.capacity - s.initial_slot -
    (SELECT COUNT(*) FROM session_participants sp2 WHERE sp2.session_id = s.id AND sp2.status='JOINED')) AS open_slots
FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id IN (1,2,3)
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= now() AND s.scheduled_start < now() + interval '1 day'
ORDER BY s.scheduled_start ASC, open_slots ASC, s.created_at ASC
LIMIT 20;
```
Result: 0.163 ms (single run, §0a) — used `unique_group_session_start`.

**Query B1 — count, one specific day, plain constants** (§0a/§0b):

```sql
SELECT COUNT(*) FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id IN (1,2,3)
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= now() AND s.scheduled_start < now() + interval '1 day';
```
Results across repeated rounds (§0b): 0.079, 0.072, 0.083, 0.088, 0.079, 0.070, 0.068 ms — used
`unique_group_session_start` every time.

**Query B2 — count, one specific day, `AT TIME ZONE` applied only to the constant boundary** (§0b):

```sql
SELECT COUNT(*) FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id IN (1,2,3)
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AND s.scheduled_start < ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '1 day';
```
Results across repeated rounds (§0b): 0.086, 0.086, 0.075 ms — same index, statistically
indistinguishable from B1 (no consistent winner across order-alternated trials).

**Query B3 — count, one specific day, `AT TIME ZONE` applied to the column itself** (§0b):

```sql
SELECT COUNT(*) FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id IN (1,2,3)
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND (s.scheduled_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
```
Results across repeated rounds (§0b): 0.301, 0.305, 0.295, 0.294 ms — consistently ~4x slower than
B1/B2; plan lost the ability to use `idx_sessions_sport_id_standalone` for the date condition,
degrading to a flat `Seq Scan` filtering 1,022 of ~1,027 rows.

**Query C — count, whole 7-day window, grouped by day, per-row `AT TIME ZONE`** (§0a/§0b, exact SQL
shown above this appendix): 1.500 ms (§0a single run); 3.798 (outlier), 0.294, 0.213 ms (§0b repeated
rounds) — used `idx_sessions_sport_id_standalone`.

**Query D — count, whole 7-day window, grouped by day, precomputed constants + `CASE WHEN SUM`**
(exact SQL shown above this appendix): 0.933 (same outlier round as C), 0.578, 0.372 ms — same index
as C for the `WHERE`-clause range; consistently *slower* than C in the two clean rounds (see the
"Follow-up test" analysis above for why).

### Follow-up: `sport_id = <single value>` instead of `IN (...)`, and combined with `startTimeFilter`

Raised 2026-09-21: Discover is realistically used one sport at a time (via the client's sport
switcher), so `sport_id = 1` is more representative than the `IN (1,2,3)` used in every test above —
and `startTimeFilter` (an inherent per-row `EXTRACT`+`MOD` computation, since "time of day, any date"
has no bare-column range form) is worth racing against both C and D too. Same seed/rollback
methodology as §0c's appendix.

**Query C and D, with `sport_id = 1` and `startTimeFilter AFTER_OR_EQUAL 15:00`
(`zoneOffsetSeconds = 25200`, i.e. `Asia/Ho_Chi_Minh`'s UTC+7 offset, `startTimeAfterOrEqual =
54000` seconds-of-day):**

```sql
-- Query C
SELECT TO_CHAR(s.scheduled_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day_bucket, COUNT(*)
FROM sessions s
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= now() AND s.scheduled_start < now() + interval '7 day'
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000
GROUP BY 1 ORDER BY 1;

-- Query D
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d0
)
SELECT
  SUM(CASE WHEN s.scheduled_start >= b.d0                    AND s.scheduled_start < b.d0 + interval '1 day' THEN 1 ELSE 0 END) AS day0,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '1 day' AND s.scheduled_start < b.d0 + interval '2 day' THEN 1 ELSE 0 END) AS day1,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '2 day' AND s.scheduled_start < b.d0 + interval '3 day' THEN 1 ELSE 0 END) AS day2,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '3 day' AND s.scheduled_start < b.d0 + interval '4 day' THEN 1 ELSE 0 END) AS day3,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '4 day' AND s.scheduled_start < b.d0 + interval '5 day' THEN 1 ELSE 0 END) AS day4,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '5 day' AND s.scheduled_start < b.d0 + interval '6 day' THEN 1 ELSE 0 END) AS day5,
  SUM(CASE WHEN s.scheduled_start >= b.d0 + interval '6 day' AND s.scheduled_start < b.d0 + interval '7 day' THEN 1 ELSE 0 END) AS day6
FROM sessions s, bounds b
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= b.d0 AND s.scheduled_start < b.d0 + interval '7 day'
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000;
```

Results (3 rounds, order alternated): C = 0.979 *(outlier)*, 0.188, 0.101 ms; D = 0.189, 0.138, 0.131
ms. **No consistent winner** — round 2 favors D, round 3 favors C. Both queries now use
`idx_sessions_sport_id_standalone` (unlike the `IN (1,2,3)` tests, where C/D sometimes used
`unique_group_session_start` instead) — `sport_id = 1`'s single-value equality is more selective than
a 3-value list, confirming §0a's "index choice depends on real predicate selectivity" finding with a
second, opposite outcome. The `startTimeFilter` condition appears only in each plan's post-scan
`Filter` (never `Index Cond` — no index supports a time-of-day extraction) but costs little here,
because it only runs against the ~14–16 rows the index already narrowed the set to — confirming
`startTimeFilter` does **not** reproduce B3's regression as long as it's layered on top of an
index-narrowed set rather than being the only thing narrowing the row set.

**Query C and D again, `sport_id = 1`, this time *without* `startTimeFilter`** (same SQL as above,
`AND MOD(...) >= 54000` line removed): C = 0.311 *(outlier)*, 0.095, 0.097 ms; D = 0.179, 0.152, 0.221
ms. **C wins both clean rounds** — same direction as §0b's `IN (1,2,3)` result, more pronounced.

**Reconciling all four C-vs-D results:**

| Sport predicate | `startTimeFilter`? | Winner |
|---|---|---|
| `sport_id IN (1,2,3)` | No | C, consistently (§0b) |
| `sport_id = 1` | No | C, consistently |
| `sport_id = 1` | Yes | No consistent winner — noise |

C's edge over D is real but small (§0b: one function call + a small sort beats fourteen unconditional
`CASE WHEN` comparisons per row). Adding `startTimeFilter` costs both queries the same extra per-row
`EXTRACT`+`MOD` evaluation — that shared, larger cost swamps C's small structural edge into the noise
band, which is why the third row disagrees with the first two rather than contradicting them.

### Follow-up: genuinely non-contiguous dates (§3's actual original problem), plus `startTimeFilter`

Every C-vs-D test above used a *contiguous* 7-day window — the easy case. This test uses 7
**non-contiguous** dates (offsets `0, 2, 5, 9, 14, 20, 29` days from today), which is what §2's
resolved `List<LocalDate>` design and §3's original "OR of N date windows" problem actually describe.
`sport_id = 1`, `startTimeFilter AFTER_OR_EQUAL 15:00` (`zoneOffsetSeconds = 25200`,
`startTimeAfterOrEqual = 54000`), same seed/rollback methodology as the rest of §0c.

**Query C** (per-row `AT TIME ZONE` bucketing, restricted to the 7 dates via `TO_CHAR(...) IN (...)`,
a loose outer 30-day bound added to help the index):

```sql
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d0
)
SELECT TO_CHAR(s.scheduled_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day_bucket, COUNT(*)
FROM sessions s, bounds b
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start >= b.d0 AND s.scheduled_start < b.d0 + interval '30 day'
  AND TO_CHAR(s.scheduled_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') IN (
        TO_CHAR(b.d0, 'YYYY-MM-DD'), TO_CHAR(b.d0 + interval '2 day', 'YYYY-MM-DD'),
        TO_CHAR(b.d0 + interval '5 day', 'YYYY-MM-DD'), TO_CHAR(b.d0 + interval '9 day', 'YYYY-MM-DD'),
        TO_CHAR(b.d0 + interval '14 day', 'YYYY-MM-DD'), TO_CHAR(b.d0 + interval '20 day', 'YYYY-MM-DD'),
        TO_CHAR(b.d0 + interval '29 day', 'YYYY-MM-DD')
  )
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000
GROUP BY 1 ORDER BY 1;
```

**Query D** (7 independently-chosen date constants — not consecutive offsets — each its own bare-column
range, OR'd for filtering and separately `CASE WHEN`-summed for bucketing):

```sql
WITH bounds AS (
  SELECT
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d0,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '2 day' AS d1,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '5 day' AS d2,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '9 day' AS d3,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '14 day' AS d4,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '20 day' AS d5,
    ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') + interval '29 day' AS d6
)
SELECT
  SUM(CASE WHEN s.scheduled_start >= b.d0 AND s.scheduled_start < b.d0 + interval '1 day' THEN 1 ELSE 0 END) AS day0,
  SUM(CASE WHEN s.scheduled_start >= b.d1 AND s.scheduled_start < b.d1 + interval '1 day' THEN 1 ELSE 0 END) AS day1,
  SUM(CASE WHEN s.scheduled_start >= b.d2 AND s.scheduled_start < b.d2 + interval '1 day' THEN 1 ELSE 0 END) AS day2,
  SUM(CASE WHEN s.scheduled_start >= b.d3 AND s.scheduled_start < b.d3 + interval '1 day' THEN 1 ELSE 0 END) AS day3,
  SUM(CASE WHEN s.scheduled_start >= b.d4 AND s.scheduled_start < b.d4 + interval '1 day' THEN 1 ELSE 0 END) AS day4,
  SUM(CASE WHEN s.scheduled_start >= b.d5 AND s.scheduled_start < b.d5 + interval '1 day' THEN 1 ELSE 0 END) AS day5,
  SUM(CASE WHEN s.scheduled_start >= b.d6 AND s.scheduled_start < b.d6 + interval '1 day' THEN 1 ELSE 0 END) AS day6
FROM sessions s, bounds b
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND (
       (s.scheduled_start >= b.d0 AND s.scheduled_start < b.d0 + interval '1 day') OR
       (s.scheduled_start >= b.d1 AND s.scheduled_start < b.d1 + interval '1 day') OR
       (s.scheduled_start >= b.d2 AND s.scheduled_start < b.d2 + interval '1 day') OR
       (s.scheduled_start >= b.d3 AND s.scheduled_start < b.d3 + interval '1 day') OR
       (s.scheduled_start >= b.d4 AND s.scheduled_start < b.d4 + interval '1 day') OR
       (s.scheduled_start >= b.d5 AND s.scheduled_start < b.d5 + interval '1 day') OR
       (s.scheduled_start >= b.d6 AND s.scheduled_start < b.d6 + interval '1 day')
  )
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000;
```

**Timing (3 rounds, order alternated):** C = 0.336, 0.245, 0.253 ms; D = 0.270, 0.278, 0.244 ms — **no
consistent winner** (C wins round 2, D wins round 3 by 0.009ms — noise).

**Why, structurally — the real finding here:** neither query got its date conditions pushed into the
index at all. Query D's own `Index Cond` was just `sport_id = 1 AND status = ANY(...)` — all 7 OR'd
bare-column date-range conditions landed in the post-scan `Filter`, not the index, even though
they're the exact "constant, not column" shape that worked for the index in every earlier test.
Postgres *can* build a `BitmapOr` across multiple index range scans, but at this row count (~70–89
rows match `sport_id`+`status` before any date filtering) its cost estimator judged 7 separate index
probes not worth it versus one scan + a plain per-row filter. Query C's `TO_CHAR`-based condition was
never going to use the index either way (same mechanism as B3), so both queries end up doing the
*same* structural work — one index scan on `sport_id`+`status`, then a per-row filter (7 string
equality checks after one `TO_CHAR` call for C, vs. 7 range-comparison pairs for D) over the same
~65–70 candidate rows, plus `startTimeFilter`'s `EXTRACT`+`MOD` and the exclusion subquery on top.
With everything else now dominating, C's earlier small, real edge (§0b's follow-up test) disappears
into noise — same mechanism as the `sport_id=1`+`startTimeFilter` contiguous-window test above.

**Caveat on test fairness:** Query C's `WHERE` clause included an extra loose outer bound
(`scheduled_start >= d0 AND < d0+30days`) that narrowed its index scan to 65 rows; Query D's `WHERE`
clause had no equivalent outer envelope beyond the 7 discrete ranges themselves, so its index scan
pulled 70 rows. Small, favors C slightly, doesn't change the "no consistent winner" conclusion but
worth disclosing rather than presenting as perfectly matched.

**Correctness cross-check, not just performance — real result sets, both queries, same seed:**

```
Query C:                          Query D:
 day_bucket | count                day0 | day1 | day2 | day3 | day4 | day5 | day6 | total
------------+-------               -----+------+------+------+------+------+------+------
 2026-09-21 |     3                   3 |    3 |    0 |    0 |    1 |    1 |    2 |   10
 2026-09-23 |     3
 2026-10-05 |     1
 2026-10-11 |     1
 2026-10-20 |     2
(5 rows)          total = 10
```
(`day0`=+0d=09-21, `day1`=+2d=09-23, `day2`=+5d=09-26, `day3`=+9d=09-30, `day4`=+14d=10-05,
`day5`=+20d=10-11, `day6`=+29d=10-20.) **Both agree exactly** — same total (10), same non-zero
buckets — a real correctness cross-check between two structurally different queries, not just a
performance comparison.

**A genuine, practical difference this surfaces, unrelated to speed:** Query C's result has only
**5 rows**, not 7 — `day2` (09-26) and `day3` (09-30) had zero matching sessions and a `GROUP BY`
simply never emits a row for an empty bucket. A UI wanting to render all 7 date sections (including
visibly-empty ones) would have to backfill the missing dates against the originally-requested list
itself. Query D's `CASE WHEN SUM` shape returns `day2=0`/`day3=0` as real columns, no backfill
needed — a genuine practical advantage for D having nothing to do with raw execution time (this is
concern D from the earlier "session-per-day counting" discussion, now demonstrated with real data
rather than argued abstractly).

### Two further DB techniques tried against C/D (2026-09-21) — neither won

Tested two additional query shapes against the same non-contiguous-dates/`startTimeFilter`/
`sport_id=1` scenario above, to answer "is there a DB technique that beats both C and D" with
evidence rather than speculation.

**Query E — range/multirange containment** (`scheduled_start <@ tstzmultirange(...)`, Postgres's
native range types, available since v9.2/multirange since v14 — this is v16):

```sql
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d0
)
SELECT COUNT(*)
FROM sessions s, bounds b
WHERE s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND s.scheduled_start <@ (
        tstzmultirange(
          tstzrange(b.d0, b.d0 + interval '1 day', '[)'),
          tstzrange(b.d0 + interval '2 day', b.d0 + interval '3 day', '[)'),
          tstzrange(b.d0 + interval '5 day', b.d0 + interval '6 day', '[)'),
          tstzrange(b.d0 + interval '9 day', b.d0 + interval '10 day', '[)'),
          tstzrange(b.d0 + interval '14 day', b.d0 + interval '15 day', '[)'),
          tstzrange(b.d0 + interval '20 day', b.d0 + interval '21 day', '[)'),
          tstzrange(b.d0 + interval '29 day', b.d0 + interval '30 day', '[)')
        )
      )
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000;
```

Result: **0.396ms — worse than both C and D**, not better. `Index Cond` was only `sport_id = 1 AND
status = ANY(...)` — same as Query D, no index benefit for the containment check itself, because
there's no index support for `scalar <@ multirange` against a plain (non-range-typed) column like
`scheduled_start` — range/multirange GiST indexing accelerates range-vs-range operators when the
*column itself* is a range type, not a scalar tested against a range constant. Worse, the plan
suggests the 7-element `tstzmultirange` gets reconstructed inside the per-row `Filter` rather than
folded to one constant, adding real per-row overhead on top of zero index benefit. **Verdict: not
useful for this problem.**

**Query F — reformulate as a `JOIN` against a 7-row derived table** (`UNION ALL` of the 7 dates)
instead of 7 OR'd conditions or 7 `CASE WHEN`s, hoping Postgres would drive from the 7-row table and
do 7 indexed probes into `sessions`:

```sql
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d0
),
days(start_ts) AS (
  SELECT b.d0 FROM bounds b
  UNION ALL SELECT b.d0 + interval '2 day' FROM bounds b
  UNION ALL SELECT b.d0 + interval '5 day' FROM bounds b
  UNION ALL SELECT b.d0 + interval '9 day' FROM bounds b
  UNION ALL SELECT b.d0 + interval '14 day' FROM bounds b
  UNION ALL SELECT b.d0 + interval '20 day' FROM bounds b
  UNION ALL SELECT b.d0 + interval '29 day' FROM bounds b
)
SELECT d.start_ts::date AS day_bucket, COUNT(s.id)
FROM days d
LEFT JOIN sessions s
  ON s.scheduled_start >= d.start_ts AND s.scheduled_start < d.start_ts + interval '1 day'
  AND s.group_id IS NULL AND s.status IN ('PREPARING','SCHEDULED') AND s.sport_id = 1
  AND s.created_by <> '11111111-1111-1111-1111-111111111111'
  AND s.id NOT IN (SELECT sp.session_id FROM session_participants sp
                    WHERE sp.user_id = '11111111-1111-1111-1111-111111111111' AND sp.status='JOINED')
  AND MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduled_start) * 3600 + EXTRACT(MINUTE FROM s.scheduled_start) * 60
      + EXTRACT(SECOND FROM s.scheduled_start) + 25200 AS integer), 86400) + 86400, 86400) >= 54000
GROUP BY 1 ORDER BY 1;
```

Result: **0.280ms (plain `COUNT`) / 0.250ms (this bucketed `LEFT JOIN` version) — competitive with
C/D, not a clear win either way.** The plan shows why: Postgres chose to drive from `sessions`
(already narrowed to ~21 rows by a `sport_id`-only index scan) as the outer side of a nested loop,
checking each of those 21 rows against the 7 tiny `days` rows via a cheap `Join Filter` — the
*opposite* direction from what would give 7 separate indexed probes into `sessions`. It collapsed
into essentially the same execution shape as Query D (one index scan, then a cheap per-row check),
just phrased as a join. **One real, practical upside, though:** the `LEFT JOIN` + `GROUP BY` version
naturally returns all 7 day-buckets including zero counts (`day2`/`day3` as real `COUNT(s.id)=0`
rows) — the same advantage Query D has over Query C — while being closer to portable, standard SQL
than a hand-rolled `CASE WHEN` pile. The catch: like Query C, this construct (`UNION ALL`-derived
table, or `VALUES`) isn't expressible in plain JPQL — it would need a native query too, so it
doesn't avoid the "must go native" cost §4c's concern 1 already flagged.

**Bottom line: at this scale, neither alternative beats C or D.** Two more techniques flagged as
*theoretically* worth revisiting only if a future higher-volume test shows the current plan choice
becoming a real bottleneck — **not verified, speculative, no evidence gathered for either**:
- A narrower partial index baking `status IN ('PREPARING','SCHEDULED')` directly into the index's
  own predicate (alongside `group_id IS NULL`), rather than `status` being merely an indexed column
  as it is today (see the index audit immediately below) — would shrink the index and exclude
  `COMPLETED`/`CANCELLED`/`ONGOING` rows from it entirely as the table grows.
- Raising `scheduled_start`'s statistics target, which might shift the planner's `BitmapOr` cost
  estimate at a row count where 7 separate index probes genuinely would beat a scan+filter.

### Index audit (2026-09-21) — does a partial index already exclude non-discoverable statuses?

Verified directly against `\d sessions` on the dev DB (not assumed from memory):

```
Indexes:
    "sessions_pkey" PRIMARY KEY, btree (id)
    "idx_sessions_created_by" btree (created_by)
    "idx_sessions_location_id" btree (location_id)
    "idx_sessions_scheduled_status_only" btree (scheduled_start) WHERE status::text = 'SCHEDULED'::text
    "idx_sessions_sport_id_standalone" btree (sport_id, status, scheduled_start) WHERE group_id IS NULL
    "idx_sessions_status_scheduled_start" btree (status, scheduled_start)
    "unique_group_session_start" UNIQUE CONSTRAINT, btree (group_id, scheduled_start)
    "uq_sessions_post_id" UNIQUE CONSTRAINT, btree (post_id)
```

**There is a partial index on status, but it doesn't serve Discover, and the index that *does* serve
Discover isn't partial on status:**
- `idx_sessions_scheduled_status_only` — partial on `status = 'SCHEDULED'` only. Built by
  **SESSION-12** for `SessionGenerationJob`'s own hot queries (`findSessionsToStart`, etc.), not
  Discover. Can't be used for Discover's `status IN ('PREPARING','SCHEDULED')` — a partial index's
  predicate must logically cover the query's condition, and `status = 'SCHEDULED'` doesn't cover "and
  also `PREPARING`," so Postgres can't use it here regardless of query shape.
- `idx_sessions_sport_id_standalone` — the index every C/D/E/F test above actually used. Its partial
  predicate is only `group_id IS NULL`; `status` is an ordinary indexed **column** within it, not
  baked into the predicate. Every standalone session ever created, of any status — including every
  `COMPLETED`/`CANCELLED`/`ONGOING` row that only ever accumulates over time — still lives in this
  index's B-tree today.

**Confirmed: no index currently excludes non-discoverable statuses from its own structure.** The
"narrower partial index" idea two paragraphs above is a real, concrete, not-yet-built opportunity,
not something already in place — worth a future ticket once real data volume makes it worth
measuring, not something to build speculatively now.

## 0d. Final decision (2026-09-21)

User decided, after reviewing §0–§0c's evidence. **This resolves the ADR's entire open question —
§3's original "how do we query an OR of N date windows," §4a/4b/4c's three-way comparison, and §4d's
bounded-default-window visibility-gap deadlock — by splitting scope rather than picking one of the
originally-compared options.**

**The split:** `/discover` reverts to a single required `date` (closer to SESSION-35's original
shape, plus a smart today/future floor) — the "browse many days, see what's out there" job moves to
a **new, separate endpoint**, `SessionCount` (date list, counts only, no session data). Two tickets:

- **SESSION-37** (`modules/session/docs/MVP/SESSION-37_DISCOVER_OPEN_ENDED_DATE_FLOOR.md`) —
  `Session.isPublic` (new column, replaces `groupId IS NULL` as Discover's standalone-session
  predicate), the corrected index redesign (§0c's index audit fed directly into this — see below),
  and `/discover`'s final single-`date` shape.
- **SESSION-39** (`modules/session/docs/MVP/SESSION-39_SESSION_COUNT_ENDPOINT.md`) — the new
  `SessionCount` endpoint, carrying the `List<LocalDate>` (capped at 8, 400 if exceeded) design that
  used to live in `/discover` itself. Depends on SESSION-37 for `isPublic`/the index.

**Why this resolves §4c's caller-specific-filtering deadlock without solving it:** `SessionCount` is
a **live, fully-filtered query**, not a cache — it shares `/discover`'s entire optional-filter set
(sport, title, location, fee, `startTimeFilter`, etc.) precisely so its counts stay accurate against
what `/discover` would actually show on drill-down. No cache means no caller-specific-filtering
problem to solve (§4c concern 2 is moot — there's nothing shared/global that needs per-caller
narrowing after the fact).

**Why this resolves §4d's visibility-gap objection, at least well enough to ship:** `SessionCount`'s
*default* window (no `date` given) is bounded — today + 7 days, 8 total — but a caller can still
request specific dates further out (up to 8 in one call). The gap §4d flagged (a session planned 10+
days out is invisible in the passive default browse) isn't eliminated, but it's no worse than before,
and `/discover` itself was never going to solve it unbounded anyway (§4a/4b's OR-of-N problem was
real work for *any* size cap). The user's actual product call: bounded default + explicit-date
override is an acceptable tradeoff, not a blocking objection — this was a judgment call, not a
technical finding, and the ADR's role was to inform it, not make it.

**The index redesign (§0c's audit, now acted on):** confirmed no index today excludes non-`PREPARING`/
`SCHEDULED` rows from its structure. SESSION-37 implements the correction: swap
`idx_sessions_sport_id_standalone`'s predicate from `group_id IS NULL` to `is_public = true` (same
column list — `is_public` itself is *not* added as a column, since the predicate already guarantees
it, an early version of the user's own proposal got this detail wrong and was corrected in
SESSION-37's own writeup). The user's separately-proposed second index
(`(scheduled_start) WHERE status IN ('SCHEDULED','PREPARING')`) was checked against real consumers
and dropped — neither `SessionGenerationJob` query it might have served is actually multi-status, and
Discover/`SessionCount` both always scope by `sport_id`/`is_public` first, so the redesigned index
(a) already covers them via its `status` column.

**Query style for `SessionCount` (§3's original problem, now SESSION-39's to solve):** user prefers
Query C's style (native `AT TIME ZONE`+`GROUP BY`, §0c), **but explicitly wants it re-verified once
the new index exists** — not assumed to transfer unchanged from this ADR's tests, which ran against
the *old* `group_id IS NULL`-scoped index. SESSION-39 carries this as an explicit implementation-time
re-verification step, not a closed decision.

**What §5's remaining open questions resolve to**, now that the split is decided:
- "Should this inform `/upcoming`'s/`/history`'s `date` params" — still genuinely open, untouched by
  this decision, carried forward as-is if either of those tickets gets picked up.
- Everything else in §5 (the cap size question, 4a vs. 4c, whether to adopt §4d) is superseded by
  this section — resolved via the split, not via picking one of the originally-compared options.

## 1. Context — how we got here

`GET /api/sessions/discover`'s time-based filtering has gone through three prior tickets, each
fixing or reshaping how `scheduledStart` is queried:

- **SESSION-25** introduced `date` (exact single day) and `startTimeFilter`+`startTime`
  (`BEFORE_OR_EQUAL`/`AFTER_OR_EQUAL`, always paired — a 400 if only one is given) as optional,
  AND-combined filters, plus discovered the app's `hibernate.jdbc.time_zone: UTC` write-shift bug
  (see `SessionRepository.findDiscoverSessions`'s Javadoc for the full empirical trail — a `CAST`/
  `EXTRACT` applied directly to `scheduledStart` reads the wrong, un-reapplied value).
- **SESSION-33/34** made `scheduledStart` a true instant (`TIMESTAMPTZ`), closing the write-shift
  bug at the schema level for plain reads, but the query-level `EXTRACT`+offset-correction pattern
  below was kept rather than revisited (HQL has no portable `AT TIME ZONE` operator — see SESSION-35's
  Javadoc note on `function('timezone', ...)` compiling against Postgres but failing on H2).
- **SESSION-35** made `date` **required** and moved both `date`'s day boundary and `startTimeFilter`/
  `startTime`'s time-of-day comparison from the JVM's zone to the caller's own `viewerZoneId`
  (falls back to UTC).
- **SESSION-37** (this ticket, in progress) is now redefining the shape again — see §3.

**Why time-of-day filtering is harder than it looks in this codebase:** `startTimeFilter`/
`startTime` can't be expressed as a plain instant range the way `date` can — "sessions starting at
or after 14:00, on any day" has no single `[start, end)` window. The shipped mechanism
(`SessionRepository.findDiscoverSessions`) reconstructs each row's wall-clock seconds-of-day inside
the query itself:

```sql
MOD(MOD(CAST(EXTRACT(HOUR FROM s.scheduledStart) * 3600 + EXTRACT(MINUTE FROM s.scheduledStart) * 60
    + EXTRACT(SECOND FROM s.scheduledStart) + :zoneOffsetSeconds AS integer), 86400) + 86400, 86400)
    <= :startTimeBeforeOrEqual   -- (or >= :startTimeAfterOrEqual)
```

`:zoneOffsetSeconds` is `viewerZoneId`'s current UTC offset, computed once per request in
`SessionServiceImpl` — correct unconditionally for a non-DST zone, and for any caller whose
candidate sessions fall in the same DST season as "now"; a DST-observing zone with a candidate
session in the *other* DST season is a known, accepted residual gap (see that Javadoc — a real
per-row `AT TIME ZONE` fix was evaluated and rejected as too large a rewrite for that ticket). This
mechanism is unaffected by anything decided in this ADR — it's already date-agnostic per row, which
turns out to matter directly in §3.

`date`, by contrast, has always been expressed as a plain instant range against the bare
`s.scheduledStart` path (no cast/extract) — `[dayStart, dayEnd)` — which is what SESSION-37 is
reshaping.

## 2. SESSION-37's redesign (current state, resolved with the user 2026-09-19)

The ticket's original scope (single required `date` → open-ended lower bound, smart today/future
floor) was superseded mid-pickup by a broader redefinition of the whole payload:

| Param | Before | After (resolved) |
|---|---|---|
| `date` | `LocalDate`, required, exact-day match (SESSION-35) | `List<LocalDate>`, **optional**, exact-day **OR**-match (see below) |
| `startTimeFilter` | optional, must be paired with `startTime` (400 if not) | optional, independently |
| `startTime` | optional, must be paired with `startTimeFilter` (400 if not) | optional, independently |

**`date` (optional list) semantics:**
- Each date is evaluated independently against "today" (`viewerZoneId`, falling back to UTC). A
  date before today is silently dropped — never a 400.
- A survivable date `d` contributes its own window: `d == today` → `[now(), dayEnd(d))` (excludes
  sessions already started today); `d > today` → `[dayStart(d), dayEnd(d))`. A session matches if it
  falls in **any** survivable date's window — OR-combined across the list, not a continuous range.
- If the list is omitted, empty, or every date is in the past → **default discover case**: no date
  restriction beyond `scheduledStart >= now()`, fully open-ended, normal pagination. This is the
  "just browse everything upcoming" path.

**`startTimeFilter`/`startTime` — no longer a strict pair:**
- Both given → unchanged (time-of-day comparison in the given direction).
- `startTime` given, `startTimeFilter` omitted → defaults to `AFTER_OR_EQUAL`.
- `startTimeFilter` given, `startTime` omitted → silently ignored (as if neither given) — the
  existing "must be given together" 400 is removed.
- Neither given → no time-of-day filter, unchanged.
- Stays date-agnostic/per-row (§1's mechanism, untouched) — AND-combines with whichever date
  window(s) are in play, including the open-ended default case.

**Resolved sub-questions carried over from the original scope:**
1. `startTimeFilter`'s meaning across a multi-window result set: time-of-day, across every window in
   play — no query-logic change needed, since §1's mechanism was already date-agnostic.
2. Sort order: unchanged — `scheduledStart ASC`, then open slots `ASC`, then `createdAt ASC`.
3. Past `date` handling: resolved above — silently dropped per-date, not a 400.

**Status list (`ONGOING` drop):** unaffected by this redesign — SESSION-37's original scope item 1
(drop `ONGOING` from `DISCOVER_DEFAULT_STATUSES`, silently strip it from an explicit list rather than
400) stands unchanged.

**Client impact (flagged, not built here):** `useDiscoverSessions.ts` currently always sends
`date=<today>` (SESSION-35's required-param workaround). Under exact-day-list semantics that would
now mean "only today" — the opposite of the open-ended browse this redesign wants. The client needs
to switch to **omitting `date` entirely** for its default browse flow, reserving an explicit list for
a future date-picker/multi-select (tracked as **CLIENT-SESSION-27**). A client backlog ticket for
this switch must be filed before SESSION-37 closes (CLAUDE.md § API Change Discipline) — not just
noted here.

## 3. The open implementation concern: how to query an OR of N date windows

This is the part still under discussion — **no decision has been made.**

The shipped `findDiscoverSessions` is a static JPQL `@Query` string with a fixed parameter count
(one slot per filter, each using the `(CAST(:param AS T) IS NULL OR ...)` null-safe idiom — see that
method's own Javadoc for why the `CAST` is load-bearing against real Postgres). A single optional
`date` fits that idiom trivially (one more null-safe slot). A **list** of independently-survivable
dates, each contributing its own `[start, end)` window OR-combined with the others, does not — the
number of OR clauses needed varies with how many dates survive the request, which a fixed-shape JPQL
string can't express directly.

## 4. Approaches compared so far

### 4a. Capped fixed-slot JPQL (extends the existing idiom)

Add a fixed number of optional date-window slots (e.g. 10: `date1Start`/`date1End` ...
`date10Start`/`date10End`), each independently null-safe and OR'd together; unused slots passed as
`null`. Controller validates `date.size() <= 10` (400 otherwise, or truncate — undecided, moot until
this approach is chosen).

- **Pro:** No new pattern for this codebase — same idiom every other optional filter in this query
  already uses. Query text compiles to exactly one shape, cached once, every request hits that same
  cached plan regardless of how many slots are actually populated.
- **Con:** A hard cap. A caller genuinely cannot filter by more than N specific dates at once (the
  open-ended "no date at all" default case remains truly unbounded — the cap only bites the
  exact-day-list mode).

### 4b. Dynamic `Specification`/Criteria query

Have `SessionRepository` additionally implement `JpaSpecificationExecutor<Session>` and build the
query programmatically via `CriteriaBuilder`/`Predicate` composition instead of a JPQL string —
`.or(survivableDates.stream().map(d -> cb.and(...)).toArray(Predicate[]::new))` naturally handles any
list length.

- **Pro:** Genuinely unbounded date list, no cap.
- **Con — a new pattern for this codebase.** Grepped: nothing under `modules/` uses `Specification`/
  `CriteriaBuilder`/`JpaSpecificationExecutor` today. First use costs: no local precedent to copy,
  larger review surface, and it changes how this query would need to be tested (no SQL string to
  eyeball; would lean on a real/H2 DB round-trip rather than inspecting query text).
- **Con — harder to express `openSlots` as a sortable scalar.** The shipped query does
  `SELECT s, (capacity - initialSlot - COUNT(...)) AS openSlots ... ORDER BY ... openSlots ASC` — a
  correlated subquery in the `SELECT` list, referenced by alias in `ORDER BY` (required by JPQL
  grammar — the subquery can't be inlined directly into `ORDER BY`). Criteria can express this (a
  hand-built `Subquery<Long>` used both as a `Selection` and, separately, to build the `Order`, since
  Criteria has no alias-reuse shortcut) but it's measurably more code and more surface for a subtle
  bug than the JPQL form.
- **Con — harder to keep the documented timezone workarounds readable.** §1's `EXTRACT`+`MOD`
  reconstruction and the `CAST(:param AS T) IS NULL` null-safety trick are currently one inspectable
  SQL-shaped string, cross-referenced against real `psql` output in the existing Javadoc. Expressed
  as nested `CriteriaBuilder` function calls, the same logic becomes a tree of Java method calls —
  same DB behavior, harder to eyeball against actual SQL.

**Performance, compared directly (raised and discussed 2026-09-19):**
- **Query-plan caching:** the old, well-known Criteria pitfall — literal values baked into predicates
  instead of bound parameters defeating Hibernate's query-plan cache (unbounded cache growth, full
  parse+translate cost every call) — is largely moot on this stack. Spring Boot 3.2.0 ships Hibernate
  6.x, which auto-parameterizes literal values in Criteria predicates by default (you'd have to
  explicitly opt into `cb.literal(...)` to defeat it).
- **What still varies is the *count* of OR'd date-window predicates** — each distinct count is a
  distinct cached query shape under Criteria. Bounded by a cap (§4a's N=10, or any cap chosen even if
  4b is the implementation), this is trivial (at most N cache entries). It only becomes a real
  problem **uncapped**: an unusually large date list forces a novel shape every request, causing
  repeated full translation cost and cache thrashing (LRU-bounded, not a leak, but real overhead) —
  and is a mild DoS-shaped input surface regardless of which querying approach is chosen.
- **4a's static JPQL has zero shape variance** — one query, compiled and cached once, forever,
  regardless of how many of the fixed slots are populated at runtime. Strictly cheaper on this one
  axis, but the margin only matters when many distinct shapes would otherwise be generated.
- **Execution-time cost is identical either way.** Once SQL reaches Postgres, an OR of N date-range
  conditions executes the same regardless of whether Hibernate produced that SQL text from a JPQL
  string or built it via `CriteriaBuilder` — same index usage, same query plan on the DB side. This
  isn't where any real difference lives.
- **Conclusion:** if the list stays capped either way, performance is a wash — the deciding factors
  are the non-performance ones above (new-pattern cost, `openSlots` scalar handling, workaround
  readability), not throughput. Performance only becomes a real argument against 4b if the list is
  also made uncapped, which is itself a reason to keep some cap regardless of implementation choice.

### 4c. Sidestep the OR-query entirely — date-section counts (cached) + one-day-at-a-time drill-down

Raised by the user 2026-09-19, **not yet resolved — the caller-specific-filtering problem below is
unsolved; the user is still thinking about it.** Documented here so the discussion trail survives
regardless of where it lands.

**The idea:** don't ask the DB (or any single query) to return sessions across N dates at once.
Instead, split into two tiers, matching a shape that already exists in this exact module:
`SessionServiceImpl.getSessionHistoryDates` (SESSION-27/34) already returns distinct dates + counts
for `/history`, with `GET /history?date=` drilling into exactly one day at a time — no query in that
flow ever needs to OR together multiple days. Discover would get the same shape: a lightweight
"date sections + session counts" response (backed by an in-memory or Redis cache of PREPARING/
SCHEDULED standalone sessions grouped by date, evicted on completion/cancellation) drives the
client's collapsible date-section UI; only the *first* (or first-requested) date's sessions load
eagerly, the rest load on-demand when the user expands that section — each expand becomes its own
single-day request, which is exactly the already-solved `[dayStart, dayEnd)` query shape from
SESSION-35. The hard N-day-OR query from §3 never gets built at all under this approach.

**What's genuinely strong about this:**
- **The two-tier shape has real precedent in this module** — it's not a new pattern, unlike 4b.
  `getSessionHistoryDates`/`getSessionHistory(date)` already proves it out for `/history`.
- **It removes §3's problem instead of solving it.** If a UI only ever expands one date section per
  request, the request-time `date` param arguably reverts to a single optional value, not a list —
  worth reconfirming against §2's resolved `List<LocalDate>` design once this direction firms up.
- Aligns with SESSION-37's whole motivation (browse many days without one giant query) better than
  either 4a or 4b, which both still answer "how do we query many days in one shot" rather than "do
  we need to."

**Open concerns raised, none resolved yet:**
1. **Is a cache even needed, or does `getSessionHistoryDates`'s own precedent argue against one?**
   That method gets its counts from a **plain `GROUP BY` query** (`findHistoryDateCounts`, a native
   query bucketing via `AT TIME ZONE`+`TO_CHAR`), not a cache — and it groups over
   CANCELLED/COMPLETED sessions, presumably a *larger*, ever-growing table, while Discover's
   candidate set (PREPARING/SCHEDULED, standalone only) is exactly the smaller, hot subset
   SESSION-12's partial index (`status = SCHEDULED`) already exists to keep cheap. Whether a live
   grouped-count query is actually too slow for Discover is an `EXPLAIN ANALYZE` question, not
   something to assume — this repo's own precedent (SESSION-29: documented a retention/performance
   concern but deliberately didn't build for it without real usage data) argues for checking before
   reaching for Redis.
2. **Caller-specific filtering — the actual blocker, per the user's own read.** Discover's result
   set isn't global: it depends on the caller's own active sport profiles (`effectiveSportIds`),
   excludes sessions the caller created or already joined, and optionally narrows by `title`/
   `locationId`/`feeType`/`maxFeeAmountVnd`/`minOpenSlots`/`startTimeFilter`+`startTime` — all
   caller- or request-specific, none of which a shared date→session-count cache can encode directly.
   Either the cache only ever holds the *unfiltered* global candidate set and every caller-specific/
   optional filter still has to be applied against it at read time (which may erode most of the
   perf win, since that's the expensive part), or the date-section counts shown are sometimes wrong
   (a section says "N sessions" but fewer are actually joinable/visible once the real per-caller
   query runs on expand) — an explicit product trade-off to accept or reject, not an implementation
   detail to paper over.
3. **Write-path surface, if a cache is still chosen despite (1)/(2).** More mutation sites than
   "evict on complete/cancel" need to keep it honest:
   - `updateSession` currently lets `scheduledStart` change **unconditionally** (unlike `locationId`/
     `feeType`, which are gated to `PREPARING`-only) — a session can *move* to a different date
     bucket mid-life, not just appear/disappear. Needs an evict-old + add-new, not a plain evict.
   - `SessionGenerationService.startOngoingSessions` (SCHEDULED→ONGOING) needs an evict too,
     specifically because this ticket drops `ONGOING` from discoverable statuses (§2's unchanged
     scope item 1) — today that transition has no reason to touch a discover-shaped cache at all.
   - `SessionGenerationJob.closePastSessions`/`cancelUnpreparedSessions`, including the documented
     gotcha that a session with no `scheduledEndAt` skips `ONGOING` entirely and goes straight
     `SCHEDULED`→`COMPLETED` (a different code path than the usual ONGOING-transition evict).
   - Standalone-only (`groupId IS NULL`) — group-linked sessions must never populate this cache;
     worth being explicit so a future change to session creation doesn't silently start feeding it.
4. **In-memory vs. Redis are not interchangeable.** An in-memory cache is per-instance — correctness
   breaks the moment this monolith runs on more than one instance. Redis is already in this stack
   (dev compose; `CommentServiceImpl` already uses `StringRedisTemplate` with `INCR_IF_EXISTS`/
   `DECR_IF_EXISTS` Redis scripts for the same "counter that must survive concurrent writes" shape) —
   if a cache is used at all, Redis is the only correct choice for this app, not a toss-up.

**Where this stands:** not decided. The user is specifically thinking through concern 2
(caller-specific filtering) — that's the one that decides whether caching is viable here at all, as
opposed to a plain per-caller grouped-count query (which would sidestep concern 2 entirely, at the
cost of re-running that query on every request instead of reading a cache).

### 4d. Bounded default browse window (e.g. "next 7 days") — cross-cutting with 4a/4b/4c, NOT RESOLVED

Raised by the user 2026-09-19, discussing what the *default* discover case (no `date` given) should
actually mean, separate from how `date` itself gets queried. **Not resolved — a real, unaddressed
concern was raised against it in the same discussion; do not treat this as decided.**

**The idea:** the hypothesis is that people looking for a session to join generally think in
"the next week or so," not an unbounded future — matching how casual, low-lead-time apps in this
space (Meetup-style pickup games) tend to behave, and consistent with CLIENT-SESSION-25 (the actual
client date-picker ticket) already scoping *single-day* browsing with a next/prev picker, never a
multi-day calendar/range view. If true, the **default** discover case (§2: currently "no date
restriction beyond `scheduledStart >= now()`, fully open-ended") could instead default to a rolling
window (e.g. the next 7 days) rather than truly unbounded.

**Why this would help, if adopted:**
- Turns §3's "OR of N arbitrary dates" problem into "a single bounded range" for the common case —
  4a's list-cap stops being an arbitrary engineering number and becomes a product-meaningful one.
- Weakens the case for 4c's cache: if the realistic default working set is "PREPARING/SCHEDULED
  standalone sessions in the next 7 days," that's small and naturally bounded — plausibly fast as a
  live query even without caching (SESSION-12's partial index on `status = SCHEDULED` already keeps
  this subset hot), which would sidestep 4c's concern 2 (caller-specific filtering) entirely, for
  free, since a live query applies the sport-gate/exclusion/optional filters the normal way.
- Better default UX in its own right — avoids implying the user can infinite-scroll arbitrarily far
  into the future by default.

**The concern raised against it, unresolved:** a session scheduled **outside** the default window
(e.g. created 10+ days out, deliberately planned ahead so the organizer has time to find
participants) would be **invisible in the default browse** until it rolls inside the window — which
directly undercuts the reason someone plans ahead in the first place: they want visibility *now*, to
give people time to sign up, not visibility only once it's already close. This is a real
discoverability/fairness gap for exactly the organizers this feature should serve, not just an edge
case. Partial mitigation: the session isn't literally unreachable — an explicit single-day query
(the date picker, once CLIENT-SESSION-25 ships) could still find it — but that only helps a caller
who already knows to look for that specific date, which is a chicken-and-egg problem for a session
nobody's discovered yet via the passive default browse.

**Where this stands:** genuinely open. Not yet clear whether the right answer is: reject the bounded
default entirely (keep §2's unbounded default, accept whatever query/caching cost that implies);
adopt a bounded default but keep the *full* open-ended query reachable via some explicit
"show me further out" action (not just a single-day picker); surface far-out sessions some other way
(e.g. a separate "starting soon vs. planned ahead" split); or something else not yet proposed. Needs
resolution before it affects §2's "Default discover case" wording or `SESSION-37`'s own ticket text.

### 4d+4a — if the window is adopted, it fits 4a cleanly, and simplifies it further (2026-09-21)

Raised as a question: does a 7-day default window make 4a (capped fixed-slot JPQL) fit well with
Discover's caller-specific filtering (§4c concern 2)? **Yes — but the precise reason matters: 4a was
never exposed to that problem in the first place.** Concern 2 is specific to 4c's *cache* design — a
shared date→count cache can't encode "exclude sessions this caller created/joined," the active-sport
gate, or the optional filters (`title`/`locationId`/`feeType`/`maxFeeAmountVnd`/`minOpenSlots`/
`startTimeFilter`+`startTime`). 4a is a **live SQL query**, same as the shipped
`findDiscoverSessions` today — it applies every one of those filters exactly as it already does, with
nothing new required. A bounded window doesn't fix a problem 4a had; it removes the *other* one
(§3's arbitrary-length OR), which was 4a's actual open issue.

**A further simplification this surfaces:** if the default window is always "the next 7 *consecutive*
days," not 7 dates a caller independently picks, it isn't a list of discrete dates at all — it's a
single **contiguous range** (`scheduledStart >= now() AND < windowEnd`). That needs no OR of N
day-windows, no cap, no `Specification`/Criteria — just the same plain null-safe range idiom already
used everywhere else in `findDiscoverSessions`, and it's actually a reversion toward SESSION-37's
*original*, pre-redesign "inclusive lower bound" shape (§2's opening paragraph), just now with an
upper bound too. Under this framing, §2's `List<LocalDate>` design and §3's OR-query problem would
only still be needed for a genuinely different request shape — a caller picking specific,
*non-contiguous* days (e.g. "next Monday and next Thursday") — and nothing currently scopes that:
CLIENT-SESSION-25 (the real client ticket for this) only asks for single-day browsing with a
next/prev picker, which is already SESSION-35's solved exact-day shape. If that holds, the two
request shapes actually needed narrow to: **(a)** the default bounded window (plain contiguous
range, no OR problem at all) and **(b)** one explicit day (already solved, pre-existing shape) —
with §2's list-based design potentially unnecessary.

**This does not resolve §4d.** The visibility-gap objection (a session planned 10+ days out is
invisible in the default browse until it rolls inside the window) is untouched by this — it's a
product question about what the default *should* show, independent of how cleanly 4a would
implement whichever default gets chosen. This subsection only answers "if the window is adopted,
does 4a work well with it" (yes, cleanly, and more simply than §2/§3 assumed) — not "should the
window be adopted."

## 5. Open questions

- **Concern 2 above (caller-specific filtering) is the open blocker for 4c** — the user is actively
  working through it; update this section once resolved.
- Whether 4c is chosen at all, vs. 4a/4b still answering §3's original "how do we query N dates at
  once" question directly (moot if 4c removes the need to ask that question).
- ~~Per §0: before finalizing any of 4a/4b/4c, get real `EXPLAIN ANALYZE` numbers...~~ **Done, see
  §0a (2026-09-21)** — at ~1,000-row realistic MVP scale, all three candidate query shapes execute in
  low-single-digit ms or less; none of 4a/4b/4c is DB-bottlenecked at this volume. Still open: a
  higher-volume (~10,000-row) re-check, not yet run, to confirm this holds at larger scale.
- **§4d (bounded default browse window) is unresolved, with a real objection on record** — a session
  planned outside the window would be invisible in the default browse until it rolls inside it,
  undercutting exactly the organizers who plan ahead. Do not adopt a bounded default without
  answering this; do not discard the idea either, since it would simplify most of the rest of this
  ADR if the visibility gap gets solved.
- **If §4d resolves toward adoption, revisit whether §2's `List<LocalDate>` design is still needed
  at all** (§4d+4a) — the default case would become a plain contiguous range (no OR problem), and
  the only other shape currently asked for by any real client ticket is a single explicit day
  (already solved). Don't build the list-based query machinery before checking this.
- If 4a (capped) is chosen instead: what should the cap actually be, and should exceeding it 400 or
  silently truncate to the first N? (SESSION-37's own scope-change draft proposed 10 and
  400-on-exceed as a starting point, not yet confirmed.)
- Whether this ADR's eventual decision should also inform `/upcoming`'s and `/history`'s `date`
  params (both explicitly out of scope for SESSION-37 itself, both still single exact-day matches
  today) — not decided, flagged only so a future ticket touching either doesn't have to rediscover
  this discussion from scratch.

## 6. Related tickets/docs

- `modules/session/docs/MVP/SESSION-37_DISCOVER_OPEN_ENDED_DATE_FLOOR.md` — the ticket this ADR was
  spun out of; carries the full scope-change history and resolved request-shape design (§2 above is a
  condensed mirror of that ticket's own "Scope change" section — keep the two in sync).
- `modules/session/docs/MVP/SESSION-35_DISCOVER_CALLER_ZONE_FILTERS.md`,
  `SESSION-34_HISTORY_DATE_COUNTS_AT_TIME_ZONE.md`, `SESSION-33_SCHEDULEDSTART_TRUE_INSTANT.md` —
  the three prior tickets that shaped `scheduledStart`'s current representation and query mechanics
  (§1).
- `SessionRepository.findDiscoverSessions`'s own Javadoc — the canonical, most detailed record of the
  timezone/EXTRACT/MOD mechanics summarized in §1.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
