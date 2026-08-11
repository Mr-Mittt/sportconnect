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
| 2 | C2 | `ResourceGate<T>` — shared availability/visibility check shape | `TODO` |

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

---

### C2 · `ResourceGate<T>` — shared availability/visibility check shape
**Status:** `TODO`
**Type:** New Feature (Architecture)
**Scope:** One new interface in `modules/common` only — no changes to any domain module in this
ticket; `post-impl`'s A14 and `session-impl`'s SESSION-10 each implement it against this shape in
their own tickets.

**Filed:** 2026-08-11, from an architecture discussion while scoping `post-impl`'s A14 — full design
record, rejected alternatives, and rationale in
`documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md`.

**Problem:** any domain with per-item read/write rules on a resource (a `Post`, a `Session`, a
`SessionComment` once `SESSION-10` ships) has to answer two separate questions before a caller
touches it — is it **available** (existence/lifecycle: not soft-deleted, parent chain also
available) and, only if so, is it **visible** to this specific caller (authorization). These were
never explicitly separated in existing code, which is exactly what let a real bug hide
(`group-impl`'s B18: `isGroupMember` implicitly assumed "...and the group still exists," an
assumption nothing re-checked once groups became soft-deletable). Today each domain that needs this
also reinvents the check-order and exception-type convention by hand, which has already drifted
inconsistent (`post-impl` throws `BadRequestException` for one denial case, `ForbiddenException` for
another, for the same category of "you can't do this").

**Fix — add the shape, not the logic:**
```java
// modules/common/src/main/java/com/sportconnect/common/access/ResourceGate.java
public interface ResourceGate<T> {
    /** Existence/lifecycle only — not soft-deleted, parent chain (if any) also available. */
    boolean isAvailable(T resource);

    /** Assuming available, can this specific caller read/act on it? */
    boolean isVisibleTo(T resource, UUID viewerId);

    /** NotFoundException if unavailable, ForbiddenException if available-but-not-visible. */
    default T require(T resource, UUID viewerId, String notFoundMessage, String notVisibleMessage) {
        if (resource == null || !isAvailable(resource)) {
            throw new NotFoundException(notFoundMessage);
        }
        if (!isVisibleTo(resource, viewerId)) {
            throw new ForbiddenException(notVisibleMessage);
        }
        return resource;
    }
}
```
`common` has zero dependency on any domain here — the interface doesn't know `Post` or `Session`
exist. Each implementing domain writes its own `isAvailable`/`isVisibleTo` against its own entity,
using its own cross-domain `-api` calls (e.g. `post-impl`'s future `PostGate.isAvailable` calling
`groupService.isGroupActive` from B18) — `common` only standardizes the two-question shape, the
fixed evaluation order (`require()`'s availability-before-visibility), and the exception convention.
No `Strategy`-pattern class hierarchy, no runtime-pluggable rule registry, no annotation/AOP
dispatch — see the ADR's §7 for why those were considered and rejected as more ceremony than the
actual (near-zero) shared logic justifies.

**Tests:** a Spock spec against a trivial in-module test double (e.g. a fake `ResourceGate<String>`
implementation) covering `require()`'s three branches — unavailable → `NotFoundException`,
available-but-not-visible → `ForbiddenException`, available-and-visible → returns the resource
unchanged. No integration test needed — this ticket has no controller/endpoint of its own.

**Out of scope:** implementing `PostGate`/`SessionGate` themselves (separate tickets — `post-impl`'s
A14, `session-impl`'s SESSION-10); any change to the existing 5 exception types beyond using
`NotFoundException`/`ForbiddenException` as they already exist today; a caching layer for the
cross-domain calls each implementation makes (flagged as an open question in the ADR §8, deferred
until a real hot-path bottleneck shows up).
