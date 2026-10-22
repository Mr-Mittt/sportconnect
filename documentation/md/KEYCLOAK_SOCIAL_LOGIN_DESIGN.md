# Keycloak identity and Google / Facebook / Zalo sign-in: design

**Status:** Approved 2026-10-14 (the `/feature "login with google, facebook and zalo"` Phase 4). Tickets filed the same day. **The client and theme parts are gated by auth A24**; the backend parts do not depend on its outcome.

**Inputs:** the Phase 1 scope, the A23 spike findings (`modules/auth/docs/MVP/A23_SPIKE_KEYCLOAKIFY_LOGIN_THEME.md`), the Phase 2 census below.

## 1. Decisions

| Topic | Decision |
|---|---|
| Identity system | Keycloak 26 owns credentials, sessions, refresh and logout. Dev data only, so **no user migration**. |
| Login UI | Keycloak-hosted pages themed with Keycloakify, Authorization Code + PKCE (conditional go, A23). A24 builds our look; a no-go there selects the password-grant hybrid. |
| Providers | Google and Facebook (built-in), Zalo (generic OIDC/OAuth). **Apple and GitHub are out of scope**; the disabled Apple buttons are deleted. |
| Linking | Auto-link on a provider-verified email. **Never by phone** (carriers recycle numbers, a takeover risk). |
| Identifiers | `users.email` nullable, `users.phone_number` unique and nullable (E.164), at least one required. Login by email or phone plus password. |
| Phone status | `users.phone_status` (U25): a phone that does not parse is saved as typed with `INVALID` (first sign-in and Account Settings; hint in the client), not an identifier, not unique; `VERIFIED` is reserved for Zalo or a code check. |
| Phone-only accounts | Recovery and notification path is **A22**, out of this feature. |
| Deactivation | Stays in `users.is_active` (not Keycloak's `enabled`, which would block a social login before our callback and kill auto-reactivate). Gate: a cached per-request `is_active` check by `sub`. |
| Deactivated login | Social: reactivate automatically. Password: `ACCOUNT_DEACTIVATED` plus a server-held `reactivationTicket`, an explicit confirm, no password re-entry. An admin-deactivated account can self-reactivate the same way (today's behaviour). |
| Principal id | `users.id = Keycloak sub` (both UUIDs); the row is provisioned at the first callback. No mapping column. |
| Roles | Stay in our database, not a token claim. |
| Token lifetime | Keycloak access token **5 min** (was 1 h). Refresh stays proxied through the backend (cookie to backend to Keycloak). |
| Phone rules in Keycloak | A Java extension (unique-phone validator, email-or-phone validator, phone-login authenticator) in its **own ticket, branch and commit**, with a half-day spike first. Fallback: enforce in the backend at provisioning and drop phone login. |
| Registration fields | The Keycloak register page collects identifier(s), password, name and language (from the locale). Country, region and location move to a post-first-login "complete your profile" step. |
| Chat service | Verifies via JWKS, reads only `sub`. No `is_active` check (its design reads the local sync cache only), relying on the 5-min lifetime: the accepted answer to **A20**. |
| Local first | Keycloak in Docker Compose now; production waits for INFRA-12. |
| Out of scope | Mobile app, unlinking a provider, contact import, phone-only recovery (A22), production deployment. |

## 2. Flow (hosted pages)

1. The client builds a PKCE pair and redirects to Keycloak. The user signs in (password, or Google / Facebook / Zalo).
2. Keycloak redirects back to the client's `/auth/callback` with a code. The client posts `{code, codeVerifier}` to `POST /api/auth/callback`.
3. The backend exchanges the code, provisions the `users` row on first sight (`id = sub`, name, email, phone, language, `is_email_verified` from the `email_verified` claim), then applies the deactivation rules:
   - active: set the httpOnly refresh cookie, return the access token (the A2 contract);
   - deactivated, social: reactivate, then as above;
   - deactivated, password: `401 ACCOUNT_DEACTIVATED` with a `reactivationTicket`; the Keycloak tokens wait in Redis for 5 min, no cookie. `POST /api/auth/reactivate {ticket}` reactivates and releases them; cancelling drops the ticket and ends the Keycloak session (otherwise the next login would silently loop back to the dialog).
4. Every API request: validate the RS256 token against JWKS (issuer, audience), resolve `sub` to `{isActive, roles}` through one cached `UserService` call (Redis, evicted on deactivate and reactivate, DB fallback via `CacheGuard`). An unprovisioned `sub` or an inactive user is a 401.
5. `POST /api/auth/refresh` and `/logout` proxy Keycloak, applying the same check.

**As built (A26, 2026-10-14):** the cancel step is `POST /api/auth/reactivate/cancel {ticket}` (always 200); the ticket travels in `errorParams.reactivationTicket`; `/logout` is public and driven by the refresh cookie; password versus social is the `identity_provider` claim from a realm session-note mapper (verified against a real brokered login); claims are read from the verified access token; refresh tokens are not rotated (Keycloak default). Known gaps: the ticket needs Redis (A30), Keycloak users have no local password for U22 (U24).

## 3. Phase 2 consumer census (2026-10-14)

| Contract | Consumers | Disposition |
|---|---|---|
| `users.email` nullable | `User.email`, `UserRepository.findByEmail*`/`existsByEmail`, `UserService.getUserByEmail`/`findUserIdByEmail`/`verifyCredentials`/`reactivateUserByEmail`, `GET /api/users/email/{email}`, `GET /api/users/check/email`, `User.getDisplayName()` | updated in **U23** |
| Email-dependent flows | forgot-password, verification and welcome emails, `isEmailVerified` | verification and reset replaced by Keycloak (**A28**); welcome email and the null case: **A22** and A17 |
| Client `email: string` | `auth/types.ts`, `profile/types.ts`, `TopBar`, `AppShell`, Login / Register / Forgot forms | updated in **AUTH-14** |
| `users.phone_number` unique, E.164 | `User`, `RegisterRequest`, `UpdateProfileRequest`, `UserResponse`, `AuthServiceImpl` response map, client `phoneNumber` | updated in **U23** (dev-data cleanup first) |
| Chat JWT verification | `services/chat/internal/auth` (HS256, claims `sub`, `email`, `username`, `roles`; only `sub` is consumed) | updated in **CHAT-17** |
| STOMP `CONNECT` interceptor | `StompAuthChannelInterceptor` via the `JwtTokenService` interface | compatible as-is (follows the interface) |
| Auth endpoints and the old tokens | `AuthController`, client `useLogin` / `useRegister` / `useLogout` / `useSessionBootstrap` / `useReactivate` / reset hooks, `apiClient`, 9 e2e specs and the MSW fixtures, `refresh_tokens` and the reset/verification tables | **A26**, **A28**, **AUTH-14**, **AUTH-15** |
| A15, A18, A19 (on hold or TODO) | session-id logout, session list, refresh-rotation watermark | closed as superseded by **A28** |

## 4. Tickets

| Order | Ticket | Backlog |
|---|---|---|
| 1 | INFRA-13 Keycloak in Compose and realm as code | infra |
| 1 | U23 users schema and null-safe email/phone | user-impl |
| 2 | A25 resource server and the active gate | auth |
| 3 | A26 callback, provisioning, refresh/logout proxy, reactivation ticket | auth |
| 2 | CHAT-17 JWKS verifier | chat |
| 2 | A27 Keycloak Java extension (own branch, commit and PR; half-day spike first) | auth |
| 4 | A28 Keycloak reset/verify replace ours; retire old tables; close A15/A18/A19/A21; answer A20 | auth |
| 4 | A29 social providers | auth |
| 4 | AUTH-14 redirect login, callback page, ticket-based reactivate, nullable email | client |
| gated by A24 | AUTH-15 Keycloakify theme project and e2e against a real Keycloak | client |
| 5 | AUTH-16 post-first-login profile completion | client |
| after INFRA-12 | INFRA-14 production Keycloak on Oracle | infra |

Pre-implementation checks (not yet verified): Keycloak can emit the identity provider into the token (session-note mapper), needed for password-vs-social (A26); a failing validator makes first-broker-login show the profile page (A27 spike); the app copes with a user with no location, including Discover (AUTH-16); Zalo's real claims and whether it returns a phone (A29); `sub` cannot collide with an existing dev `users.id` (U23).

## 5. Tests

Real IT coverage through MockMvc (a locally generated RSA key and a stubbed JWKS for the filter and the gate; a stubbed Keycloak token endpoint for the callback, including the ticket flow, social auto-reactivate and cancel; the new constraints, with the H2 `schema.sql` mirror updated); one Keycloak Testcontainers smoke IT in CI only; a Go test for the JWKS verifier; client e2e for the redirect flow against a real Keycloak in CI (MSW cannot cover a redirect).

## 5b. Update 2026-10-15: email as username

The realm uses Keycloak's "Email as username": no username field on register or login, the sign-in page asks for the email. Keycloak still stores a username internally (it is required), equal to the email. `UserServiceImpl.availableUsername` ignores a `preferred_username` containing `@`, so the email never becomes the public `users.username`. Phone as an identifier waits for A27 (the extension also sets Keycloak's internal username for phone-only users). Existing realms need the flag set through the admin API (`infra/scripts/dev-keycloak-theme.sh` does it).

## 5c. Update 2026-10-15: register-page geo claims (A32)

The Keycloak register page carries optional `countryId`, `regionId`, `latitude`, `longitude` user-profile attributes (language rides on `locale`), mapped to the token claims `country_id`, `region_id`, `latitude`, `longitude` (strings). The first sign-in stores them on the new `users` row; every value is untrusted and a bad one is dropped, never a failure, because the Keycloak account already exists when the claims arrive (the legacy `createUser` rejected the whole registration instead). The client learns of a drop from an empty country (or a country with regions but no region) and opens its profile-completion dialog (AUTH-16). `ReferenceService.isValidSelection` is the non-throwing check the provisioning uses, since the throwing form would mark the transaction rollback-only through the reference service's proxy.

## 5d. Update 2026-10-16: register-page zone and the profile dialog (AUTH-16)

The Keycloak register page renders the zone itself (country, region, "use my current location", language through the page's language links) instead of the four A32 attributes as text boxes. Its country and region lists are the app's public `/api/reference` endpoints, fetched cross-origin from the browser (the API base URL is the Keycloak environment variable `SPORTCONNECT_API_BASE_URL`; the API's CORS list allows the Keycloak origin); the values are posted as the user attributes A32 reads. A user who never saw that page (Google, Facebook, Zalo) or whose zone the backend dropped is asked by the app's skippable "complete your profile" dialog, which opens while the profile has no country, or a country that has regions but no region, and stays away for the rest of the session once skipped or saved.

## 6. Not changing

Posts, groups, sessions, sports and notifications; `users.is_active` as the account state; the `JwtTokenService` interface; INFRA-12's gate on production.

## 5c. Update 2026-10-16: phone rules and the username (A27)

Section 5b is superseded on one point. The realm no longer uses "email as username" (`registrationEmailAsUsername: false`), because that setting makes an email mandatory and so rules out a phone-only account. The Keycloak username is now **the identifier the user registered with**: the email for an email user (so every existing user is unchanged), the E.164 phone for a phone-only user. A registration step in the realm's `sportconnect registration` flow fills a missing `username`, so the register page still shows no username field; the theme hides the `username` attribute Keycloak now lists. The backend still never copies `preferred_username` into the public `users.username` when it contains `@`, and now also not when it is a phone number.

The phone rules are enforced in Keycloak by the provider JAR `infra/keycloak-extensions` (`modules/auth/docs/MVP/A27_KEYCLOAK_JAVA_EXTENSION_PHONE_RULES.md`): a unique phone, email-or-phone, sign-in by phone, and the canonical (E.164) form stored whenever the phone parses. A phone that does not parse never blocks a registration: it is saved as typed, compared as typed, and does not count as an identifier on its own (the backend marks it `INVALID`, U25). The extension uses Keycloak-internal SPIs, so every Keycloak upgrade needs a rebuild and a run of `infra/scripts/verify-phone-rules.mjs`.
