# C4 · Map swallowed Spring MVC exceptions to their real HTTP status (not 500)

**Status:** `DONE` (2026-09-03)
**Module:** `modules/common`
**Type:** Bug Fix — application-wide
**Filed:** 2026-09-03 — found during sport **A22** Phase 5 live smoke test (see
`modules/sport/sport-impl/docs/MVP/A22_CALLER_SCOPED_SPORT_PROFILE_READS.md`). Filed immediately per
CLAUDE.md § API Change Discipline ("file any follow-up ticket the moment it comes out").
**Depends on:** none. Extends C1's `GlobalExceptionHandler`.

## Scope change — 2026-09-03 (at pickup, `/workon` Phase 1 gate)

Originally filed as "`NoResourceFoundException` → 404 only". **Widened at pickup (user decision):**
`GlobalExceptionHandler`'s broad `@ExceptionHandler(Exception.class)` catch-all swallows *every*
standard Spring MVC framework exception into a generic **500**, not just the no-handler one. C1
already had to hand-patch two of them back (`MethodArgumentNotValidException` → 400,
`MissingServletRequestParameterException` → 400) as they were discovered one at a time. This ticket
now fixes the whole class in one pass instead of waiting for each to bite.

## Problem

`GlobalExceptionHandler` (C1) is a plain `@RestControllerAdvice` with a handful of explicit
`@ExceptionHandler` methods and a catch-all `@ExceptionHandler(Exception.class)` → **500**. Any
Spring MVC exception it doesn't explicitly list hits that catch-all and becomes
`500 "An unexpected error occurred"`, even though Spring's own machinery would have mapped it to a
correct 4xx.

Confirmed live (A22 Phase 5, fresh server): `GET /api/sports/nonsense` and the routes A22 removed
→ **500** (`NoResourceFoundException` caught by `handleGeneric`). The same swallowing applies to:

| Spring MVC exception | Correct status | Realistic trigger |
|---|---|---|
| `NoResourceFoundException` / `NoHandlerFoundException` | **404** | typo'd / renamed / removed endpoint (the A22 case) |
| `HttpRequestMethodNotSupportedException` | **405** | `POST` to a `GET`-only path |
| `HttpMediaTypeNotSupportedException` | **415** | body with no / wrong `Content-Type` |
| `HttpMediaTypeNotAcceptableException` | **406** | `Accept` header nothing can satisfy |
| `HttpMessageNotReadableException` | **400** | malformed / empty JSON request body |
| `MethodArgumentTypeMismatchException` / `TypeMismatchException` | **400** | `/sport/abc` where a `Long` is bound — **today this is 500**, and A22's write-up wrongly assumed it was already 400 |
| `MissingServletRequestPartException` | **400** | missing multipart part |
| `MissingPathVariableException` | 500 (genuinely server-side — a mapping bug) | leave as 500, but via an explicit handler so the envelope is still `ApiResponse` |

This is **pre-existing** — not introduced by A22, which only made two specific no-handler paths
(both with zero consumers per its census) hit the existing behaviour, and the smoke test surfaced
it.

## Fix

**Approach (confirm in Phase 3):** make `GlobalExceptionHandler extends
ResponseEntityExceptionHandler` — Spring's purpose-built base class that already has a correct
`@ExceptionHandler` for every standard MVC exception. Override the single funnel method
(`handleExceptionInternal`, called by all of them) to replace Spring's `ProblemDetail` body with
`ApiResponse.error(<message>)` so every response in the app keeps one envelope. The existing custom
handlers (`BadRequestException`, `ForbiddenException`, `AccessDeniedException`,
`UnauthorizedException`, `NotFound`/`ResourceNotFound`, the field-map `MethodArgumentNotValidException`,
`MissingServletRequestParameterException`, and the `Exception` catch-all) stay — a subclass
`@ExceptionHandler` for a type the base also handles must be verified to win cleanly, not raise
"Ambiguous @ExceptionHandler" (the `MethodArgumentNotValidException` / `MissingServletRequestParameterException`
overlap is the risk — reconcile by keeping our versions and, if needed, `@Override`-ing the base
method signature rather than re-declaring `@ExceptionHandler`).

Fallback if `ResponseEntityExceptionHandler` reconciliation proves messy: add explicit
`@ExceptionHandler` methods for exactly the table above, same style as C1's existing ones. Decide
in Phase 3.

