# Common Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/common`
**Last updated:** 2026-09-03

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
| 1 | [C4](MVP/C4_NO_RESOURCE_FOUND_MAPS_TO_404.md) | `NoResourceFoundException`/`NoHandlerFoundException` → **404** in `GlobalExceptionHandler` (currently fall through the catch-all → **500** for every unmapped path). Pre-existing; surfaced by sport A22's Phase 5 smoke test | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [C3](MVP/C3_TRANSACTIONAL_OUTBOX.md) | Generic transactional-outbox mechanism | `DONE` |
| 2 | [C2](MVP/C2_RESOURCE_GATE.md) | `ResourceGate<T>` — shared availability/visibility check shape | `DONE` |
| 3 | [C1](MVP/C1_GLOBAL_EXCEPTION_HANDLER.md) | Global exception handler for common exception types | `DONE` |
