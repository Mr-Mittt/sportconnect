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
| `modules/email/email-api` | `EmailSender` — auth renders subject and body, the email module only delivers (A13) |

## Key Classes

| Class | Purpose |
|---|---|
| `SecurityConfig` | Filter chain + CORS + public endpoints for the whole app |
| `JwtAuthenticationFilter` | A25: verifies the Keycloak Bearer token with the `JwtDecoder`, then asks `UserService.getAccessState(sub)` (cached) and authenticates only an existing, active user; roles come from the DB. A key-set or lookup failure marks the request so the entry point answers 503/500 instead of 401 |
| `JwtTokenServiceImpl` | Reading a token goes through the Keycloak `JwtDecoder` (A25); `generate*` is the legacy HS256 mint that nothing accepts any more (reflection to accept Map or entity), gone with A28 |
| `AuthServiceImpl` | A26: `callback` (code exchange, JIT provisioning, deactivation rules), `reactivate(ticket)`, `cancelReactivation`, `refreshToken`, `endSession`, all via `KeycloakTokenClient`; legacy `register`/`login`/`logout(UUID)` stay until A28 |
| `KeycloakTokenClient` | A26: the backend's calls to Keycloak as the public client `sportconnect-web` (code exchange, refresh, end session) over `RestClient`; a 400 is the caller's error, anything else is `ServiceUnavailableException` |
| `ReactivationTicketStore` | A26: the 5-minute, single-use `reactivationTicket` that parks a deactivated password user's Keycloak session in Redis (state, not a cache: Redis down means 503, known gap A30) |
| `RefreshToken` | Soft-revoked entity; `isValid()` = not expired AND not revoked |
| `EmailMessages` | The en/vi text of the reset, verification and welcome emails (bundles `email/*_{en,vi}.properties`) and the language fallback (A13) |
| `PasswordResetService` | 1-hour token; marks `usedAt`; calls `UserService.updateUserPassword` with pre-hashed value |

## Endpoints

```
POST /api/auth/register
POST /api/auth/callback            ← A26: {code, codeVerifier} -> session (cookie) | 401 AUTH_CODE_INVALID | 401 ACCOUNT_DEACTIVATED + errorParams.reactivationTicket (password user)
POST /api/auth/reactivate          ← A26: {ticket} -> re-activates and releases the parked session (replaced A9's credentials version)
POST /api/auth/reactivate/cancel   ← A26: {ticket}, always 200; drops the ticket and ends the Keycloak session
POST /api/auth/login               ← LEGACY (retired by A28): correct password on a deactivated account: 401 ACCOUNT_DEACTIVATED, no tokens (A9); the token it mints is accepted nowhere
POST /api/auth/refresh             ← A26: cookie = Keycloak refresh token; refresh grant, then the A25 gate on the new token
POST /api/auth/logout              ← A26: PUBLIC, driven by the refresh cookie (ends the Keycloak session; no cookie = 200; Keycloak down = 503 and the cookie is kept)
POST /api/auth/verify-email
POST /api/auth/forgot-password    ← A10: emails a reset link if the account exists (active or deactivated); identical 200 either way
POST /api/auth/reset-password            ← A21: one transaction (claim token + new password + revoke refresh tokens)
POST /api/auth/reset-password/validate   ← A21: read-only link check; every bad token is the same 404 RESET_TOKEN_INVALID
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
- Access tokens are **Keycloak's** (5 min, RS256, A25); `app.jwt.*` only configures the legacy HS256 mint that A26/A28 retire. `app.keycloak.issuer-uri` must equal the token's `iss` exactly, `jwk-set-uri` may be internal, `aud` must contain `sportconnect-api`.
- Public endpoints are declared in `SecurityConfig` here, not per-controller — add new public routes here, **one explicit path each** (A7 removed the `/api/auth/**` and `/api/sports/**` blanket permits; an unlisted path is authenticated by default). `PublicSurfaceAccessIntegrationTest` pins the list.
- **A deactivated user is not locked out forever (A9).** `UserService.verifyCredentials` returns `NO_MATCH` / `MATCH` / `MATCH_INACTIVE`; the legacy login turns `MATCH_INACTIVE` into `ACCOUNT_DEACTIVATED`. Since A26 the Keycloak `/callback` does the same for a password sign-in (plus a ticket; `reactivate` takes the ticket, not credentials) and re-activates a social one automatically. Refresh never says `ACCOUNT_DEACTIVATED`. Forgot/reset password must keep working for a deactivated account and must not re-activate it (A10 wires the email side).
- **Password reset (A10).** `PasswordResetService.requestReset` uses `UserService.findUserIdByEmail` (includes deactivated), replaces the user's token in a `TransactionTemplate` (one row per user: unique `user_id`, V078) and emails after the commit, in the user's language (`UserService.findPreferredLanguageCode`, gated by the `EmailMessages` bundles); the unique-key race is caught outside the transaction. `completeReset` (A21) claims the token with a conditional update, sets the password and revokes refresh tokens in ONE transaction (a failed password update leaves the link usable); `checkToken` backs the public validate endpoint. Expiry: `app.password-reset.expiration-minutes`.
- **Redis is a cache here, not a dependency (A11, A25).** The per-request `{isActive, roles}` lookup (`UserAccessStateCache` in user-impl) goes through `common.cache.CacheGuard`: with Redis down it answers from the DB (one query per request) and logs a throttled WARN. Use the same guard for any new Redis call on the request path. `spring.data.redis.connect-timeout` is 1 s and the command timeout 2 s.
- **The active gate (A25).** A deactivated or unprovisioned user is refused in `JwtAuthenticationFilter`, the one enforcement point (closes the filter half of U12); there is no revocation watermark any more, a logout or password reset does not kill an access token (it dies in 5 min; A26/A28 end the Keycloak session). `UserServiceImpl.deactivate` and `reactivateUserByEmail` evict the cached state after commit; any new code that changes `is_active` or roles must do the same. `JwtAuthenticationFilter` takes `UserService` as `@Lazy` (startup cycle through `SecurityConfig`'s `PasswordEncoder`). Integration tests mint tokens with `TestKeycloak` (a local RSA key and JWKS server) via `BaseIT.bearer(userId)`, and need real role rows (`createUserWithRoles`).
- **Sign-in is Keycloak's, we finish it (A26).** The client redirects to Keycloak and posts `{code, codeVerifier}` to `/callback`. `app.keycloak.{client-id,redirect-uri,token-uri,logout-uri}` must match the realm client (the exchange repeats the exact `redirect_uri`). Claims are read from the **access token** through the same verified `JwtDecoder` as every request; password versus social is the `identity_provider` claim from the realm's session-note mapper (absent for a password login). `AuthServiceImpl` ends the Keycloak session on every failure after the exchange except the deliberate `ACCOUNT_DEACTIVATED`, or the next login would sign in silently into the same failure. A first-sign-in race can surface as a unique-email/phone 409 for the loser, so `provision` retries once on `DataIntegrityViolationException` or `ConflictException`. Keycloak does not rotate refresh tokens in this realm and revokes a session on a replayed code. Tests mint the Keycloak side with `TestKeycloak` (`issueCode`, `startSession`, `sessionEnded`, `tokenEndpointAvailable`).
- **Email goes through `email-api`, auth owns the text (A13).** Never inject `JavaMailSender` here; render with `EmailMessages` (language from `UserService.findPreferredLanguageCode` via `resolveLanguage`, which only accepts a language that has **all three** bundles — add a language's reset, verify-email and welcome bundles together) and call `EmailSender.send`. The verification and welcome emails are not triggered by anything yet (A17).