- Generic messages only — never echo the raw path, the offending method, or Spring's internal text.
- No new `@ResponseStatus` exception classes — explicit `ResponseEntity.status(...)` /
  `ApiResponse.error(...)`, consistent with C1.

## Consumer census (do at pickup)

This changes the HTTP status of currently-unmapped/misbound requests from 500 → their real 4xx.
Anything asserting `500` / `5xx` for a *deliberately* bad request must be updated.

- Grep `server/src/test` for `is5xxServerError`, `isInternalServerError`, `.value(500)`,
  `status().is(500)` — list each, mark compatible / updated-here / deferred.
- Grep `client/` (`src`, `e2e/mocks`, `*.test.tsx`, `*.spec.ts`) for handlers or assertions keyed
  on `500` for a bad path / bad method / bad body.
- A22's `SportProfileResumeAndVisibilityIntegrationTest` asserts only the *new* paths — unaffected.
- No `-api` signature, DTO field, DB column, or client-mirrored enum changes — this is status-code
  mapping only. `ApiResponse` shape is unchanged (`success:false, message, data:null`).

## Tests

- `GlobalExceptionHandlerSpec.groovy` (standalone MockMvc, `DummyController`) — one case per row in
  the table: no-handler path → 404; wrong method → 405; wrong `Content-Type` → 415; unreadable body
  → 400; type-mismatch path var → 400. Each asserts the status **and** the `ApiResponse` envelope
  (`success:false`, generic message, `data` null). May need
  `setThrowExceptionIfNoHandlerFound(true)` / a dispatcher-servlet customizer on the standalone
  builder for the 404 case — sort out during implementation (same "C1 had no test infra" spirit).
- One backend IT (`server/src/test/java/.../integration/`) through the real pipeline: a genuinely
  unmapped `/api/...` path → 404; a real endpoint hit with the wrong method → 405; a real
  `@RequestBody` endpoint with a broken JSON body → 400.

## Out of scope

- Restoring the two routes A22 removed — gone by design.
- Changing the 5 business-exception handlers' status or message (`BadRequestException` etc.) — only
  the *Spring MVC* exceptions are in scope.
- A structured "did you mean" / RFC-7807 `ProblemDetail` body — the app's envelope is `ApiResponse`;
  keep it.
- `AccessDeniedException` handling — already correct (A9).

---

## Implementation summary (2026-09-03)

### Approved design

`modules/common` only — no migration, entity, repository, `-api`, DTO, controller, or SecurityConfig
change; `ApiResponse` shape unchanged.

