# Common Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/common`
**Last updated:** 2026-09-03 (C4 done)

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon common mvp` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [C4](MVP/C4_NO_RESOURCE_FOUND_MAPS_TO_404.md) | Map swallowed Spring MVC exceptions to their real HTTP status (2026-09-03) — `GlobalExceptionHandler extends ResponseEntityExceptionHandler`: no-route → **404**, wrong method → **405**, wrong/absent `Content-Type` → **415**, unacceptable `Accept` → **406**, unreadable body → **400**, path-var type mismatch → **400** (all were **500** via the `Exception` catch-all); one `handleExceptionInternal` override re-envelopes as `ApiResponse`, the two field-specific handlers become `@Override`s to dodge "Ambiguous @ExceptionHandler". Widened at pickup from "404 only". Surfaced by sport A22's smoke test. Green: `:modules:common:test`, full `:server:test`, live smoke | `DONE` |
| 2 | [C3](MVP/C3_TRANSACTIONAL_OUTBOX.md) | Generic transactional-outbox mechanism | `DONE` |
| 3 | [C2](MVP/C2_RESOURCE_GATE.md) | `ResourceGate<T>` — shared availability/visibility check shape | `DONE` |
| 4 | [C1](MVP/C1_GLOBAL_EXCEPTION_HANDLER.md) | Global exception handler for common exception types | `DONE` |
