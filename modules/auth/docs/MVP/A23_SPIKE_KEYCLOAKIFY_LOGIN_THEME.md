# A23 · Spike: Keycloak + a Keycloakify login theme for Google/Facebook/Zalo sign-in

**Status:** `TODO` · **Type:** Spike / design decision · **Depends on:** none to start (local Docker Compose); production hosting depends on **INFRA-12** · **Gates:** the social-login feature (`/feature`, paused after Phase 1) and the closing of A15/A18/A19

**Filed:** 2026-10-14, from the social-login `/feature` scoping.

## Background

Decisions already taken for the social-login feature: full move to Keycloak (it owns credentials, sessions, refresh and logout); dev data only, so no user migration; auto-link on a provider-verified email and never by phone; phone becomes a second unique identifier (`email` nullable, at least one required); phone-only recovery is **A22**; a social login auto-reactivates a deactivated account; Apple and GitHub are out of scope (the disabled Apple buttons on `/login` and `/register` are removed); Keycloak runs in Docker Compose locally first.

Still open is **how our login UI reaches Keycloak**:

- **Hybrid:** keep the React screens; the backend calls Keycloak's password grant (discouraged by Keycloak, absent from OAuth 2.1, blocks required actions and MFA, hides the real client IP from brute-force protection), and social login redirects out and back.
- **Hosted pages themed with Keycloakify** (MIT, React + TypeScript, builds a theme JAR, Storybook preview, Tailwind/shadcn supported): Authorization Code + PKCE, no password grant, MFA/passkeys/required actions available, our backend never sees a password. Costs: login, register and reset screens are rebuilt in the theme; the MSW-based e2e cannot cover a redirect flow; Keycloak's emails and message keys replace ours.

The owner chose to spike the Keycloakify option before deciding.

## What

Build a throw-away spike (not merged to `src/`) and record answers in **Findings**:

1. Keycloak 26 in Docker Compose (an extra service next to `infra/docker-compose.dev.yml`'s Postgres/Redis/RabbitMQ), Keycloakify v11 starter, theme JAR mounted into the providers directory.
2. **Look and feel:** can the theme match our `/login` using our design tokens (Tailwind v4, shadcn)? Compare a shared package against copy-paste, and the drift risk of each.
3. **Providers:** Google and Facebook buttons rendered in the theme, and a custom Zalo provider (OIDC/OAuth). Record how the provider list reaches the theme.
4. **Zalo without an email:** the first-broker-login path. Confirm a themed profile-completion page keeps the user in our look, and what happens to the unique-phone rule.
5. **Pages:** which templates are themed and usable (login, register, reset, update-password, verify-email, idp review profile, OTP) and the en/vi story (translations must be inline in the theme).
6. **Registration fields:** country and language as user-profile attributes vs a post-login onboarding step.
7. **Build cost:** Maven/Java in CI, JAR size, how a Keycloak or Keycloakify upgrade is handled.
8. **Tests:** how the redirect flow is covered in Playwright (a real Keycloak in CI vs a stub), and what happens to AUTH-13's auth-screen baselines (they would move to Storybook for the theme pages).
9. **Spring side:** a local resource server validating a Keycloak-issued token (JWKS), the code-exchange callback that sets the httpOnly refresh cookie (A2 contract), and where deactivation is decided (stays in `users.is_active`; the backend decides at the callback: social reactivates, password returns `ACCOUNT_DEACTIVATED`).
10. **Open facts to verify** (not confirmed when this was filed): how social providers reach the theme context, the full list of supported page templates, and required-action handling in Keycloakify.

## Out of scope

Production deployment (INFRA-12), the production implementation, user migration, Apple/GitHub, phone-only recovery (A22).

## Done when

Findings are written here with a go / no-go for Keycloakify hosted pages, the choice between hosted pages and the hybrid is recorded, and the `/feature` is resumed at Phase 2. On a **go**, the implementation tickets (auth, user `email`/`phone_number` migration, client, infra) are filed as real backlog entries before this ticket closes.

## Findings

_Not started._
