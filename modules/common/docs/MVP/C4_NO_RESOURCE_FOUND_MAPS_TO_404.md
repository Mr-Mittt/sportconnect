# C4 · `NoResourceFoundException` → 404 (not 500) in `GlobalExceptionHandler`

**Status:** `TODO`
**Module:** `modules/common`
**Type:** Bug Fix — application-wide
**Filed:** 2026-09-03 — found during sport **A22** Phase 5 live smoke test (see
`modules/sport/sport-impl/docs/MVP/A22_CALLER_SCOPED_SPORT_PROFILE_READS.md`). Filed immediately per
CLAUDE.md § API Change Discipline ("file any follow-up ticket the moment it comes out").
**Depends on:** none. Extends C1's `GlobalExceptionHandler`.

## Problem

`GlobalExceptionHandler` (C1) has no handler for Spring MVC's
`org.springframework.web.servlet.resource.NoResourceFoundException` (thrown when no `@RequestMapping`
matches a request and the dispatcher falls through to static-resource resolution, which also
misses). It therefore hits the catch-all `@ExceptionHandler(Exception.class)` → **500** with
`"An unexpected error occurred"`.

Every request to a path with no handler, under any `permitAll` prefix, returns **500 instead of
404**. Reproduced live on `main`-equivalent code:

```
GET /api/sports/nonsense            → 500  (should be 404)
GET /api/sports/profiles/user/<id>  → 500  (A22 removed this route; now unmapped)
```

This is **pre-existing** — not introduced by A22. A22 surfaced it because it removed two routes
(`GET /api/sports/profiles/user/{userId}` and `.../sport/{sportId}`), and the census confirmed those
two paths have zero consumers (no client hook, no MSW handler, no backend caller), so nothing is
harmed by their 500 — but the wrong status code for *any* unmapped path is worth fixing centrally.

Under Spring Boot 3.2 `NoResourceFoundException` is the relevant type (it superseded
`NoHandlerFoundException` for most cases once `spring.web.resources.add-mappings` stays at its
default). Handle both to be safe.

## Fix

Add to `com.sportconnect.common.exception.GlobalExceptionHandler`:

```java
@ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
public ResponseEntity<ApiResponse<Void>> handleNoResource(Exception e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ApiResponse.error("Resource not found"));
}
```

- Generic message only — same posture as the catch-all: don't echo the raw path back.
- Ordered/typed ahead of the `Exception.class` catch-all (Spring picks the most specific
  `@ExceptionHandler`, so declaration order doesn't matter, but keep it grouped with the other 4xx
  handlers for readability).
- No `@ResponseStatus` on a new exception class — reuse the existing pattern of explicit
  `ResponseEntity.status(...)`.

**Consumer census (do at pickup):** this changes the HTTP status of *every* currently-unmapped path
from 500 → 404. Check: any test (backend IT or client MSW/e2e) that currently asserts `500` for a
deliberately-bad path would need updating. A22's `SportProfileResumeAndVisibilityIntegrationTest`
does **not** assert on the removed `/profiles/user/...` paths (it only tests the new ones), so it is
unaffected — but grep `isServerError`/`.value(500)`/`status().is5xxServerError()` across
`server/src/test` and `client` before shipping.

## Tests

- `GlobalExceptionHandlerSpec.groovy` — add a case: a request to a path with no matching dummy
  controller mapping resolves to `404` + `ApiResponse.error("Resource not found")`, not `500`.
  (Standalone MockMvc setup may need `.addDispatcherServletCustomizer` or an explicit
  `setThrowExceptionIfNoHandlerFound` depending on the Spring test version — sort out during
  implementation, same "C1 had no test infra" spirit.)
- One backend IT hitting a genuinely unmapped `/api/...` path asserting `404` through the real
  pipeline.

## Out of scope

- Restoring the two routes A22 removed — they are gone by design.
- Any change to the 5 business-exception handlers or the validation handler (C1).
- A structured "did you mean" / path-in-body response — generic message is enough.
