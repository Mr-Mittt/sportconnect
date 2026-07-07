# A2 · Refresh token via httpOnly cookie — implementation summary

**Ticket:** A2 (`modules/auth/docs/BACKLOG_MVP.md` #1), origin: BE-1 in the client's AUTH/FEED epic
**Date:** 2026-07-08
**Status:** DONE

## Approved design

Move the refresh token from the JSON response body to an httpOnly `Set-Cookie`, per
`client/CLAUDE.md`'s auth design and `AUTHENTICATION_DESIGN.md`. Three implementation decisions
confirmed in Phase 1:

1. **Clean break** — cookie only, no dual body-based fallback. The old CRA client (the only
   caller of the body-based contract) is already deleted from the repo.
2. **`Secure` is profile-conditional** — `true` by default (safe for prod over HTTPS), `false` in
   the dev profile (Vite `:5173` → API `:8080` over plain HTTP; a hardcoded `Secure=true` would
   silently drop the cookie in every local dev session, since browsers refuse to store `Secure`
   cookies set over HTTP).
3. **Token handoff from service to controller:** `AuthResponse.refreshToken` stays as a Java
   field (service layer still populates it) but gets `@JsonIgnore`, so it's available for the
   controller to read into the cookie but never serialized into the HTTP response body. Chosen
   over splitting into a separate internal `AuthResult` type — smaller diff, zero signature
   changes to `AuthService`, existing `AuthServiceImplSpec` assertions on `result.refreshToken`
   keep working unchanged.

## What was built

```
auth-api:
  AuthResponse.java          refreshToken field @JsonIgnore + Javadoc explaining why
  RefreshTokenRequest.java   DELETED (dead after the clean break)

auth-impl:
  config/CookieProperties.java   NEW — @ConfigurationProperties("app.cookie"), secure: boolean,
                                 mirrors JwtProperties' existing pattern
  controller/AuthController.java
    register/login              now attach Set-Cookie via buildRefreshCookie()
    refreshToken                @CookieValue(required=false) replaces @RequestBody
                                 RefreshTokenRequest; null → UnauthorizedException (401, not
                                 Spring's default 400 for a missing cookie)
    logout                      attaches clearRefreshCookie() (Max-Age=0) — shares this file
                                 with A3's authorization fix, done in the same session
    buildRefreshCookie/
    clearRefreshCookie          private helpers: HttpOnly, Secure (profile-conditional),
                                 SameSite=Strict, Path=/api/auth, Max-Age from
                                 JwtProperties.refreshExpiration

server config:
  application.yml               app.cookie.secure: true (new default, alongside jwt/cors/email)
  application-dev.yml           app.cookie.secure: false (dev override)
  application-prod.yml          unchanged — inherits the safe true default

Tests:
  auth-impl/.../controller/AuthControllerSpec.groovy   NEW — standalone MockMvc (no Spring
    context in this library module, same idiom as GlobalExceptionHandlerSpec). 6 tests: login/
    register set the cookie + omit refreshToken from JSON; cookie Secure toggles with
    CookieProperties; refresh reads the cookie and rotates it; refresh without a cookie → 401 +
    never calls the service; combined with A3's logout test (see that ticket's summary).
```

## Verification

**Automated:** `AuthControllerSpec` — all cases pass, including a real Jackson-serialization
check (`jsonPath('$.data.refreshToken').doesNotExist()`) proving `@JsonIgnore` actually works,
not just that the Java field is set.

**Manual, against a real running server** (`./gradlew :server:bootRun`, dev profile, temporary
Docker Postgres/Redis — see A3's summary for why a real run was needed and what it uncovered):

```
POST /api/auth/register → Set-Cookie: refreshToken=...; Path=/api/auth; Max-Age=86400;
  HttpOnly; SameSite=Strict   (no Secure attribute — correct for dev profile)
  Body: data.accessToken present, NO refreshToken key at all
POST /api/auth/refresh (with the cookie) → 200, new cookie rotated in, same no-refreshToken-
  in-body behavior
```

Both endpoints verified end-to-end with the exact behavior the design called for.

## Non-obvious details

- `Secure` omitted (not `Secure=false`) in the dev cookie — that's correct `Set-Cookie` syntax;
  it's a boolean flag, not a key-value pair.
- `Max-Age` is computed from `jwtProperties.getRefreshExpiration() / 1000` (ms → seconds) —
  confirmed against the live cookie (86400s = the dev profile's 1-day refresh expiration).
- **Correction to this ticket's own Phase 2 exploration:** the design phase asserted "neither
  test in this repo runs the real `SecurityConfig` filter chain" (inferred from
  `application-test.yml`'s `spring.autoconfigure.exclude` list, without empirically checking).
  This was **wrong** — that exclusion only disables Spring Boot's *auto-configured* default
  security, not this app's manually-declared `@Bean SecurityFilterChain` in `SecurityConfig`,
  which `BaseIT`-based `@SpringBootTest` tests do exercise. Discovered while investigating A3's
  verification (see that ticket's summary for the full story) — recorded here so the next reader
  doesn't inherit the same wrong assumption from this ticket's design notes.