| Part | Change |
|---|---|
| `GlobalExceptionHandler` | now `extends ResponseEntityExceptionHandler` (Spring's purpose-built base with a correct `@ExceptionHandler` for every standard MVC exception — verified the full 6.1.1 type list via `javap`). Our 5 business-exception handlers + `AccessDeniedException` + the `@ExceptionHandler(Exception.class)` → 500 fallback kept verbatim. |
| `handleValidation` / `handleMissingParameter` | **removed as standalone `@ExceptionHandler` methods** (declaring `@ExceptionHandler(MethodArgumentNotValidException.class)` while inheriting the base mapping for the same type throws `IllegalStateException: Ambiguous @ExceptionHandler method mapped` at context startup). **Re-expressed as `@Override` of the base `protected handleMethodArgumentNotValid` / `handleMissingServletRequestParameter`** — same bodies as before (field → message map; `"<name> is required"`). Overriding adds no new mapping, so no ambiguity. |
| `handleExceptionInternal` (new `@Override`) | the single funnel every base handler routes through. If `body` is already an `ApiResponse` (built by the two overrides above) → pass through untouched. Otherwise → replace Spring's `ProblemDetail`/null body with `ApiResponse.error(genericMessageFor(statusCode))`. Logs at `error` when `statusCode.is5xxServerError()`, for parity with `handleGeneric`. |
| `genericMessageFor(HttpStatusCode)` (new private) | fixed per-status text — `400 → "Malformed request"`, `404 → "Resource not found"`, `405 → "Request method not supported"`, `406 → "Not acceptable"`, `413 → "Request too large"`, `415 → "Unsupported media type"`, `503 → "Service temporarily unavailable"`, 5xx → `"An unexpected error occurred"`, else the status reason phrase. **Never `ex.getMessage()`** for these — it can carry the offending path, header value, or Jackson parser internals. |

Net effect — every row below was **500** before:

| Trigger | Exception | Status now |
|---|---|---|
| No route (typo / removed / renamed) | `NoResourceFoundException` / `NoHandlerFoundException` | 404 |
| Wrong HTTP method | `HttpRequestMethodNotSupportedException` | 405 |
| Missing / wrong `Content-Type` on a body | `HttpMediaTypeNotSupportedException` | 415 |
| Unsatisfiable `Accept` | `HttpMediaTypeNotAcceptableException` | 406 |
| Malformed / empty JSON body | `HttpMessageNotReadableException` | 400 |
| Un-bindable `@PathVariable` (`/sport/abc`) | `MethodArgumentTypeMismatchException` → `TypeMismatchException` | 400 |
| Missing multipart part | `MissingServletRequestPartException` | 400 |
| `@PathVariable` mapping bug | `MissingPathVariableException` | 500 (unchanged; now `ApiResponse`-wrapped + logged) |

### What was built

Matches the approved design — no divergence. The `ResponseEntityExceptionHandler` approach (not a
hand-listed set of `@ExceptionHandler` methods) was chosen so future Spring versions' new MVC
exception types are covered for free.

### Consumer census result (confirmed at implementation)

- `server/src/test` + `modules/*/src/test`: **zero** tests assert `500`/`5xx` for a bad request.
  `GlobalExceptionHandlerSpec`'s `"generic Exception maps to 500"` (a raw `RuntimeException` thrown
  inside a handler) still passes — that is app code, not a Spring MVC framework exception, so it
  still hits the `Exception` catch-all. **Compatible as-is.**
- `client/`: every `500` reference is apiClient's generic-error test, a simulated server-failure, or
  an MSW "Simulated X failure" handler for error-state UI — none keyed on a bad path/method/body.
  **Compatible as-is.** No client ticket needed.
- No `-api`, DTO, DB, or client-mirrored enum touched.

### Verification

- `./gradlew :modules:common:test` — `GlobalExceptionHandlerSpec` 12/12 (8 existing + 4 new:
  405 wrong-method, 415 bad-content-type, 400 unreadable-body, 400 path-var-type-mismatch). The
  standalone-MockMvc `setControllerAdvice(new GlobalExceptionHandler())` build succeeding is itself
  the first proof there is no "Ambiguous @ExceptionHandler".
- `./gradlew :server:test` — full suite green (163 tests, 0 failures). Real `@SpringBootTest`
  context startup across every IT is the definitive "no ambiguous handler / no bean wiring
  regression" check. New `GlobalExceptionMappingIntegrationTest` 5/5 (unknown route → 404, wrong
  method → 405, bad content-type → 415, unreadable body → 400, path-var mismatch → 400, each
  asserting the `ApiResponse` envelope through the real pipeline).
  - *Transient:* a first full run showed 6, then 9, `AmqpIOException` failures in
    `SessionEventsConsumerIntegrationTest` / `UserFriendEventsConsumerIntegrationTest` — a degraded
    local RabbitMQ container (up 31h), not C4: those classes passed when run alone both with and
    without the change, the failure set varied run-to-run, and `GlobalExceptionHandler` has no AMQP
    surface. `docker compose restart rabbitmq` → the next full run was clean.
- Live smoke (`bootRun` against dev Postgres): all 5 mappings return the correct status +
  `{"success":false,"message":"<generic>","data":null}`. Regression checks: `GET /api/sports` still
  `200`; `GET /api/sports/999999` still `404` with its own `"Sport not found with id: '999999'"`
  message (our explicit `ResourceNotFoundException` handler still wins, message preserved).

### Non-obvious constraints

- **`@Override` the base `protected handleXxx`, never re-declare `@ExceptionHandler` for a type the
  base already maps** — the ambiguity check runs at context startup and fails hard.
- **`handleExceptionInternal` must not clobber a non-null `ApiResponse` body** — the two
  field-specific overrides build their own envelope and pass it through; the funnel only substitutes
  when the body is Spring's `ProblemDetail`/null.
- The filename keeps its original `C4_NO_RESOURCE_FOUND_MAPS_TO_404` stem despite the widened title,
  so the backlog link stays stable.
