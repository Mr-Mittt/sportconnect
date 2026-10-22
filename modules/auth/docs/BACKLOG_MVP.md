# Auth Module — Feature Backlog

**Version:** MVP v1  
**Module:** `modules/auth/auth-impl`  
**Last updated:** 2026-10-16

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon auth MVP` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A14](MVP/A14_NARROW_JWT_FILTER_CATCH_ALL.md) | Low priority: narrow `JwtAuthenticationFilter`'s catch-all so unexpected failures (DB, claim bugs) surface as a 5xx with an `errorCode` instead of a silent 401 that triggers client refresh churn; found during A11 | `TODO` |
| 2 | [A16](MVP/A16_SERIALIZE_REFRESH_WITH_PLAIN_LOGOUT.md) | Low priority: a refresh racing a plain `logout` is not serialized by the U12 `users` row lock (only `deleteUser` takes it), so a refresh in flight can mint a live token pair just after logout; found during A12 | `TODO` |
| 3 | [A22](MVP/A22_USERS_WITHOUT_EMAIL_RECOVERY_AND_NOTIFICATION_PATH.md) | Accounts with no email (phone-only, Zalo) have no recovery or notification path: add/verify email later, what password reset and the verification/welcome emails do when `email` is null; depends on the social-login feature; client follow-up to be filed with the decision | `TODO` |
| 4 | [A29](MVP/A29_SOCIAL_PROVIDERS_GOOGLE_FACEBOOK_ZALO.md) | Google and Facebook (built-in) and Zalo (generic OIDC) providers, linking on a verified email only, never by phone; needs the owner's provider apps | `TODO` |
| 5 | [A30](MVP/A30_REACTIVATION_TICKET_SURVIVES_REDIS_OUTAGE.md) | Low priority, known gap from A26: the re-activation ticket lives only in Redis, so while Redis is down a deactivated password user cannot get or confirm a ticket (503, session ended); keep Redis as the fast path with a database fallback, or accept and document it | `TODO` |
| 6 | [A33](MVP/A33_REQUIRE_VERIFIED_EMAIL_AND_PHONE.md) | Turn on verification together: realm `verifyEmail: true` (action-token lifespan raised, verify page checked) and phone verification setting `phone_status` `VERIFIED`; kept off in A28 by decision; protects A29's link-on-verified-email | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [A27](MVP/A27_KEYCLOAK_JAVA_EXTENSION_PHONE_RULES.md) | Done 2026-10-16: Keycloak provider JAR `infra/keycloak-extensions` (unique phone, email-or-phone, sign-in by phone; a phone that does not parse never blocks, it is kept and compared as typed), realm script `realm-phone-rules.mjs`, the username is now the identifier the user registered with (realm leaves email-as-username; a registration step fills it, the backend never copies a phone username to the public one); live check 18/18, 36 Spock cases, real-Keycloak e2e 11/11; client AUTH-18 filed | `DONE` |
| 2 | [A28](MVP/A28_KEYCLOAK_RESET_VERIFY_AND_RETIRE_OLD_AUTH.md) | Done 2026-10-16: Keycloak owns reset and verification (email theme `sportconnect`, en and vi, live-checked in Mailpit); removed `register`, `login`, `forgot-password`, `reset-password`(+`/validate`), `verify-email`, `oauth-token`, `PasswordResetService`, `EmailVerificationService`, the HS256 mint, `JwtProperties`/`app.jwt`/`JWT_SECRET`, the `UserService` password-flow methods and the auth call in deactivation; **V081 drops `refresh_tokens`, `password_reset_tokens`, `email_verifications`** (applied on the populated dev DB); welcome email now sent once by the first sign-in; Swagger Authorize is Keycloak (client `sportconnect-swagger`); `add-test-data` signs in at Keycloak; STOMP `CONNECT` runs the active gate (**A20 answered**); closes A15/A18/A19/A21/A17; `:server:test` 610; **A33**, **NTF-6** filed | `DONE` |
| 3 | [A20](MVP/A20_WEBSOCKET_AND_CHAT_ACCEPT_REVOKED_TOKENS.md) | Answered by A28 (2026-10-16): REST gate, STOMP `CONNECT` now checks `is_active`, chat accepts the 5-minute window (CHAT-17); open sockets on deactivation filed as NTF-6 | `DONE` |
| 4 | [A17](MVP/A17_WIRE_VERIFICATION_AND_WELCOME_EMAILS.md) | Closed by A28 (2026-10-16): Keycloak sends the verification email (gating on it is A33); the welcome email is sent by the first sign-in | `DONE` |
| 5 | [A32](MVP/A32_REGISTRATION_GEO_CLAIMS_INTO_PROVISIONING.md) | Done 2026-10-15: the register page's country, region and location reach `users` as token claims (`country_id`, `region_id`, `latitude`, `longitude`); realm attributes and mappers from one script (API and realm-file modes); first-sign-in provisioning stores them on a new row and drops invalid values (logged, never a failure) via the non-throwing `ReferenceService.isValidSelection`; `KeycloakCallbackIntegrationTest` +3, user/auth/reference specs, `:server:test` 636; **unblocks client AUTH-16** | `DONE` |
| 6 | [A24](MVP/A24_SPIKE_KEYCLOAKIFY_LOOK_AND_FEEL.md) | Spike done 2026-10-14 (**go**, hosted pages in our look with the client's own files): the real `/login` card, Google/Facebook/Zalo buttons and en/vi render on Keycloak's page; stock pages take the look from a class map; shared and copied files compile to byte-identical CSS (recommend shared, with CI guards); Storybook builds in 35 s and can baseline the theme pages instead of AUTH-13's client ones; four gotchas found (vi precedence, English fallback for unauthored keys, absolute asset paths, Windows JAR rename); about 8.5 days of theme work (estimate). Follow-ups are Deltas in client AUTH-14 and AUTH-15 | `DONE` |
| 7 | [A26](MVP/A26_CALLBACK_PROVISIONING_REFRESH_AND_REACTIVATION_TICKET.md) | Done 2026-10-14: `POST /api/auth/callback` completes the Keycloak sign-in (code exchange, first-sign-in provisioning with `users.id` = `sub`, httpOnly cookie); deactivated **social** user is re-activated, deactivated **password** user gets `401 ACCOUNT_DEACTIVATED` + a Redis-held `reactivationTicket` (confirm `POST /reactivate`, decline `POST /reactivate/cancel`); `refresh` and the now public, cookie-driven `logout` proxy Keycloak; codes `AUTH_CODE_INVALID`, `REACTIVATION_TICKET_INVALID`; realm gained the `identity_provider`, `locale`, `phone_number` mappers; `User.id` is assigned; `KeycloakCallbackIntegrationTest` (37) + 30 live checks against Keycloak 26.4; **U24**, **A30** filed; social-login chain | `DONE` |
| 8 | [A25](MVP/A25_RESOURCE_SERVER_AND_ACTIVE_GATE.md) | Done 2026-10-14: the backend is a Keycloak resource server (RS256 against the realm JWKS, issuer and `aud` checked, lazy key fetch) and every request passes one cached `UserService.getAccessState` gate (Redis 60 s, evicted on deactivate and reactivate, DB fallback) for `is_active` and roles; replaces `TokenRevocationChecker` and the HS256 check, so **login/register tokens are accepted nowhere until A26**; 503 `SERVICE_UNAVAILABLE` when the key set is unreachable, A14 catch-all narrowed; `KeycloakResourceServerIntegrationTest` (15) plus rewritten deactivation and Redis-outage ITs; social-login chain | `DONE` |
| 9 | [A23](MVP/A23_SPIKE_KEYCLOAKIFY_LOGIN_THEME.md) | Spike done 2026-10-14 (conditional go, hosted pages; Keycloakify viable, but unique phone and email-or-phone are not enforceable in Keycloak, vi must be authored, look-and-feel left to **A24**): Keycloak + a Keycloakify login theme (Authorization Code + PKCE, hosted pages in our look) vs the password-grant hybrid, for Google/Facebook/Zalo sign-in; gates the social-login feature and the closing of A15/A18/A19; production hosting waits for INFRA-12 | `DONE` |
| 10 | [A21](MVP/A21_RESET_TOKEN_CHECK_ENDPOINT_AND_ATOMIC_RESET.md) | Reset links (2026-10-13): public read-only `POST /api/auth/reset-password/validate` (one generic 404 `RESET_TOKEN_INVALID` for an unknown, used or expired token) and one transaction for claim-token + new password + revoke tokens, so a failed password update no longer burns the link and two concurrent submits cannot both win; built on the AUTH-9 branch; `PasswordResetIntegrationTest` +4 | `DONE` |
| 11 | [A13](MVP/A13_LOCALISE_VERIFICATION_AND_WELCOME_EMAILS.md) | New standalone `email` module (`email-api` `EmailSender`/`EmailMessage`, `email-impl` async SMTP sender); auth renders the text and picks the language, so the verification and welcome emails now have en/vi bundles beside the reset one (2026-10-11); `resolveLanguage` needs all three bundles; the reset email moved to the new module; the other two are localised but **not wired** (neither was ever sent), filed as **A17**; `EmailModuleIntegrationTest` | `DONE` |
| 12 | [A12](MVP/A12_EVICT_REVOCATION_CACHE_ON_LOGOUT_AND_DEACTIVATION.md) | Logout, deactivation and password reset now evict the cached revocation watermark after commit (2026-10-10): `TokenRevocationChecker.evictAfterCommit` via `CacheGuard`; "never revoked" sentinel cached for 5 s (`app.jwt.revocation-sentinel-ttl`) to bound a request racing a logout; prod lifetime was 24 h; 3 new ITs; **A15**, **A16** filed | `DONE` |
| 13 | [A11](MVP/A11_REDIS_OUTAGE_DEGRADATION_TOKEN_REVOCATION.md) | Redis outage no longer takes down authentication (2026-10-09): new shared `common.cache.CacheGuard` (throttled WARN, recovery INFO); `TokenRevocationChecker` falls back to the DB watermark and skips the write-back; `connect-timeout` 1 s; `RedisOutageAuthenticationIntegrationTest`; ticket symptom corrected (401, not 500) | `DONE` |
| 14 | [A10](MVP/A10_WIRE_FORGOT_PASSWORD_TO_RESET_TOKEN_EMAIL.md) | `forgot-password` now issues and emails a reset token (2026-10-09): `UserService.findUserIdByEmail` (deactivated included), one token per user via V078 unique `user_id`, email sent after commit, `reset-password` revokes refresh tokens, expiry in `app.password-reset.expiration-minutes`, link default `:5173`, **reset email in the user's language** (preference, else country default, else `en`; en/vi bundles); `PasswordResetIntegrationTest`; **A12** and **A13** filed | `DONE` |
| 15 | [A9](MVP/A9_REFRESH_INACTIVE_USER_DEAD_BRANCH_AND_404_LEAK.md) | Deactivated accounts (2026-10-09): login answers `ACCOUNT_DEACTIVATED` for correct credentials, new public `POST /api/auth/reactivate` re-activates and logs in, refresh gives the generic 401 instead of a 404; `AccountReactivationIntegrationTest`; client AUTH-10 filed | `DONE` |
| 16 | [A7](MVP/A7_AUDIT_PUBLIC_API_SURFACE_AND_REMOVE_UNUSED_ENDPOINTS.md) | Audit the public API surface (2026-10-08): blanket `permitAll` on `/api/auth/**`, `/api/sports/**` and the hashtag reads replaced by an explicit public list; nothing deleted; `PublicSurfaceAccessIntegrationTest`; INFRA-10 filed | `DONE` |
| 17 | [A8](MVP/A8_STRUCTURED_ERROR_CODES_ON_APIRESPONSE_ERROR.md) | **[Error handling · Phase B]** Auth error-code audit (2026-10-05): 12 sites coded, register duplicate email 400 → 409, codes in `ERROR_CODES.md`, `AuthErrorCodesIntegrationTest` | `DONE` |
| 18 | [A6](MVP/A6_DROP_AUTH_TABLES_USER_ID_FKS.md) | Drop DB-level FKs on auth tables' `user_id` columns (cross-domain, violates domain-scoped-tables rule) | `DONE` |
| 19 | [A4](MVP/A4_JTI_REFRESH_TOKEN_UNIQUENESS.md) | JWT `jti` claim for guaranteed token uniqueness | `DONE` |
| 20 | [A2](MVP/A2_REFRESH_TOKEN_HTTPONLY_COOKIE.md) | Refresh token via httpOnly cookie (client epic's BE-1) | `DONE` |
| 21 | [A3](MVP/A3_FIX_LOGOUT_AUTHORIZATION.md) | Fix `/api/auth/logout` authorization (client epic's BE-2) | `DONE` |

---

**Dependencies:**
```
A2 and A3 are independent of each other, but both touch AuthController.java —
consider doing them in the same session.
Both block the new client's auth integration (see client/docs/BACKLOG_MVP.md):
A2 blocks AUTH-3 and AUTH-5; A3 should ship before AUTH-4 reaches production.
A4 has no dependencies — discovered during AUTH-3's manual verification, fixed
alongside it on the same client branch (user decision).
A5 (rate limiting) moved to V1 on 2026-10-08 — see Removed / Deferred.
```

*(Ticket numbering starts at A2 — A1 was moved to `BACKLOG_V1.md`, see Removed / Deferred.)*

---

## Removed / Deferred

| Ticket | Decision |
|---|---|
| A1 · Apply Redis for refresh token storage | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-07-03) — deprioritized to V1 |
| [A19](MVP/A19_REFRESH_ROTATION_POISONS_REVOCATION_WATERMARK.md) · Refresh rotation poisons the revocation watermark | Folded into **A15** (2026-10-11), then superseded with it by Keycloak sessions (A28, 2026-10-16) — user decision; priority lowered to medium after a hand test showed the client's retry recovers (one wasted 401 + one extra refresh per affected device) |
| [A15](MVP/A15_PER_SESSION_LOGOUT.md) · Per-session logout | Superseded by Keycloak sessions (A28, 2026-10-16): a session is a Keycloak SSO session, logout ends only that one; no `sessionId`, watermark or `refresh_tokens` any more. Client AUTH-11 superseded with it |
| [A18](MVP/A18_SESSION_LIST_AND_REVOKE_ONE.md) · Active-session list and revoke-one | Superseded by Keycloak (A28, 2026-10-16): no session table here to list; a sessions screen would read Keycloak's account API (new ticket if wanted). Client AUTH-12 superseded with it |
| A5 · Login/registration rate limiting | Moved to `modules/auth/docs/BACKLOG_V1.md` (2026-10-08) — user decision: not much user in MVP, need more user first |
