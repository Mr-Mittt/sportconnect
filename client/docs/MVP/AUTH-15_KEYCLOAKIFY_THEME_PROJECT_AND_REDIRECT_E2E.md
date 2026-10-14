# AUTH-15 · Keycloakify theme project and the redirect e2e

**Status:** `TODO` · **Type:** Feature + testing · **Depends on:** **auth A24 (go)**, INFRA-13, backend A29 for the provider buttons · **Gates:** nothing

**Filed:** 2026-10-14, from the social-login `/feature`.

## What

- The Keycloakify v11 theme project (login, register, reset, update-password, verify-email, idp review profile, OTP, the Google / Facebook / Zalo buttons with the Zalo icon by `alias`), in our design tokens, shared with the client by the approach A24 chooses. **en and vi inline** (Keycloakify ships no Vietnamese).
- Storybook for every theme page; the AUTH-13 auth-screen baselines move to it.
- A Playwright e2e against a real Keycloak in CI (A23 showed headless Playwright can drive the redirect flow), with the realm import and the theme JAR.
- CI: the theme build (Node, Java, Maven; the first build took 2m11s and produced a 2.2 MB JAR).
- Every user-visible string in en and vi; I18N-4 census row.

## Out of scope

The client redirect and callback (AUTH-14), the Keycloak Java extension (A27).

## Done when

The theme renders every page above in our look, the e2e passes in CI, and the Visual-regression expectation is stated.
