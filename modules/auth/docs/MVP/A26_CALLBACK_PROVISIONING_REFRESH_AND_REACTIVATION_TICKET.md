# A26 · Code callback, JIT provisioning, refresh/logout proxy and the reactivation ticket

**Status:** `DONE` (2026-10-14) · **Type:** Feature · **Depends on:** A25 (and U23, INFRA-13) · **Gates:** A28, A29, client AUTH-14

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

## Implementation summary (2026-10-14)

### Scope decisions (Phase 1)

Locked with the user before design:

1. **Legacy password endpoints stay.** `/login`, `/register`, `/forgot-password`, reset and verify are untouched until A28; they already mint a token nothing accepts (A25). Only `refresh`, `logout` and `reactivate` were rewritten (the credentials version of `reactivate` is replaced, as the ticket says).
2. **`logout` is public and cookie-driven.** It used to need a Bearer token; a 5-minute access token is often expired when someone logs out, and only the refresh token can end the Keycloak session.
3. **Realm changes are in this ticket:** the `identity_provider` session-note mapper, `locale` and `phone_number` attribute mappers, and an optional `phoneNumber` user-profile attribute with no validation (A27 owns the phone rules).
4. **One ticket error code**, `REACTIVATION_TICKET_INVALID` (unknown, expired, used, or its session ended), so tickets cannot be probed; plus `AUTH_CODE_INVALID` for a refused code.
5. **A Redis outage blocks ticket issuing** (the ticket store is state, not a cache): the sign-in answers a retryable 503 and ends the Keycloak session. The user asked for this to be a documented known gap rather than engineered around; filed as **A30**.

### Pre-check (the ticket's "verify this first")

Against the real dev Keycloak (a throwaway upstream realm plus a broker, since deleted): a brokered login carries `identity_provider: "<alias>"` in both the access and ID token; a password login carries no such claim. So "social" is "the claim is present". The access token already carries `email`, `email_verified`, `name`, `given_name`, `family_name`, `preferred_username`; `locale` and `phone_number` needed the mappers above.

### Design as approved, and what was built

- **Realm** (`infra/keycloak/realm/sportconnect-realm.json`): the three mappers and the `phoneNumber` profile attribute.
- **`common`**: `ServiceUnavailableException` (503, `SERVICE_UNAVAILABLE`) and its handler.
- **user-api / user-impl**:
  - `User.id` is assigned (random UUID by default) and `User implements Persistable<UUID>` with a transient `newEntity` flag, because a `@GeneratedValue` id plus `save()` of a row with a preset id goes through `merge` and would silently get a new id.
  - `UserService.provisionExternalUser(ExternalIdentity)` is a get-or-create: an existing row is returned untouched (active or not; no re-sync, our database owns the profile after the first sign-in), otherwise it creates the row with `id = sub`, role `USER`, no password hash, the username from `preferred_username` (cut to 50, `-<sub prefix>` suffix when taken), first/last name from the given/family names (else the full name split), the phone through `PhoneNumbers.normalize`, the language only when it is an active language (`vi-VN` falls back to `vi`), `is_email_verified` from the claim. `IDENTIFIER_REQUIRED`, `INVALID_PHONE_NUMBER`, `PHONE_ALREADY_USED` and (new) `EMAIL_ALREADY_REGISTERED`, which `saveUserFlushed` now also maps from a unique-email race.
  - `UserService.reactivateUser(UUID)` (row lock, evicts the access-state cache after commit).
- **auth-api / auth-impl**:
  - `KeycloakProperties` gained `client-id`, `redirect-uri`, `token-uri`, `logout-uri` (dev defaults, required in prod).
  - `KeycloakTokenClient` (`RestClient`, 2 s connect / 5 s read): `exchangeCode`, `refresh`, `endSession`. HTTP 400 is the caller's error; anything else (connection, timeout, 5xx, 401/403 meaning misconfiguration) is `ServiceUnavailableException`.
  - `ReactivationTicketStore`: Redis directly, key = SHA-256 of a 256-bit random ticket, value `userId|kcRefreshToken`, TTL `app.auth.reactivation-ticket-ttl` (5 min), consumed with an atomic `GETDEL`.
  - `AuthService`: `callback`, `reactivate(ticket)`, `cancelReactivation`, `refreshToken` (Keycloak refresh, then the A25 gate on the new access token), `endSession`; `logout(UUID)` stays for the deactivation path (legacy rows).
  - Claims are read from the **access token** through the existing verified `JwtDecoder` (one verification path); a token Keycloak itself just issued that fails verification is a 503, not a 401.
  - Every failure after the code exchange except the deliberate `ACCOUNT_DEACTIVATED` ends the Keycloak session again, otherwise the next login would sign in silently and land on the same failure.
  - Controller: `POST /callback`, `POST /reactivate {ticket}`, `POST /reactivate/cancel {ticket}`, `POST /logout` (cookie-driven; Keycloak unreachable gives 503 and keeps the cookie so it can be retried); the cookie `Max-Age` follows Keycloak's `refresh_expires_in` (`AuthResponse.refreshTokenMaxAgeSeconds`, not serialized). `SecurityConfig` lists `/callback`, `/reactivate/cancel` and `/logout` as public.
