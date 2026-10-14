# A23 · Spike: Keycloak + a Keycloakify login theme for Google/Facebook/Zalo sign-in

**Status:** `DONE` (2026-10-14) · **Type:** Spike / design decision · **Depends on:** none to start (local Docker Compose); production hosting depends on **INFRA-12** · **Gates:** the social-login feature (`/feature`, paused after Phase 1) and the closing of A15/A18/A19

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

**Run 2026-10-14**, Windows host, Docker 29, Keycloak 26.4.7 (`start-dev`), Keycloakify 11.16.1 (the unmodified `keycloakify-starter`). Spike code stayed in the untracked `tmp/a23-spike/` and is not committed. **Everything below is measured unless marked "not verified".**

### Measured

| # | Check | Result |
|---|---|---|
| 7 | Build cost | `keycloakify build` needs **Apache Maven on PATH**. It does **not** download one (it stops with "Apache Maven required"). First build **2m11s** including Maven downloading its own dependencies; the theme JAR is **2.2 MB**. It produces two JARs; Keycloak 26 uses `keycloak-theme-for-kc-all-other-versions.jar`. CI needs Node, Java and Maven. |
| 7 | Runtime | Keycloak 26.4.7 started in 12 s and used **~810 MiB** idle in `start-dev` with H2 (INFRA-12's 1-1.5 GB estimate for Keycloak stands; a production build with Postgres was not measured). Mounting the JAR into `/opt/keycloak/providers` and setting the realm `loginTheme` was enough; the page rendered through the theme. |
| 3 | How providers reach the theme | Generically: `kcContext.social.providers[]` carries `alias`, `displayName`, `iconClasses`, `loginUrl`. Google and Facebook (built-in provider types) rendered buttons with icons; a **custom Zalo** provider (generic OIDC, here a second realm standing in for Zalo) rendered with **empty `iconClasses` and no icon**, so the theme must map its own Zalo icon by `alias`. |
| 4 | Zalo without an email | A Zalo-like login with no email lands on the first-broker-login "Update Account Information" page (themed), which demands Email, First name and Last name by default. With `email`, `firstName` and `lastName` made optional in the realm's user profile, the login completes **with no extra page**, and the issued token has `sub` and `preferred_username` but **no `email` claim**. |
| 6 | Phone and registration fields | A custom `phoneNumber` user-profile attribute accepts an E.164 pattern validator and rejects `0901`. **Keycloak does not enforce uniqueness of a custom attribute** (two users with the same `+84901234567` were both created) and **does not enforce "at least one of email or phone"** (a user with neither was created). Both rules must therefore live in our `users` table (unique index, check) and be checked by the backend, or need a custom Keycloak validator extension (Java, not built). Logging in **by phone** is not a Keycloak default (it takes username or email); it needs a custom authenticator or phone-as-username. Not built. |
| 5 | en/vi | Keycloakify ships **32 languages and Vietnamese is not one of them** (`login/i18n/messages_defaultSet`). `kc_locale=vi` rendered English. Vietnamese must be authored inline in the theme: the English set is ~470 entries, though only the pages we use need it. |
| 9 | Token and JWKS | The authorization-code + PKCE exchange works. The access token is RS256 (JWKS serves `RS256/sig`), has `iss`, `sub`, `sid`, `azp`, `preferred_username` and **`aud: account`**, so the backend needs an audience mapper or validator rule. The token has no `isActive` and no app user id; the backend must map `sub` to `users` itself. |
| 8 | Tests | Headless Playwright (the client's existing install) drove the whole redirect flow against a real Keycloak and read the callback URL, so **a real Keycloak in CI is workable**; it would need the realm import and the theme JAR, and a Maven build. MSW cannot cover it. |

### Not verified (left open on purpose)

- **Our look and feel (item 2).** Only the default Keycloakify theme was rendered; I did **not** build our `/login` design with our Tailwind v4 tokens, so "matches our design" and the shared-package-vs-copy question are unanswered. Keycloakify documents Tailwind and shadcn support, but that is the docs' claim, not mine.
- Real Google and Facebook apps (the buttons rendered, but no login against the real providers); the real Zalo API's actual claims and whether it returns a phone at all.
- A real **Spring** resource server: validation was checked at the protocol level only (JWKS, claims). The callback that sets the httpOnly refresh cookie and the deactivation decision were not built.
- Page templates beyond login and first-broker-login (register, reset, update-password, verify-email, OTP), required-action handling, Storybook, and the upgrade story for Keycloak or Keycloakify.
- Production (`start`) mode with Postgres, and the arm64 build.

### Assessment and recommendation (the decision is the owner's)

Keycloakify hosted pages are **technically viable** for this stack, and the measured costs are small (2.2 MB JAR, Maven in CI, ~810 MiB). The measured **costs that are real**: we author Vietnamese ourselves, the Zalo icon and any look-and-feel work are ours, and **two of our decided rules (unique phone, email-or-phone) are not enforceable inside Keycloak** and move into our backend or a custom Java extension. The biggest gap is that the look-and-feel check (2) was not done, so "hosted pages in our look" is not yet proven.

**Proposed: conditional go** for hosted pages with Authorization Code + PKCE, conditional on a short follow-up that builds the actual `/login` look with our tokens. If that look cannot be matched cheaply, fall back to the hybrid. **Decision (owner, 2026-10-14): accepted the conditional go.** Hosted pages with Authorization Code + PKCE are the working direction; the condition is filed as **A24** (build our `/login` look, measure the effort), and a no-go there selects the hybrid.

**Scope note (2026-10-14):** the implementation tickets (Keycloak setup/migration, social providers, client) are not filed by this ticket. Their design (phone login, unique phone and email-or-phone enforcement, Zalo no-email flow, audience mapper, `sub`-to-user mapping, vi strings) is the `/feature` Phase 3, and they are filed as real backlog entries when its Phase 4 plan is approved.
