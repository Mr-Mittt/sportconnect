# Common Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/common`
**Last updated:** 2026-07-02

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon common mvp` to resume

---

## Implementation Order

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | C1 | Global exception handler for common exception types | `DONE` |

---

## Tickets

### C1 · Global exception handler for common exception types
**Status:** `DONE`
**Type:** Bug Fix — **Critical, application-wide impact**
**Scope:** New class in `modules/common` only — no changes needed at any of the ~100+ existing throw
sites across every module.

**Found while working on U7 (user module) — confirmed by exhaustive search, not guessed:** there is no
`@ControllerAdvice`/`@RestControllerAdvice`/`@ExceptionHandler` anywhere in this codebase, and none of
the 5 shared exception types in `com.sportconnect.common.exception`
(`BadRequestException`, `ForbiddenException`, `UnauthorizedException`, `NotFoundException`,
`ResourceNotFoundException`) carry a `@ResponseStatus` annotation.

**Impact:** every single `throw new BadRequestException(...)` (and the other 4 types) across the
**entire application** — auth, user, sport, social/post, social/group, every ticket built in every
session — currently returns a generic Spring Boot default **500 Internal Server Error** to the client
instead of the intended 400/403/401/404. The business logic correctly decides "this should be a 400,"
but nothing in the stack actually turns that into an HTTP 400 response. This has presumably been true
since these exception classes were first introduced — it's not something any recent ticket introduced,
and it wasn't been caught because backend Spock tests only assert `thrown(BadRequestException)` at the
service layer (correct), never assert the actual HTTP status code the controller layer would return
(the gap).

**Fix:** add a `@RestControllerAdvice` class in `modules/common`
(e.g. `com.sportconnect.common.exception.GlobalExceptionHandler`) with `@ExceptionHandler` methods:

```java
BadRequestException                        → 400 Bad Request
ForbiddenException                         → 403 Forbidden
UnauthorizedException                      → 401 Unauthorized
NotFoundException / ResourceNotFoundException → 404 Not Found
MethodArgumentNotValidException (bean validation failures from @Valid) → 400 Bad Request,
    field-level messages — also currently unhandled, falls through to Spring's raw default error body
    instead of this app's ApiResponse<T> format
Exception (catch-all)                      → 500, generic message — don't leak stack traces to clients
```

Every handler must return the response wrapped in the existing `ApiResponse.error(message)` format
(`modules/common/dto/ApiResponse.java`), for consistency with every success response already using
`ApiResponse.success(...)`.

**Tests:** verify each exception type maps to its correct HTTP status and `ApiResponse` shape. `modules/common`
currently has no test infrastructure for a `@RestControllerAdvice` — scope a minimal `@WebMvcTest`
(or an equivalent MockMvc-based setup against a dummy controller) during implementation to exercise
the advice class in isolation.

**Priority note:** this should be picked up soon relative to other backlog items — it currently means
every intended 4xx response in the entire application is actually a 500 from the API consumer's
perspective (including the frontend, once it starts handling these).
