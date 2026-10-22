# A28 · Keycloak owns reset and verification; retire the old auth endpoints and tables

**Status:** `DONE` (2026-10-16) · **Type:** Refactor / cleanup · **Depends on:** A26, CHAT-17 · **Gates:** nothing

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

- Keycloak sends the reset and verify-email messages: an email theme with **en and vi** and the realm SMTP settings. Our email module keeps the welcome email (A17).
- Remove `/api/auth/{login,register,forgot-password,reset-password,reset-password/validate,verify-email}`, `PasswordResetService`, `EmailVerificationService`, the `refresh_tokens`, `password_reset_tokens` and `email_verifications` tables and entities, `TokenRevocationChecker`, and the HS256 path in chat.
  - **Left for this ticket by A25 (2026-10-14):** `TokenRevocationChecker` is already deleted; still to remove are the legacy HS256 mint (`JwtTokenServiceImpl.generate*`, `JwtProperties.secret`/`expiration`, `AuthServiceImpl` token issuing) and `refresh_tokens` revocation (`revokeAllUserTokens`), which no access-token check reads any more. Decide `/api/auth/oauth-token` (Swagger's Authorize button) against Keycloak.
- Close **A15, A18, A19** and **A21** as superseded (note on each ticket and move to Done / Removed per the backlog convention), narrow **A17** to the welcome email, and record the **A20** answer (5-min lifetime, chat's accepted risk, STOMP through the A25 gate). Update the I18N-4 census for the removed forms.
- Consumer census before deleting: every caller of each removed endpoint across the backend, the client and the 9 e2e specs and MSW fixtures.

## Scope decisions at pickup (2026-10-16)

- **Email theme stays in this ticket** (not split out): Keycloak's reset and verify-email messages, en and vi, and the realm SMTP settings, built before the old endpoints are deleted.
- **`/api/auth/oauth-token`:** the controller is removed and Swagger's Authorize is pointed at Keycloak (authorization code flow) in `OpenApiConfig`.
- **Refresh-token rotation:** A26's decision stands (`revokeRefreshToken` off); this ticket records the reason and does not change it.
- **Scope addition: the welcome email moves to first-sign-in provisioning.** With `verify-email` gone nothing would trigger it, so the A26 provisioning path sends it once, after commit, for a newly created `users` row that has an email (none for phone-only or Zalo users, A22), in the language from the `locale` claim (else the existing country/`en` fallback). A repeat sign-in sends nothing. A failure to send never fails the sign-in. This closes **A17** completely instead of narrowing it.
- **Verification stays off (user decision, 2026-10-16).** The realm keeps `verifyEmail: false`, so a password user is not blocked until the link is clicked; Keycloak still sends the message when asked. Turning it on, together with phone verification, is filed as **A33**.
- **Scope addition: `add-test-data` is maintained in this ticket.** `documentation/scripts/add-test-data/add-test-data.mjs` signs in as each author through the removed `POST /api/auth/login`. It is ported to a scripted Authorization Code + PKCE login against Keycloak's login page (no new realm client, no direct-grant client in the realm file), so it keeps working against the dev stack.

## Out of scope

Providers (A29); the client pages (AUTH-14 / AUTH-15).

## Done when

The census is written, everything above is removed or closed, `:server:test` and the client suites are green, and the migration dropping the tables applies on a populated dev database.

## Notes from A26 (2026-10-14)

- `SwaggerOAuth2TokenController` (`/api/auth/oauth-token`) calls the legacy `AuthService.login`, so it has handed out tokens nothing accepts since A25. Remove it with the other legacy endpoints, or point Swagger's Authorize at Keycloak (`OpenApiConfig`).
- A26 left `AuthService.logout(UUID)` (revokes legacy `refresh_tokens` rows, called from `UserServiceImpl.deactivate`), `register`, `login` and `UserService.reactivateUserByEmail` / `verifyCredentials` in place; they go with this ticket. Deactivation then needs no auth call at all (the gate refuses the user on the next request, and a refresh ends the Keycloak session).
- `REFRESH_TOKEN_INVALID` is no longer returned; drop the client copy with the rest.
- Keycloak does **not** revoke a refresh token on use in this realm (`revokeRefreshToken` off, a deliberate choice in A26: rotation with reuse detection would end the whole session when two tabs refresh at once). Revisit it here together with the A15/A18/A19 closure.
- Provisioned users have no `password_hash`; the password-based U22/`changePassword` checks are U24's.

---

## Implementation summary (2026-10-16)

**Design as approved.** Keycloak sends the reset and verification messages (a FreeMarker email theme, en and vi); the backend stops owning any of that flow and the pre-Keycloak token code and tables are removed; the welcome email moves to the first sign-in. Branch `feature/a28-keycloak-owns-reset-and-verification`, off the CHAT-17 branch (by decision).

**Built.**
- **Email theme.** `infra/keycloak/themes/sportconnect/email` (`parent=base`, `template.ftl` with a SportConnect header and footer, `messages_en` and `messages_vi` for `passwordReset*`, `emailVerification*` and the link-expiry units). Mounted read-only into the Compose Keycloak. The realm gets `emailTheme: sportconnect` and `actionTokenGeneratedByUserLifespan.reset-credentials = 3600` (the old app's one-hour link; Keycloak's default is 5 minutes) through `infra/scripts/realm-email-theme.mjs` (`api` and `file` modes) and `apply-realm-email-theme.sh`, mirrored in `sportconnect-realm.json`. Keycloak writes the mail in the user's stored `locale` attribute (set from the register page's language, A32), not the page the user happens to be on.
- **Swagger.** Realm client `sportconnect-swagger` (public, PKCE, audience mapper) from `infra/scripts/realm-swagger-client.mjs`. `OpenApiConfig` now declares an `authorizationCode` flow built from `app.keycloak.issuer-uri`, and `springdoc.swagger-ui.oauth` sets the client id and PKCE. `SwaggerOAuth2TokenController` and `OAuth2TokenResponse` are deleted.
- **Welcome email.** `UserService.provisionExternalUser` now returns `ProvisionedUser{user, created}`. `AuthServiceImpl.callback` calls `WelcomeEmailService.sendTo(user)` when `created` (provisioning has committed by then; the loser of a first-sign-in race and every later sign-in report `created = false`). The send is async through `email-api`, skipped for an account with no email, in the user's language (preference, else country default, else English), and a failure is logged and swallowed. The text no longer says the email was verified. The dev profile points `spring.mail` at Mailpit.
- **Removed (auth).** Endpoints `register`, `login`, `verify-email`, `forgot-password`, `reset-password`, `reset-password/validate`, `oauth-token`. `PasswordResetService`, `EmailVerificationService`. Entities and repositories `RefreshToken`, `PasswordResetToken`, `EmailVerification`. The six request DTOs. `JwtTokenService.generate*` and `getRefreshExpiration`. `JwtProperties` and `app.jwt.*` in all three yml files, and `JWT_SECRET`. The jjwt dependency. The reset and verify email bundles. `AuthService.register/login/logout(UUID)`. The refresh cookie's Max-Age is always Keycloak's `refresh_expires_in` (a response without one is a session cookie). The public route list is now `callback`, `reactivate`, `reactivate/cancel`, `refresh`, `logout`.
- **Removed (user).** `UserService.createUser` (both overloads), `updateUserPassword`, `verifyCredentials`, `reactivateUserByEmail`, `findUserIdByEmail`, `CredentialCheck`, `UserRegistrationDetails`, the repository's `findByEmailForUpdate`, the dead `toPoint`, and the `@Lazy AuthService` in `UserServiceImpl`. Deactivation makes no auth call, and `user-impl` no longer depends on `auth-api`. Kept because still used: `getUserByEmail`, `existsByEmail`, `findPreferredLanguageCode`, and the password checks in `deactivateOwnAccount` and `changePassword` (U24's).
- **Migration V081** drops `refresh_tokens`, `password_reset_tokens` and `email_verifications` (rows are not migrated). Applied by `bootRun` on the populated dev database (3108 refresh tokens, 1 reset token, 209 users): tables gone, users intact.
- **STOMP (A20).** `StompAuthChannelInterceptor` runs `UserService.getAccessState` on `CONNECT`; a deactivated, unprovisioned or non-UUID subject is refused. Recorded in A20. **NTF-6** is filed for sockets that are already open at deactivation.
- **`add-test-data`.** `loginAs` is now a scripted Authorization Code + PKCE sign-in at the dev Keycloak (reads `loginAction` from the themed page's `kcContext`, posts the credentials, exchanges the code). No realm client was added for it. Checked live: the token is accepted by the backend.

**Decisions recorded.** Refresh-token rotation stays off (A26's choice: two tabs refreshing at once would end the whole session under rotation with reuse detection). Realm `verifyEmail` stays `false` (user decision); turning it on together with phone verification is **A33**. The verification link already lives 12 hours in this Keycloak, so A33 only has to flip the switch and check the page.

**Divergences from the plan.**
1. The A20 answer is stronger than "document it": the STOMP `CONNECT` check was added because the ticket text says STOMP goes through the A25 gate and the interceptor did not.
2. The dev profile now sends the backend's mail to Mailpit. Found because the first live welcome-email check failed with a Gmail authentication error while the sign-in itself still returned 200.
3. The client's `e2e/flows/misc-errors.spec.ts` was deleted rather than updated: its 3 tests drive a client `/register` form that has been a redirect to Keycloak since AUTH-14, and they were already failing on a timeout before this ticket.

**Consumer census (every removed contract).**

| Consumer | Verdict |
|---|---|
| Client `src` calls to any removed endpoint | none existed (AUTH-14 had moved the flows to Keycloak); compatible as-is |
| Client error copy `INVALID_CREDENTIALS`, `RESET_TOKEN_INVALID/USED/EXPIRED` (en, vi) | removed in this change; `REFRESH_TOKEN_INVALID` had no client copy |
| `client/e2e/flows/misc-errors.spec.ts` (forced `POST /api/auth/register`) | deleted in this change; CLIENT-ERR-8 and E2E_OVERVIEW updated |
| `client/e2e` MSW handlers and `msw-setup.spec.ts` | already on `callback` (AUTH-14); only E2E_OVERVIEW's stale rows corrected |
| `StompAuthChannelInterceptor` (notification) uses the `JwtTokenService` read methods | compatible (kept); gains the active gate |
| `UserServiceImpl` calling `AuthService.logout` | removed in this change |
| Server ITs using the removed endpoints (`AccountReactivation`, `AuthErrorCodes`, `EmailModule`, `GlobalExceptionMapping`, `PublicSurfaceAccess`, `RegistrationGeo`, `SelfDeactivation`, `UserIdentifierConstraints`, `PasswordReset`, `KeycloakResourceServer`) | updated or deleted in this change (below) |
| `documentation/scripts/add-test-data` (`POST /api/auth/login`) | updated in this change |
| Swagger UI Authorize (`oauth-token`) | updated in this change |
| `application*.yml` and deployment config naming `JWT_SECRET`, `EMAIL_VERIFICATION_URL`, `RESET_PASSWORD_URL`, `PASSWORD_RESET_EXPIRATION_MINUTES` | removed from the yml files; no deployment config exists yet (INFRA-14 notes added) |
| Postgres tables and the H2 `schema.sql` mirror | V081 and the mirror updated |
| Chat service HS256 path | already removed by CHAT-17 |

**Left in place, unused.** `UserService.getActiveUserForUpdate` and `UserRepository.findByIdAndIsActiveTrueForShare` lost their last caller (the old refresh path in A25/A26) before this ticket; not touched here.

**IT changes.**
- `EmailModuleIntegrationTest` rewritten (5): welcome email on the first sign-in in Vietnamese (greeting by first name) and in English; none on the second sign-in; none for a phone-only account; a failing mail server never fails the sign-in.
- `NotificationStompIntegrationTest` (+2, real RabbitMQ): CONNECT refused for a deactivated user and for an unprovisioned subject; the existing delivery test now uses a real active recipient.
- `AuthErrorCodesIntegrationTest` trimmed to the refresh codes (4, one new: the removed endpoints are no longer public). `PublicSurfaceAccessIntegrationTest`: the removed endpoints are rejected by the filter chain. `GlobalExceptionMappingIntegrationTest`: the 415, 400 and validation cases now use `/callback`.
- `SelfDeactivationIntegrationTest`, `UserIdentifierConstraintsIntegrationTest` (first sign-in with a phone, phone clash 409, unparseable phone saved as `INVALID`), `UserDeactivationSessionRevocationIntegrationTest`, `RedisOutageAuthenticationIntegrationTest`, `KeycloakResourceServerIntegrationTest` (a hand-made HS256 token is refused): setup moved off the removed endpoints and tables.
- Deleted: `PasswordResetIntegrationTest`, `AccountReactivationIntegrationTest`, `RegistrationGeoIntegrationTest` (their subjects are gone; the Keycloak equivalents are in `KeycloakCallbackIntegrationTest`).
- Spock: `AuthControllerSpec`, `AuthServiceImplSpec` (welcome email once, none for a deactivated user or the race loser), `JwtTokenServiceImplSpec`, `EmailMessagesSpec`, new `WelcomeEmailServiceSpec`, `StompAuthChannelInterceptorSpec`, and the user specs (`UserProvisioningSpec` checks the `created` flag; the tests of the removed methods are gone).

**Verification.** `:modules:auth:auth-impl:test` 109 passed, `:modules:user:user-impl:test` and `:modules:notification:notification-impl:test` green, and `:server:test` 610 passed, 0 failed on the final run (the suite was 636 before the removed tests left). One earlier combined run had 6 failures in `SessionEventsConsumerIntegrationTest` (`AmqpIOException` connecting to its RabbitMQ container); that class passes alone (6 of 6) and the whole suite passed on the re-run, so it is a container-lifecycle flake between the two RabbitMQ test classes, not a regression. Live on the dev stack: V081 applied on the populated database; the 7 removed endpoints answer 401; the reset mail in English and Vietnamese and the verification mail in English were read in Mailpit; the Swagger client and the `add-test-data` login both produce tokens the backend accepts (`aud` = `sportconnect-api`); a brand-new Keycloak user's first sign-in produced the Vietnamese welcome email. The test users were deleted from Keycloak and the app database afterwards.

**E2E.** Client `e2e` project, scoped to the auth specs (`msw-setup`, `auth-journey`, `auth-errors`, `auth-logout-failed`, `auth-reactivate`): the first run had 13 passed and 5 failed (`auth-journey` x3, `msw-setup` x2); re-running `msw-setup` and `auth-journey` in isolation with `--workers=1` gave 8 passed, so it was a parallel-load flake, not a regression (no client code changed apart from unused error strings). `misc-errors.spec.ts` failed 3 of 3 before and was deleted. The full e2e suite was not run.

**Visual-regression expectation:** no baselined surface touched (the client change is unused error strings, one deleted functional spec and docs), so no baseline change is expected; a failing `visual-regression` run on this Windows host is the noise floor, not a regression. It was not run.

**Follow-ups filed.** **A33** (auth) turn on email and phone verification; **NTF-6** (notification) close open STOMP sockets on deactivation. Production notes for INFRA-14 are in that ticket.
