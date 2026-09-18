# SESSION-36 · `SessionGenerationServiceSpec`'s `computeNextOccurrence` tests are time-of-day-flaky

**Status:** `TODO`
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

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