- **Error codes** registered in `documentation/md/ERROR_CODES.md`: `AUTH_CODE_INVALID`, `REACTIVATION_TICKET_INVALID` (new), `ACCOUNT_DEACTIVATED` (now also from the callback, with `errorParams.reactivationTicket`), `REFRESH_TOKEN_INVALID` marked no longer returned. Client copy (en and vi) for the two new codes is added to **AUTH-14**'s ticket (a real backlog entry), together with the cancel endpoint and the logout change.

### Divergences from the plan / things found

- **A lost first-sign-in race can surface as a 409, not only a primary-key error.** The loser may hit the winner's email or phone index first (same person), so `AuthServiceImpl.provision` retries once on `DataIntegrityViolationException` *or* `ConflictException`; the retry finds the winner's row by id, and a genuine clash fails the same way again. Found by the first run of the concurrency IT (one of two threads got 409).
- **The race is also serialised per subject on PostgreSQL.** `provisionExternalUser` first takes `pg_advisory_xact_lock(0x5C01, hashtext(sub))` (`UserProvisioningLock`, user-impl): a second concurrent first sign-in of the same `sub` waits for the first to commit and then finds its row, so the retry above is now only the net for two *different* subjects on one email or phone, which a per-`sub` lock cannot see. Transaction-scoped (released at commit/rollback), works across instances, 32-bit hash (a collision only makes two subjects wait briefly). The namespace `0x5C01` is the registry entry for this use and must never change once deployed; any new advisory lock takes its own. On other databases (the H2 ITs) the lock is a no-op, so the IT proves the retry path and `UserProvisioningLockSpec` proves the SQL and the dialect switch. Checked by hand against the dev Postgres: a second transaction on the same `sub` waited for the first (about 2.8 s of a 4 s hold), one on another `sub` did not wait.
- **Keycloak does not rotate refresh tokens by default** (`revokeRefreshToken` is off): the old refresh token keeps working until the SSO session ends, and every refresh also returns a new one. I left the realm as it is and made the test stand-in match. Enabling rotation with reuse detection would kill the whole session when two tabs refresh at once, which is worse than the exposure here (httpOnly, `SameSite=Strict`, path-scoped cookie; session bounded by idle 1 day / max 7 days; logout ends the session). A reason to revisit with A15/A18's replacement in A28.
- **Keycloak revokes the session when an authorization code is replayed** (seen live: after a replayed code, the first session's refresh token was refused). Good for security; it is why the live script replays last.
- **`REFRESH_TOKEN_INVALID` can no longer be told from an expired token** (Keycloak answers `invalid_grant` for both), so refresh returns `REFRESH_TOKEN_EXPIRED_OR_REVOKED` for all of them.
- **Provisioned users have no local password hash, so U22's self-deactivation and `changePassword` always answer `CURRENT_PASSWORD_INCORRECT` for them.** Not fixable inside this ticket (it needs a decision); filed as **U24** (user-impl).

### Behaviour changes to know about

- `POST /api/auth/logout` no longer needs a Bearer token and no longer revokes by user id; it ends the Keycloak session of the cookie.
- `POST /api/auth/reactivate` takes `{ticket}`, not credentials. The client's current `useReactivate` is broken until **AUTH-14**, as is the whole login (A25 already broke it until this ticket); dev sign-in works again through the Keycloak redirect once AUTH-14 lands.
- The refresh cookie now holds Keycloak's refresh token; `Max-Age` is Keycloak's `refresh_expires_in` (86400 s in dev).
- `expiresIn` stays in milliseconds (300000), the unit the client already reads.

### Verification

- `:server:test`: **633 tests, 0 failures** (600 before). `:modules:auth:auth-impl:test` 141, `:modules:user:user-impl:test` 268 (2 skipped, pre-existing), `:modules:common:test` 336, all green.
- **Real Keycloak 26.4 + the real backend (`bootRun`, dev profile), 30 checks, all passed**: first password sign-in (200, httpOnly `Path=/api/auth` `SameSite=Strict` cookie with `Max-Age=86400`, `users.id = sub`, phone `+84912000111`, verified flag, role `USER`, no password hash, language preference `vi` from the `locale` claim, the returned access token works on `/users/me`); replayed code (401 `AUTH_CODE_INVALID`); refresh (200, new cookie); logout (200, cookie cleared, a later refresh refused, so the SSO session really ended); deactivated password user (401 `ACCOUNT_DEACTIVATED` + ticket, no cookie, still deactivated), confirm (200, active, token works), second use (401 `REACTIVATION_TICKET_INVALID`); cancel (200, ticket dead, account still deactivated, and the next authorization request shows the login form again, i.e. the Keycloak session was ended); a brokered "social" user through a throwaway upstream realm (provisioned with `id = sub`, deactivated, signs in again: 200 and active at once); refresh of a deactivated user (401, no cookie). Throwaway users, the upstream realm and the broker were deleted; the dev `users` table is back to its 208 rows; the backend was stopped. The dev Keycloak was re-imported from the new realm file (database dropped and recreated, per the INFRA-13 procedure; its users are gone, as that procedure says).
- Not run against the real thing: the Redis-down branch of ticket issuing (unit-tested in `ReactivationTicketStoreSpec` and `AuthServiceImplSpec`; an IT with Redis stopped mid-run would need a container toggle), Google/Facebook/Zalo (A29), and a Keycloak outage mid-flow (covered with the stub's 503).

### IT changes

Added:
- `KeycloakCallbackIntegrationTest` (37, `RedisBaseIT`): first sign-in provisioning (claims mapped, `id = sub`, phone-only, split full name, unverified email, taken username, unknown language, cookie attributes, the returned token works on `/api/users/me`); **two concurrent first sign-ins create one user and both succeed** (run 5 times, stable); an existing user is not overwritten; the deactivation matrix (password: ticket without cookie or token and account still deactivated, confirm, once-only, expired, unknown, session ended meanwhile, cancel ends the session, cancel of an unknown ticket, ticket TTL of 5 min in Redis; social: automatic re-activation, visible to the A25 gate at once); the failure paths (unknown code, wrong verifier, replayed code, missing verifier, phone clash, duplicate email, no identifier, invalid phone, each ending the Keycloak session; Keycloak down gives 503); refresh (new cookie, deactivated, unprovisioned, unknown token, Keycloak down gives 503 not 401); logout (ends the session without a Bearer token, no cookie, already-dropped session, Keycloak down gives 503 and keeps the cookie).
- `TestKeycloak` grew the token side: `/token` (authorization code + PKCE, refresh grant) and `/logout` (end session), scripted with `issueCode` / `startSession`, inspected with `sessionEnded` / `sessionAlive` / `latestRefreshToken`, switched off with `tokenEndpointAvailable(false)`; it behaves like the real realm where the backend depends on it (a code works once, wrong verifier is `invalid_grant`, an ended session refuses every token). `BaseIT` points `app.keycloak.token-uri`, `logout-uri` and `redirect-uri` at it.

Updated:
- `PublicSurfaceAccessIntegrationTest`: the public list now includes `/callback`, `/reactivate/cancel` and `/logout`; logout is public (200 without a cookie); a GET on `/callback` or `/reactivate` is not public.
- `AccountReactivationIntegrationTest`: keeps the legacy-login and reset cases; the credentials-based `reactivate` and refresh cases moved to the new IT.
- `SelfDeactivationIntegrationTest`, `UserDeactivationSessionRevocationIntegrationTest`: the refresh cookie is a Keycloak session now (and the test checks that deactivation ends it); re-activation goes through callback + ticket.
- `AuthErrorCodesIntegrationTest`: the unknown and revoked refresh cases are now `REFRESH_TOKEN_EXPIRED_OR_REVOKED` against the stub.

Spock: `AuthServiceImplSpec` (callback, reactivate, cancel, refresh, endSession, the race, session ending on every failure), `AuthControllerSpec` (cookie contract, cookie-driven logout), `KeycloakTokenClientSpec` (12, against a local HTTP server), `ReactivationTicketStoreSpec` (10), `UserProvisioningSpec` (21), `UserIdentifiersSpec` (the email-race case now maps to 409).

### Follow-ups (all filed)

- **A30** (auth): the re-activation ticket survives a Redis outage (the known gap above).
- **U24** (user-impl): self-deactivation and change-password for users with no local password (needs a decision; the client part, ACCOUNT-3 / ACCOUNT-4, follows it).
- **AUTH-14** (client): now also lists `/reactivate/cancel`, `errorParams.reactivationTicket`, `AUTH_CODE_INVALID` / `REACTIVATION_TICKET_INVALID` en and vi copy, the public cookie-driven logout (and what to show on its 503), and the retired `REFRESH_TOKEN_INVALID`.
- **A28**: notes added for the Swagger `oauth-token` helper (broken since A25), the legacy `refresh_tokens` rows and `AuthService.logout(UUID)`, `reactivateUserByEmail`, and revisiting refresh-token rotation.
- Not touched: **A14** (the failing-lookup IT and the 503-versus-500 question stay as A25 left them), A15/A18/A19 (closed by A28).
