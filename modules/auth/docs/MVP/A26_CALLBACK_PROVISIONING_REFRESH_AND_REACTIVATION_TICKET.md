# A26 · Code callback, JIT provisioning, refresh/logout proxy and the reactivation ticket

**Status:** `TODO` · **Type:** Feature · **Depends on:** A25 (and U23, INFRA-13) · **Gates:** A28, A29, client AUTH-14

**Filed:** 2026-10-14, from the social-login `/feature` (`documentation/md/KEYCLOAK_SOCIAL_LOGIN_DESIGN.md` §2).

## What

- `POST /api/auth/callback {code, codeVerifier}`: exchange the code with Keycloak; provision the `users` row on first sight (`id = sub`, name, email, phone, language from the locale, `is_email_verified` from `email_verified`); a unique-phone clash or neither identifier returns `PHONE_ALREADY_USED` / `IDENTIFIER_REQUIRED` (also the fallback if A27 fails). Active: httpOnly refresh cookie plus the access token (A2 contract).
- Deactivated, **social**: reactivate and continue. Deactivated, **password**: `401 ACCOUNT_DEACTIVATED` plus a `reactivationTicket` (the Keycloak tokens held in Redis for 5 min, no cookie).
- `POST /api/auth/reactivate {ticket}`: reactivates, releases the tokens and sets the cookie. Cancelling drops the ticket and ends the Keycloak session. Replaces the email-and-password version (A9).
- `POST /api/auth/refresh` and `/logout` proxy Keycloak and apply the A25 gate.
- Telling password from social needs the identity provider in the token (a session-note mapper in the realm). **Verify this first**; if it cannot be done, record the alternative here before building.
- Stable `errorCode`s (C12) with en and vi `errors:codes` entries (or a client ticket filed at once): `ACCOUNT_DEACTIVATED` (exists), the ticket-expired and ticket-invalid codes, `PHONE_ALREADY_USED`, `IDENTIFIER_REQUIRED`.

## Out of scope

The old `/login`, `/register`, reset and verify endpoints (retired in A28); provider setup (A29); the client (AUTH-14).

## Done when

IT with a stubbed Keycloak token endpoint: first-login provisioning, existing user, password deactivated then ticket then reactivated, ticket expired, cancel, social auto-reactivate, refresh of a deactivated user, logout. `:server:test` green.
