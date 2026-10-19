# U24 · Self-deactivation and password change for users with no local password

**Status:** `DONE` (2026-10-19) · **Type:** Bug / decision needed · **Depends on:** auth A26 · **Gates:** client ACCOUNT-3, ACCOUNT-4 keep working for Keycloak users

**Filed:** 2026-10-14, found during auth A26: `UserService.provisionExternalUser` creates `users` rows with `password_hash = NULL` (Keycloak holds the credential), and two existing endpoints verify a *local* password.

## The problem

- `POST /api/users/me/deactivate` (U22, `UserServiceImpl.deactivateOwnAccount`) and `PUT /api/users/me/password` (`changePassword`) compare the typed `currentPassword` with `users.password_hash` using `passwordEncoder.matches`. For every user provisioned from Keycloak the hash is null, and BCrypt returns false for an empty hash, so both answer `400 CURRENT_PASSWORD_INCORRECT` **always**. After A26 and the client's move to the redirect login (AUTH-14), no real user can deactivate their own account or change their password from Account Settings (client ACCOUNT-3 and ACCOUNT-4 would just show the wrong-password error).
- The same holds for social and phone-only users by definition: they have no password to type.

## Decision needed

Pick one (or a mix per endpoint) when this is picked up:

1. **Step-up through Keycloak** for deactivation: the client sends the user to Keycloak with `prompt=login` / `max_age=0`, and the endpoint accepts a request only when the access token's `auth_time` is recent (a few minutes). Strongest, no password in our API, works for social users; needs a client round trip.
2. **No re-confirmation beyond the session plus an explicit typed confirmation** ("DEACTIVATE"). Simple; weaker against a stolen unlocked session, but the account can be re-activated (A26), nothing is deleted.
3. Keep the password check **only** for users that still have a local hash (legacy dev data), and use (1) or (2) for the rest.

For **change password**: the credential lives in Keycloak, so the right answer is to send the user to Keycloak's account console or an "update password" required-action link (auth A28 owns the Keycloak side); `PUT /api/users/me/password` then goes away with the old auth endpoints. Decide here whether it is removed now or in A28.

## Consumer census (to redo at pickup)

`UserController` (`/me/deactivate`, `/me/password`), `UserServiceImpl.deactivateOwnAccount` / `changePassword`, `SelfDeactivationIntegrationTest`, client `AccountSettingsModal` deactivate dialog (ACCOUNT-4) and the change-password UI (ACCOUNT-3), the `CURRENT_PASSWORD_INCORRECT` en/vi copy. A client follow-up ticket is filed with the decision (as A22 did), not before: the UX depends on which option is chosen.

## Out of scope

What deactivation does to the user's groups, sessions and posts (unchanged); the Keycloak-side password flows (auth A28).

## Done when

A user who signed in through Keycloak (password, social or phone-only) can deactivate their own account by the chosen mechanism, covered by an IT; the change-password path is either replaced or removed; the client follow-up is filed.

## Scope change (2026-10-19, owner request at pickup): two ways to confirm

Both the deactivation and the password change confirmation offer two methods, chosen by a radio button:

1. **Current password** (as today).
2. **Verify by email:** a "Send code" button emails a one-time code (OTP) valid for 15 minutes; the user copies it into an input in the form. After a send the button is disabled for 60 seconds (countdown) before "Resend".

Findings at pickup that the design must answer (the realm has `directAccessGrantsEnabled: false` and no service account, and the backend has no Keycloak admin access): a Keycloak user's current password cannot be checked by the backend, and a new password cannot be set from our API. See the design in the implementation summary.

**Second scope change (2026-10-19, owner): drop the local password.** `users.password_hash` and every check against it go away (a migration drops the column; `User.passwordHash`, the `PasswordEncoder` use in `UserServiceImpl` and the test mirrors follow). Keycloak is the only place a password lives, so "current password" can only be confirmed by Keycloak, and "change password" can only be applied in Keycloak. Census at pickup: `password_hash` appears in `V001`, the `User` entity, `UserServiceImpl` (`deactivateOwnAccount`, `changePassword`), `UserServiceImplSpec`, `UserSpec`, `UserAccessStateSpec`, `UserIdentifiersSpec`, `UserProvisioningSpec`, the test `schema.sql` and about 30 integration tests that seed users through `BaseIT`/inserts; client `CURRENT_PASSWORD_INCORRECT` is used by `useChangePassword`, `useDeactivateAccount` and `errors.json` en/vi.

**Decision (2026-10-19, owner): the current password is verified by the backend asking Keycloak (option 1A).** A new backend-only confidential realm client with `directAccessGrantsEnabled` does a `grant_type=password` call whose tokens are discarded (only success or failure is read); Keycloak's brute-force detection counts the failures, so the backend rate-limits before calling it; the secret is an env var; realm script plus realm-file mirror (CLAUDE.md realm rule). A user with no password (social-only) uses the email code. The emailed code is owned by the backend (hash in Redis, 15-minute expiry, 60-second resend, 5 attempts, bound to its purpose), not by Keycloak.

**Decision (2026-10-19, owner): change-password applies the new password through the Keycloak admin API (option 2A)**, with a service account limited to `manage-users` on the same new backend client. Scope confirmed locked by the owner ("nothing new to add").

## Built (2026-10-19)

The decisions above, as built. One divergence from the plan, found by a test: the first version of the credential client used `HttpURLConnection` (`SimpleClientHttpRequestFactory`, like `KeycloakTokenClient`), which refuses to hand over the body of a 401 that carries no `WWW-Authenticate` header, and Keycloak answers a wrong password with exactly that (401 + `invalid_grant`); it is now the JDK client (`JdkClientHttpRequestFactory`).

