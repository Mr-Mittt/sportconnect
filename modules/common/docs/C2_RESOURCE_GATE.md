# C2 · `ResourceGate<T>` — shared availability/visibility check shape

**Status:** DONE
**Module:** `modules/common`
**Related:** `documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md` (full design record and rationale)

## Design (approved plan, restated)

Every resource with per-item access rules (a `Post`, a `Session`, a `SessionComment`) must answer
two independent questions before a caller reads or acts on it: is it **available**
(existence/lifecycle — not soft-deleted, parent chain also available), and, only if so, is it
**visible** to this specific caller (authorization). These were never explicitly separated in
existing code, which is what let a real bug hide (`group-impl`'s B18: `isGroupMember` implicitly
assumed "...and the group still exists").

`common` gets exactly the shared **shape**, never the logic:

```java
public interface ResourceGate<T> {
    boolean isAvailable(T resource);
    boolean isVisibleTo(T resource, UUID viewerId);
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
exist. Each implementing domain (`post-impl`'s `PostGate` in A14, `session-impl`'s `SessionGate` in
SESSION-10) writes its own `isAvailable`/`isVisibleTo` against its own entity, using its own
cross-domain `-api` calls — `common` only standardizes the two-question shape, the fixed evaluation
order (availability before visibility), and the exception convention (`NotFoundException` for
"doesn't exist," `ForbiddenException` for "exists but you can't see it").

## What was built

Implemented exactly as specified in the ADR/backlog entry — no deviation:

- `modules/common/src/main/java/com/sportconnect/common/access/ResourceGate.java` — the interface,
  verbatim per the design above, with Javadoc on the interface and each method pointing back to the
  ADR.
- `modules/common/src/test/groovy/com/sportconnect/common/access/ResourceGateSpec.groovy` — Spock
  spec with an inline fake `ResourceGate<String>` test double (a `FakeGate` static class with
  settable `available`/`visible` flags), covering `require()`'s branches:
  - unavailable resource → `NotFoundException`
  - `null` resource → `NotFoundException` (without evaluating visibility)
  - available but not visible → `ForbiddenException`
  - available and visible → returns the resource unchanged

No Spring context is needed — `ResourceGate` is a plain interface with no controller/endpoint of
its own, unlike `GlobalExceptionHandlerSpec` (C1) which needed MockMvc standalone setup.

## Key decisions

- No class hierarchy, no `Strategy` pattern, no annotation/AOP dispatch — per ADR §7, rejected as
  more ceremony than the near-zero shared logic justifies. A plain interface + one default method
  is the entire shape.
- `require()`'s evaluation order (availability before visibility) is fixed in the default method,
  not left to each domain to reimplement — a resource that doesn't exist has no visibility rule
  left to evaluate.
- Both `NotFoundException` and `ForbiddenException` already existed in `common.exception` — no
  changes to the existing 5 exception types, per the ticket's explicit out-of-scope note.

## Out of scope (unchanged from ticket)

- `PostGate`/`SessionGate` implementations — separate tickets (`post-impl` A14, `session-impl`
  SESSION-10).
- Any change to the existing 5 exception types beyond using `NotFoundException`/`ForbiddenException`
  as they already exist.
- A caching layer for the cross-domain calls each domain's `isAvailable`/`isVisibleTo` will make —
  open question in the ADR §8, deferred until a real hot-path bottleneck shows up.

## Verification

- `./gradlew :modules:common:test` — all tests pass, including the 4 new `ResourceGateSpec` cases.
- `./gradlew :server:test` — full suite passes (36 tasks, no regressions). No domain module was
  touched by this ticket, so this was a confirmation run, not an area expected to change.

No divergence from the approved design — implementation matches the ADR/backlog spec exactly.
