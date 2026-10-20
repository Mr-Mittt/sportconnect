# CLAUDE.md — auth-impl

Keycloak resource server (RS256 verification against the realm JWKS, the per-request active gate), Spring Security filter chain, the Keycloak sign-in callback, refresh and logout, and the welcome email. Registration, password sign-in, password reset and email verification are Keycloak's own (A28).
`SecurityConfig` for the **entire application** lives in this module, not in `server/`.

## Dependencies

| From | Why |
|---|---|
| `modules/auth/auth-api` | AuthService + JwtTokenService (read side) interfaces, the callback/reactivation DTOs |
| `modules/user/user-api` | UserService - provision users, the access-state gate, last login, preferred language |
| `modules/common` | ApiResponse<T>, shared exceptions |
| `modules/email/email-api` | `EmailSender` — auth renders subject and body, the email module only delivers (A13) |

## Key Classes

| Class | Purpose |
|---|---|
| `SecurityConfig` | Filter chain + CORS + public endpoints for the whole app |
| `JwtAuthenticationFilter` | A25: verifies the Keycloak Bearer token with the `JwtDecoder`, then asks `UserService.getAccessState(sub)` (cached) and authenticates only an existing, active user; roles come from the DB. A key-set or lookup failure marks the request so the entry point answers 503/500 instead of 401 |
| `JwtTokenServiceImpl` | Reads a token through the Keycloak `JwtDecoder` (A25); `StompAuthChannelInterceptor` (notification) uses it. No minting (A28 removed the HS256 mint) |
| `AuthServiceImpl` | A26: `callback` (code exchange, JIT provisioning, deactivation rules, A28: welcome email on the sign-in that created the account), `reactivate(ticket)`, `cancelReactivation`, `refreshToken`, `endSession`, all via `KeycloakTokenClient` |
| `KeycloakTokenClient` | A26: the backend's calls to Keycloak as the public client `sportconnect-web` (code exchange, refresh, end session) over `RestClient`; a 400 is the caller's error, anything else is `ServiceUnavailableException` |
| `KeycloakCredentialServiceImpl` | U24: implements auth-api `KeycloakCredentialService` as the confidential client `sportconnect-credentials` (backend only): `verifyPassword` (service-account token, username lookup, password grant with discarded tokens; `invalid_grant` = false, anything else = 503) and `isEmailVerified` and `sendVerificationEmail` (A33: the user's built-in `emailVerified`; the admin `send-verify-email` with the web app as the way back and `app.keycloak.verification-link-lifespan`, 12 h), `setPassword` (admin `reset-password`; 400 = `NEW_PASSWORD_REJECTED`). Uses the JDK HTTP client, because `HttpURLConnection` hides the body of Keycloak's 401 `invalid_grant`. Config: `app.keycloak.admin-uri`, `credentials-client-secret` (no prod default; INFRA-14) |
| `ReactivationTicketStore` | A26: the 5-minute, single-use `reactivationTicket` that parks a deactivated password user's Keycloak session in Redis (state, not a cache: Redis down means 503, known gap A30) |
| `EmailMessages` | The en/vi text of the welcome email (bundles `email/welcome_{en,vi}.properties`) and the language fallback (A13, A28) |
| `WelcomeEmailService` | A28: sends the welcome email once, to a freshly provisioned user with an email, in their language; a failed send is logged and never fails the sign-in |

## Endpoints

```
POST /api/auth/callback            ← A26: {code, codeVerifier} -> session (cookie) | 401 AUTH_CODE_INVALID | 401 ACCOUNT_DEACTIVATED + errorParams.reactivationTicket (password user)
POST /api/auth/reactivate          ← A26: {ticket} -> re-activates and releases the parked session (replaced A9's credentials version)
POST /api/auth/reactivate/cancel   ← A26: {ticket}, always 200; drops the ticket and ends the Keycloak session
POST /api/auth/refresh             ← A26: cookie = Keycloak refresh token; refresh grant, then the A25 gate on the new token
POST /api/auth/logout              ← A26: PUBLIC, driven by the refresh cookie (ends the Keycloak session; no cookie = 200; Keycloak down = 503 and the cookie is kept)
```

## Run Tests

```bash
./gradlew :modules:auth:auth-impl:test
./gradlew :modules:auth:auth-impl:test --tests "com.sportconnect.auth.service.AuthServiceImplSpec"
```

## Gotchas

- `spring-boot-starter-data-redis` is in `build.gradle` but unused here — Redis is wired at the server level.
- `AuthResponse.user` is typed `Object` intentionally — avoids a circular dependency with user-api response types.
- Access tokens are **Keycloak's** (5 min, RS256, A25). `app.keycloak.issuer-uri` must equal the token's `iss` exactly, `jwk-set-uri` may be internal, `aud` must contain `sportconnect-api`. There is no `app.jwt.*` or `JWT_SECRET` any more (A28).
- Public endpoints are declared in `SecurityConfig` here, not per-controller — add new public routes here, **one explicit path each** (A7 removed the `/api/auth/**` and `/api/sports/**` blanket permits; an unlisted path is authenticated by default). `PublicSurfaceAccessIntegrationTest` pins the list.
- **A deactivated user is not locked out forever (A9, A26).** The Keycloak `/callback` answers a **password** sign-in of a deactivated account with `ACCOUNT_DEACTIVATED` plus a ticket (`reactivate` takes the ticket), and re-activates a social one automatically. Refresh never says `ACCOUNT_DEACTIVATED`. Password reset is Keycloak's and does not re-activate the account.
- **Reset and verification are Keycloak's (A28).** The messages come from the email theme `infra/keycloak/themes/sportconnect/email` (en and vi; the language is the user's stored `locale` attribute), the reset link lives one hour (`realm-email-theme.mjs`), and whether a password user must verify before signing in is A33. The backend keeps no reset or verification tokens (V081 dropped the tables).
- **Redis is a cache here, not a dependency (A11, A25).** The per-request `{isActive, roles}` lookup (`UserAccessStateCache` in user-impl) goes through `common.cache.CacheGuard`: with Redis down it answers from the DB (one query per request) and logs a throttled WARN. Use the same guard for any new Redis call on the request path. `spring.data.redis.connect-timeout` is 1 s and the command timeout 2 s.
- **The active gate (A25).** A deactivated or unprovisioned user is refused in `JwtAuthenticationFilter`, the one enforcement point (closes the filter half of U12); there is no revocation watermark any more, a logout or password reset does not kill an access token (it dies in 5 min; A26/A28 end the Keycloak session). `UserServiceImpl.deactivate` and `reactivateUser` evict the cached state after commit; any new code that changes `is_active` or roles must do the same. `JwtAuthenticationFilter` takes `UserService` as `@Lazy` (it was a startup cycle through `SecurityConfig`'s `PasswordEncoder`, which U24 removed; kept so the security chain does not depend on the user module's wiring). Integration tests mint tokens with `TestKeycloak` (a local RSA key and JWKS server) via `BaseIT.bearer(userId)`, and need real role rows (`createUserWithRoles`).
- **Sign-in is Keycloak's, we finish it (A26).** The client redirects to Keycloak and posts `{code, codeVerifier}` to `/callback`. `app.keycloak.{client-id,redirect-uri,token-uri,logout-uri}` must match the realm client (the exchange repeats the exact `redirect_uri`). Claims are read from the **access token** through the same verified `JwtDecoder` as every request; password versus social is the `identity_provider` claim from the realm's session-note mapper (absent for a password login). `AuthServiceImpl` ends the Keycloak session on every failure after the exchange except the deliberate `ACCOUNT_DEACTIVATED`, or the next login would sign in silently into the same failure. A first-sign-in race can surface as a unique-email/phone 409 for the loser, so `provision` retries once on `DataIntegrityViolationException` or `ConflictException`. Keycloak does not rotate refresh tokens in this realm and revokes a session on a replayed code. Tests mint the Keycloak side with `TestKeycloak` (`issueCode`, `startSession`, `sessionEnded`, `tokenEndpointAvailable`).
- **Email goes through `email-api`, auth owns the text (A13).** Never inject `JavaMailSender` here; render with `EmailMessages` (language from `UserService.findPreferredLanguageCode` via `resolveLanguage`, which only accepts a language that has the welcome bundle: add `welcome_<lang>.properties` for a new language) and call `EmailSender.send`. The only email this module sends is the welcome email, from `WelcomeEmailService`, once, when `UserService.provisionExternalUser` reports `created` (A28).
