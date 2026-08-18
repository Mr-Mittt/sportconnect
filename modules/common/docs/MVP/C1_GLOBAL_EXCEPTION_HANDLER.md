# C1 · Global exception handler for common exception types

**Status:** DONE
**Module:** `modules/common`
**Date:** 2026-07-03

## Design

Plan as approved before implementation:

1. **`modules/common/build.gradle`** — add `plugins { id 'groovy' }` and the same Spock test stack
   already used elsewhere (`spring-boot-starter-test`, `spock-bom`/`spock-core`/`spock-spring`,
   `groovy`, `mockito-core`) — this module had zero test infrastructure before this ticket.
2. **New class** `com.sportconnect.common.exception.GlobalExceptionHandler` (`@RestControllerAdvice`):
   - `BadRequestException` → 400, `ForbiddenException` → 403, `UnauthorizedException` → 401,
     `NotFoundException`/`ResourceNotFoundException` → 404 — each wrapped in
     `ApiResponse.error(e.getMessage())`.
   - `MethodArgumentNotValidException` → 400, wrapped in
     `ApiResponse.error("Validation failed", fieldErrorsMap)` using the existing
     `ApiResponse.error(message, data)` overload — `data` is a `Map<String, String>` of
     field → message.
   - Catch-all `Exception` → 500, generic message only (`log.error` the real exception
     server-side, don't leak it to the client).
3. **Tests** — MockMvc **standalone setup**
   (`MockMvcBuilders.standaloneSetup(dummyController).setControllerAdvice(new GlobalExceptionHandler()).build()`)
   rather than `@WebMvcTest`/`@SpringBootTest`, since `modules/common` has no
   `@SpringBootConfiguration` of its own for those annotations to find. A small test-only dummy
   `@RestController` with one endpoint per exception type, plus one `@Valid @RequestBody` endpoint
   to trigger a real `MethodArgumentNotValidException` naturally (rather than hand-constructing one,
   which would need a fake `BindingResult`).

**Verified before implementing:** confirmed `SportConnectApplication`'s
`@SpringBootApplication(scanBasePackages = "com.sportconnect")` scans the entire package tree
including `common.exception`, and `@RestControllerAdvice` is meta-annotated `@Component` — so the
new handler is auto-registered with **zero wiring changes anywhere else**, exactly as the ticket's
stated scope claimed (confirmed by reading `SportConnectApplication.java` directly, not assumed).

No divergence — implementation matched the plan exactly.

## What was built

- `modules/common/build.gradle`: added the `groovy` plugin and full Spock/MockMvc test dependency
  stack (mirrors `group-impl`'s existing build.gradle test setup).
- `GlobalExceptionHandler.java`: 6 `@ExceptionHandler` methods as designed above, each returning
  `ResponseEntity<ApiResponse<...>>` with the correct status code.
- `GlobalExceptionHandlerSpec.groovy`: 7 tests, one per exception type/scenario, all against a
  test-only `DummyController` + a `SampleRequest` DTO with a `@NotBlank` field for the validation
  test.

## Key decisions

- **Field errors as a `Map<String, String>` in the response `data`**, not folded into the top-level
  `message` string — a validation failure can touch multiple fields, and the frontend needs to know
  *which* field(s) failed to show inline errors, not just a combined sentence.
- **The catch-all handler never exposes `e.getMessage()` to the client** — deliberately different
  from the other 5 handlers (which do expose their message, since those are all intentional,
  caller-safe business exceptions). An uncaught `Exception` is by definition unexpected and may
  carry internal details (SQL errors, null pointer contexts, etc.) that shouldn't reach an API
  consumer.
- **MockMvc standalone setup, not `@WebMvcTest`** — `modules/common` is a library module with no
  `@SpringBootApplication`/`@SpringBootConfiguration` of its own, so slice-test annotations that
  require one would fail here. Standalone setup needs no Spring context at all, matching this
  module's nature.

## Non-obvious constraints

- **Scope was genuinely just one new file** — no changes needed at any of the ~100+ existing
  `throw new BadRequestException(...)` (etc.) call sites across every other module, confirmed both
  by the ticket's own audit and by this implementation requiring no such changes.
- This is the **first test infrastructure of any kind** in `modules/common` — prior to this ticket
  the module had no `src/test` directory at all.

## Tests

`GlobalExceptionHandlerSpec.groovy` — 7 tests: one per exception type (`BadRequestException`,
`ForbiddenException`, `UnauthorizedException`, `NotFoundException`, `ResourceNotFoundException`),
one for `MethodArgumentNotValidException` (asserts both the top-level message and the field-level
error in `data`), and one for the generic-`Exception` catch-all (asserts the real exception message
is *not* what's returned).

Run: `./gradlew :modules:common:test` — all 7 pass (confirmed via the JUnit XML report:
`tests="7" skipped="0" failures="0" errors="0"`). `./gradlew build -x test` succeeds for the entire
project (all modules, confirming the new `common` test dependencies don't break anything
downstream). `./gradlew :server:compileJava` succeeds. `:server:bootRun` reaches the expected
local-Postgres connection failure (no local Postgres running in this sandbox) — this happens before
the full Spring context (and therefore the `@RestControllerAdvice` bean registration) can be
observed end-to-end in the real running app; the isolated MockMvc tests are the verification for
this ticket's actual logic, and the component-scan reasoning above is the verification for
auto-registration, but neither is a substitute for a real end-to-end request against a running
server. Recommend hitting a real endpoint that throws one of these exceptions (e.g. an existing
404/400 case in any module) against a live Postgres instance to see the corrected status code and
`ApiResponse` body before considering this fully closed in production.

---

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

---
