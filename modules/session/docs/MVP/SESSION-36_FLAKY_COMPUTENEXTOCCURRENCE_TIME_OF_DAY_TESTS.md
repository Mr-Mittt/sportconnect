# SESSION-36 · `SessionGenerationServiceSpec`'s `computeNextOccurrence` tests are time-of-day-flaky

**Status:** `DONE`
**Type:** Bug Fix (test-only)
**Depends on:** none
**Filed:** 2026-09-17/18, found while running `:modules:session:session-impl:test` repeatedly during
SESSION-34's own verification (not caused by SESSION-34's changes — confirmed via `git diff` that
`SessionGenerationServiceSpec.groovy` had zero changes on that branch when the flake first surfaced).

Two tests in `SessionGenerationServiceSpec` compute their expectations from `LocalTime.now()`/
`LocalDate.now()` at test-run time instead of a fixed clock, so they fail depending on what wall-clock
moment the suite happens to run at:

- `"computeNextOccurrence uses today when today is the target weekday and the time hasn't passed"`
  uses `LocalTime.now().plusHours(2)` — when the real current time is within 2 hours of midnight,
  this wraps to the next day's clock face (e.g. `23:15` + 2h → `01:15`), which the test then treats
  as "hasn't passed today" even though, as a same-day time-of-day value with no date attached, it
  already has. Observed failing consistently in this session when run around `23:xx`.
- `"computeNextOccurrence rolls forward a week when today is the target weekday but the time already
  passed"` — the inverse: observed failing right at/after midnight in this same session, once the
  first test's failure window closed. The exact trigger wasn't isolated within SESSION-34's own time
  budget; both tests share the same root problem (deriving expectations from the real clock instead
  of a fixed one) and should be looked at together.

## Scope

- Rewrite both tests (and audit the rest of `computeNextOccurrence`'s test group for the same
  pattern) to use a fixed, injected `Clock` (or an explicitly fixed `LocalDate`/`LocalTime` passed
  into the method under test) instead of `LocalTime.now()`/`LocalDate.now()`, so results are
  deterministic regardless of when the suite runs.
- Check whether `SessionGenerationService.computeNextOccurrence` itself would need a `Clock`
  injected to make this possible, or whether the tests can fix this purely on their own side by
  controlling the inputs they pass in.

## Out of scope

Any other flaky test in this suite (e.g. SESSION-22's separate, already-filed RabbitMQ
`AmqpIOException` flake in `SessionEventsConsumerIntegrationTest`/`UserFriendEventsConsumerIntegrationTest`
— a different mechanism, already tracked).

## Implementation summary (2026-09-19)

**Resolved the ticket's own open question: no production change needed.** The two flaky tests were
each rewritten to use a fixed **boundary constant** (`LocalTime.MIDNIGHT` / `LocalTime.MAX`) in
place of `LocalTime.now() ± N hours`, rather than injecting a `java.time.Clock` into
`SessionGenerationService`. A `Clock`-injection design was drafted first and walked through in
detail (new `ClockConfig` bean in `server/config`, `Clock` field on the service, fixed clocks in
the spec) but rejected once traced through: it required a real production-code change for what the
ticket itself classifies as a **test-only** bug — the root cause is entirely in how the tests
*construct* their fixtures, not in `computeNextOccurrence`'s own logic (verified against a real
recurrence config, which is always a fixed, human-chosen time like `19:00`, never a value derived
from "now" the way the tests' `LocalTime.now() ± hours` construction was).

**Root cause, precisely:** `LocalTime` has no date component and is documented to wrap arithmetic
around midnight (`minusHours`/`plusHours`'s Javadoc: "the calculation wraps around midnight").
`LocalTime.now().minusHours(1)` at `00:30` yields `23:30` — not "an hour earlier today," but a
*later*-looking clock face on the same bare-time comparison `computeNextOccurrence` does
internally, silently inverting the test's intended before/after relationship. Same inversion,
opposite direction, for `plusHours(2)` within 2 hours of midnight.

**Why a corrected `LocalDateTime`-based subtraction still doesn't fix it (a real alternative
considered and rejected in discussion):** computing `LocalDateTime.now().minusHours(1)` correctly
rolls the *date* back when it crosses midnight — but `computeNextOccurrence` only accepts a bare
`LocalTime`, so the corrected date has to be discarded again at the call site. Worse, deriving the
test's `dayOfWeek` param from that same rolled-back reference silently drifts the test onto a
*different* weekday than today in exactly the edge window that matters, meaning the test would
start (still deterministically, just wrongly) exercising the "different weekday" branch
(`computeNextOccurrence`'s `nextOrSame` 6-days-out path, already covered by the third test in this
group) instead of the "same weekday, time already passed" branch it's supposed to lock in — passing
without proving what it claims to prove, rather than flaking. Traced through with a concrete
`00:30` example before ruling it out.

**The fix that actually works, for 100% of real run times:** don't derive the boundary time via
arithmetic at all.
- `"...time already passed"` test: `LocalTime.MIDNIGHT` (`00:00:00`) — `today @ 00:00:00` is never
  after any real `now()` for the entire day (equal only at the exact first nanosecond), so this
  reliably rolls forward regardless of when the suite runs.
- `"...time hasn't passed"` test: `LocalTime.MAX` (`23:59:59.999999999`) — `today @ 23:59:59...` is
  never before any real `now()` for the entire day, so this reliably stays on today.

Both keep deriving `dayOfWeek` from `LocalDate.now().dayOfWeek` (today) exactly as before — only
the `time` fixture changed, and only via a fixed constant, not arithmetic. The third test in this
group (`"...finds the next matching weekday..."`) uses `LocalTime.NOON` with no `now()`-relative
arithmetic already, doesn't share the wraparound pattern, and was left unchanged after auditing it
per the ticket's own scope.

**Files changed:** `modules/session/session-impl/src/test/groovy/com/sportconnect/session/service/SessionGenerationServiceSpec.groovy`
only — no production code, no new dependency, no new Spring bean.

**Verification:** `:modules:session:session-impl:test` green (full module suite, not just this
spec). `:server:test` — confirmed via a fresh run's `UP-TO-DATE` result that the prior full green
run (248 tests, 0 failures) still stands: this change touches only `session-impl`'s test sources,
which `:server:test`'s task inputs don't depend on, so no server-level `IntegrationTest` class is
affected by construction.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
