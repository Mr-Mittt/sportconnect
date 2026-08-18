# A4 · JWT `jti` claim for guaranteed token uniqueness

**Ticket:** A4 (`modules/auth/docs/BACKLOG_MVP.md`)
**Date:** 2026-07-09
**Status:** DONE
**Origin:** discovered during the client's AUTH-3 (`client/docs/BACKLOG_MVP.md`) manual verification
against the real backend — not part of that ticket's own scope, fixed alongside it on the same
branch per user decision.

## The bug

`JwtTokenServiceImpl.generateToken()` built every JWT from entirely deterministic inputs: user id,
email, username, roles, `iat`, `exp`. No random or per-call-unique component. JWT `iat`/`exp` are
second-precision per the spec, so two tokens generated for the *same user* within the *same wall-
clock second* produced the exact same signed string — same header, same payload, same signature.
`refresh_tokens.token` has a `UNIQUE` DB constraint, so the second insert threw
`DataIntegrityViolationException`, surfaced to the caller as a 500.

## Why AUTH-3 made this reachable

Before AUTH-3, nothing called `/api/auth/refresh` automatically — only an explicit login/register
click did, and doing that twice for the same user within one second was already possible (e.g.
double-clicking submit) but rare enough nobody had hit it. AUTH-3 adds an automatic `/refresh` call
on every app load, which meaningfully raises the odds of a second token-generation call landing
within the same second as the login/register that preceded it — e.g. opening a second tab
immediately after signing up (exactly how this was found — a throwaway Playwright script simulating
"register in tab 1, immediately open tab 2 in the same browser context").

Blast radius before this fix: not a crash or exploit. The client's `useSessionBootstrap` hook
already treats any refresh failure (401, 500, whatever) identically — leaves `authStore` untouched,
flips `isBootstrapping`, no visible error. So the practical symptom was "silently appears logged
out" in this narrow timing window, not a broken UI — but it was a real, reproducible server bug
with an obvious fix.

## Fix

Added a `jti` (JWT ID) claim — a standard registered JWT claim whose entire purpose is per-token
uniqueness — via `UUID.randomUUID()`:

```java
return Jwts.builder()
        .setId(UUID.randomUUID().toString())   // new
        .setSubject(...)
        ...
```

This makes every generated token unique by construction, independent of timing. No DB migration
needed — `refresh_tokens.token` stays the same column type/constraint, it's just now genuinely
impossible for two tokens to collide.

## What was built

```
auth-impl:
  service/JwtTokenServiceImpl.java   generateToken() now sets jti via UUID.randomUUID();
                                      comment explains why (non-obvious: iat/exp alone aren't
                                      enough to guarantee uniqueness)
  test: JwtTokenServiceImplSpec.groovy   new case — two tokens generated back-to-back for the
                                      same user data are asserted != each other
```

## Verification

- `./gradlew :modules:auth:auth-impl:test` — full suite green, including the new uniqueness case
  and all pre-existing token tests (none asserted an exact token string/length, so the added `jti`
  claim didn't break anything).
- Re-ran the exact scenario that surfaced the bug (real backend, dev profile, real Postgres/Redis):
  register in one browser tab, immediately open a second tab in the same context — before the fix,
  reproduced the 500 every time; after the fix, the second tab's `/refresh` call succeeds cleanly
  and the refresh cookie rotates as expected.

## Explicitly out of scope

- Client-side handling of a 500 differently from a 401 on `/refresh` — not needed; the client's
  existing "any failure = normal logged-out case, no visible error" behavior was already reasonable
  and stays as-is (AUTH-3's own scope, unchanged by this ticket).

---

**Status:** `DONE` (2026-07-09) · **Summary:** `modules/auth/docs/MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md`
**Type:** Bug Fix
**Origin:** discovered during the client's AUTH-3 (`client/docs/BACKLOG_MVP.md`) manual verification
against the real running backend — not part of that ticket's own scope.

`JwtTokenServiceImpl.generateToken()` built every JWT from entirely deterministic claims (user id,
email, username, roles, `iat`, `exp` — no random component). JWT `iat`/`exp` are second-precision,
so two tokens generated for the same user within the same wall-clock second were byte-identical,
colliding against `refresh_tokens.token`'s `UNIQUE` constraint (500, not caught gracefully).
AUTH-3's automatic on-load `/refresh` call made this newly reachable in ordinary usage (e.g. a
second tab opened right after signing up).

**Fix:** added a `jti` claim (`UUID.randomUUID()`) to `generateToken()` — the standard JWT claim for
exactly this purpose. No DB migration needed.

**Tests:** `JwtTokenServiceImplSpec` — two tokens generated back-to-back for identical user data now
assert `!=`.

---
