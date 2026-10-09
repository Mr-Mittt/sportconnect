# CLAUDE.md — auth-impl

JWT token lifecycle, Spring Security filter chain, email verification, and password reset.
`SecurityConfig` for the **entire application** lives in this module, not in `server/`.

## Dependencies

| From | Why |
|---|---|
| `modules/auth/auth-api` | AuthService + JwtTokenService interfaces, all request/response DTOs |
| `modules/user/user-api` | UserService — create users, verify passwords, update last login |
| `modules/common` | ApiResponse<T>, shared exceptions |
| JJWT 0.12.3 | JWT gen/parse — use `Jwts.parser().verifyWith()` (not 0.11.x API) |
| Spring Mail | Async email via `@Async` — fire-and-forget, errors don't propagate to caller |

## Key Classes

| Class | Purpose |
|---|---|
| `SecurityConfig` | Filter chain + CORS + public endpoints for the whole app |
| `JwtAuthenticationFilter` | Extracts Bearer token, validates, populates SecurityContext |
| `JwtTokenServiceImpl` | Gen/validates tokens; uses reflection to accept Map or entity as user data |
| `AuthServiceImpl` | register/login/refresh/logout orchestration via UserService |
| `RefreshToken` | Soft-revoked entity; `isValid()` = not expired AND not revoked |
| `EmailService` | Sends emails `@Async`; welcome, verification, reset |
| `PasswordResetService` | 1-hour token; marks `usedAt`; calls `UserService.updateUserPassword` with pre-hashed value |

## Endpoints

```
POST /api/auth/register
POST /api/auth/login               ← correct password on a deactivated account: 401 ACCOUNT_DEACTIVATED, no tokens (A9)
POST /api/auth/reactivate         ← A9: re-verifies credentials, re-activates, logs in (same cookie contract as login)
POST /api/auth/refresh
POST /api/auth/logout             ← caller derived from the JWT principal, no userId param
POST /api/auth/verify-email
POST /api/auth/forgot-password    ← A10: emails a reset link if the account exists (active or deactivated); identical 200 either way
POST /api/auth/reset-password
```

## Run Tests

```bash
./gradlew :modules:auth:auth-impl:test
./gradlew :modules:auth:auth-impl:test --tests "com.sportconnect.auth.service.AuthServiceImplSpec"
```

## Gotchas

- `spring-boot-starter-data-redis` is in `build.gradle` but unused here — Redis is wired at the server level.
- `AuthResponse.user` is typed `Object` intentionally — avoids a circular dependency with user-api response types.
- `JwtTokenServiceImpl` uses reflection (`getMethod/invoke`) to extract user fields — renaming fields on the `User` entity requires updating this.
- Access token = 1 hour, refresh token = 7 days — configured in `application.yml` under `app.jwt`.
- Public endpoints are declared in `SecurityConfig` here, not per-controller — add new public routes here, **one explicit path each** (A7 removed the `/api/auth/**` and `/api/sports/**` blanket permits; an unlisted path is authenticated by default). `PublicSurfaceAccessIntegrationTest` pins the list.
- **A deactivated user is not locked out forever (A9).** `UserService.verifyCredentials` returns `NO_MATCH` / `MATCH` / `MATCH_INACTIVE`; login turns `MATCH_INACTIVE` into `ACCOUNT_DEACTIVATED` and `reactivate` re-activates. Refresh never says `ACCOUNT_DEACTIVATED`. Forgot/reset password must keep working for a deactivated account and must not re-activate it (A10 wires the email side).
- **Password reset (A10).** `PasswordResetService.requestReset` uses `UserService.findUserIdByEmail` (includes deactivated), replaces the user's token in a `TransactionTemplate` (one row per user: unique `user_id`, V078) and emails after the commit, in the user's language (`UserService.findPreferredLanguageCode`, gated by `EmailMessages` bundles `email/reset-password_{en,vi}.properties`; verification and welcome emails still English, A13); the unique-key race is caught outside the transaction. `resetPassword` revokes refresh tokens. Expiry: `app.password-reset.expiration-minutes`. Known gap: revocation does not evict the Redis watermark (A12).
