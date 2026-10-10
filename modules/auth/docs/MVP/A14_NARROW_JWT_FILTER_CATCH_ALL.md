# A14 · Narrow `JwtAuthenticationFilter`'s catch-all so unexpected failures surface as 5xx, not a silent 401

**Status:** `TODO`
**Type:** Bug / hardening (low priority)
**Depends on:** none (**A11** removed the Redis trigger, which is why this is low priority)

**Filed:** 2026-10-10, found while verifying **A11**. The ticket A11 assumed an outage returns a 500; the real symptom was a 401 because of this catch.

## What

`JwtAuthenticationFilter.doFilterInternal` wraps its whole token check in `try { … } catch (Exception ex)` (the `catch` is around line 63). On any exception it logs `Could not set user authentication in security context` at ERROR, with a stack trace, and carries on with the request **unauthenticated**, so a protected endpoint answers 401.

What is inside the `try`, in order:
1. `validateToken(jwt)`: already catches everything itself and returns `false`, so a bad, forged or expired token never throws into the filter.
2. `getUserIdFromToken`, `getIssuedAtFromToken`, `UUID.fromString(userId)`: run only on a token we signed and validated, so they fail only on a malformed claim, i.e. our own bug.
3. `tokenRevocationChecker.isRevoked(...)`: the one piece that does real I/O (Redis, with the DB fallback since A11).
4. `getEmailFromToken`, `getAuthoritiesFromToken`: claim parsing.

So the catch guards infrastructure failures and our own bugs, not client input. The effect is that a server-side failure looks like "your session expired": the client silently refreshes (rotating the refresh token) and retries, and 5xx dashboards and alerts see nothing.

## Wanted

- "No usable token" stays unauthenticated (already handled inside `validateToken`).
- Unexpected failures in steps 2 to 4 are no longer swallowed. The filter writes its own response, e.g. 503 with `ApiResponse.error(...)` and a stable `errorCode` (a plain exception thrown from a filter bypasses the `@ControllerAdvice` handlers and becomes Spring Boot's default error JSON).
- The new `errorCode` gets en and vi copy on the client (C12 / I18N rules), in this change or as a client ticket filed straight away. Check `apiError.ts` / `errorToast.ts` for how a 5xx is classified before choosing the status.
- Decide at pickup whether a DB blip inside the revocation lookup should be 503 (preferred) rather than 401.
- Related nit that can ride along: `validateToken` logs every invalid or expired token at ERROR; with a 1-hour access token, routine expiries land in the ERROR log. Lower it to DEBUG/WARN without the stack trace.

## Behaviour change to state in the write-up

A latent bug in claim handling would start surfacing as an error instead of being silently turned into a 401, and a short DB failure would return 503 to authenticated users instead of 401. Both are the intent, but they are visible changes.

## Tests

- Spock `JwtAuthenticationFilterSpec`: a throwing `TokenRevocationChecker` produces the 503 response and does not continue the chain; a bad token is still unauthenticated and continues.
- IT: force a failure inside the check (e.g. a throwing revocation checker bean) and assert the status and `errorCode` through the real filter chain; confirm a normal bad token is still 401.

## Out of scope

Redis outage handling (A11, done); the stale-cache revocation gap (A12); a per-request `isActive` recheck (U12).