- **The local password is gone.** `V083` drops `users.password_hash` (applied to the dev Postgres, checked); `User.passwordHash`, the `PasswordEncoder` use in `UserServiceImpl`, the `PasswordEncoder` bean in `SecurityConfig` and `spring-security-crypto` in `user-impl` are removed; the test `schema.sql` and every test seed of it (the integration tests, five Spock specs) lost it.
- **Keycloak (`realm-credentials-client.mjs`, `apply-realm-credentials-client.sh`, `verify-credentials-client.mjs`, mirrored in the realm file with its service-account user):** a confidential, backend-only client `sportconnect-credentials`: password grant on, no browser flow, service account with exactly `manage-users` + `view-users`. The secret is `KEYCLOAK_CREDENTIALS_CLIENT_SECRET` (dev default in `application.yml` and the realm file; no default in `application-prod.yml`; INFRA-14 has the note to rotate it).
- **`auth-api` `KeycloakCredentialService`** (`auth-impl` `KeycloakCredentialServiceImpl`): `verifyPassword(userId, password)` (service-account token, username lookup by id, password grant, tokens discarded; `invalid_grant` = false; a wrong client secret, Keycloak down or a 5xx = `ServiceUnavailableException`) and `setPassword(userId, newPassword)` (admin `reset-password`, permanent; a 400 is `NEW_PASSWORD_REJECTED`, a 404 not-found). Only `KeycloakProperties` as a dependency, so no bean cycle with `user-impl`.
- **`user-impl`:** `ConfirmationCodeStore` (Redis, state not a cache: 6 digits, SHA-256 of `user:purpose:code`, 15 minutes, once, 60 second resend lock, 5 wrong tries burn it; plus the per-user wrong-password counter, 5 in 15 minutes, checked before Keycloak is asked), `AccountConfirmationService` (one proof per request, the code email through `EmailSender`), `ConfirmationEmailMessages` + `email/confirm_code_{en,vi}.properties`. `UserServiceImpl`: `deactivateOwnAccount(id, password, code)`, `changePassword(id, password, code, newPassword)`, `sendConfirmationCode(id, purpose)`. `common` gets `TooManyRequestsException` (429).
- **API:** new `POST /api/users/me/confirmation-code` `{purpose}`; `POST /me/deactivate` and `PUT /me/password` take `currentPassword` **or** `verificationCode` (neither/both is `CONFIRMATION_REQUIRED`). `{currentPassword}` alone stays valid, so the shipped dialogs keep working for password users. New codes in `ERROR_CODES.md`; client copy and UI are ACCOUNT-6 (rewritten with this contract).
- **Account lifecycle:** all three entry points answer 404 for a deactivated or unknown caller before any proof is read (`findByIdForUpdate`/`findByIdAndIsActiveTrue`), and the per-request gate already refuses a deactivated token. Other sessions are not ended by a password change (not asked for; Keycloak's own flow behaves the same).
- **Census:** `UserController` (`/me/deactivate`, `/me/password`: shape extended compatibly; `/me/confirmation-code` new), `UserServiceImpl`, `SelfDeactivationIntegrationTest` and `UserErrorCodesIntegrationTest` (reworked off the hash), `BaseIT.createUserWithRoles`, `TestKeycloak` (password grant and admin stand-ins), client `useChangePassword` / `useDeactivateAccount` (compatible as-is, still send `currentPassword`), client e2e MSW handlers (unchanged), `CURRENT_PASSWORD_INCORRECT` en/vi copy (unchanged). Deferred with a filed ticket: the radio, Send button, countdown, OTP input, en/vi copy for the new codes and a 429 category copy: client **ACCOUNT-6**. Not filed on purpose: showing whether an account has a password (the Google-only user sees "incorrect" and switches to the code; ACCOUNT-6 notes it), the security notice after a change (logged as NOTIF-8).

## Folded in at the owner's request: the Redis key inventory

There was no list of the Redis keys in use (`REDIS_RESEARCH.MD` is a stale 2026-07 note). `documentation/md/REDIS_KEYS.md` now lists every key (owner, type, TTL, cache or state, outage behaviour, the rules for a new one), with a pointer in `CLAUDE.md` and a superseded note on `REDIS_RESEARCH.MD`. Finding filed straight away: the `sportconnect:domain-events` stream is never trimmed (chat **CHAT-21**). Also corrected in the inventory: the only Spring Cache (`sport-impl` `"sports"`) is in-process, not Redis.

## Verification

- Spock: `user-impl` 311 (+21: `AccountConfirmationServiceSpec`, `UserServiceImplSpec` confirmation cases), `auth-impl` all green (+ `KeycloakCredentialServiceImplSpec`, a real local HTTP server).
- Integration: new `AccountConfirmationIntegrationTest` (22, real Redis, real Keycloak client against `TestKeycloak`, delivery mocked to read the code: send and countdown, resend too soon, no email, no purpose, no token, deactivated caller; deactivate by code, by password, by a Google-only account, wrong code x5 burns it, expired, wrong purpose, both/neither proof, password lockout, Keycloak down; change password by password, by code for a user with none, wrong password, realm refusal, short password, admin API down); `SelfDeactivationIntegrationTest` 6 and `UserErrorCodesIntegrationTest` 21 reworked. `:server:test` **639**, all green.
- Live: `apply-realm-credentials-client.sh` then `node infra/scripts/verify-credentials-client.mjs` all checks pass on the dev Keycloak, and again on a throwaway Keycloak with a fresh import of the realm file (proves the service-account user imports with its roles); `keycloak-e2e` 11/11 on that import. `V083` ran on the dev Postgres through `bootRun` (column gone); the endpoint answers 401 without a token.
- Not tested: a real browser flow (no client change in this ticket) and a real emailed code through Mailpit.
