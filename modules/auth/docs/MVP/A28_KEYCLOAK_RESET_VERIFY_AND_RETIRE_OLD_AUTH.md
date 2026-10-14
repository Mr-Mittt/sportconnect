# A28 · Keycloak owns reset and verification; retire the old auth endpoints and tables

**Status:** `TODO` · **Type:** Refactor / cleanup · **Depends on:** A26, CHAT-17 · **Gates:** nothing

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

- Keycloak sends the reset and verify-email messages: an email theme with **en and vi** and the realm SMTP settings. Our email module keeps the welcome email (A17).
- Remove `/api/auth/{login,register,forgot-password,reset-password,reset-password/validate,verify-email}`, `PasswordResetService`, `EmailVerificationService`, the `refresh_tokens`, `password_reset_tokens` and `email_verifications` tables and entities, `TokenRevocationChecker`, and the HS256 path in chat.
  - **Left for this ticket by A25 (2026-10-14):** `TokenRevocationChecker` is already deleted; still to remove are the legacy HS256 mint (`JwtTokenServiceImpl.generate*`, `JwtProperties.secret`/`expiration`, `AuthServiceImpl` token issuing) and `refresh_tokens` revocation (`revokeAllUserTokens`), which no access-token check reads any more. Decide `/api/auth/oauth-token` (Swagger's Authorize button) against Keycloak.
- Close **A15, A18, A19** and **A21** as superseded (note on each ticket and move to Done / Removed per the backlog convention), narrow **A17** to the welcome email, and record the **A20** answer (5-min lifetime, chat's accepted risk, STOMP through the A25 gate). Update the I18N-4 census for the removed forms.
- Consumer census before deleting: every caller of each removed endpoint across the backend, the client and the 9 e2e specs and MSW fixtures.

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
