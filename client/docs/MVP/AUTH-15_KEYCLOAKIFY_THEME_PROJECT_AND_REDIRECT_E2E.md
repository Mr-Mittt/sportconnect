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
## Delta (2026-10-14, from auth A24 — go, shared files)

Measured in A24 (`modules/auth/docs/MVP/A24_SPIKE_KEYCLOAKIFY_LOOK_AND_FEEL.md`): the theme reuses the client's own `AuthShell`, `Button`, `Input`, `Label`, `cn` and `index.css` through a Vite alias and renders identically to `/login`; shared and copied files compile to byte-identical CSS. Do the following here:

- **Shared, with guards:** alias `@` to `client/src` in the theme; Tailwind `@source` limited to the files the theme uses (an unrestricted `@source` or a stray build folder in the theme directory doubles the CSS). Run the theme build in client CI when any shared file the theme imports changes, and forbid app imports (router, i18n, stores) in those files (ESLint `no-restricted-imports`).
- **`CommunityIllustration` asset path:** it loads `/earth.png`, which 404s on Keycloak (pages are served under `/resources/<hash>/login/<theme>/`). Add an `earthSrc` prop (default `/earth.png`); the theme passes `kcContext.url.resourcesPath`. Check the image's licence (the render shows a stock-site watermark).
- **Vietnamese:** put `vi` in the theme-defined layer (`withCustomTranslations`, via a spread) as well as `withExtraLanguages`, or the English custom keys win. Every user-profile attribute label and error needs a `vi` entry. Import strings the client already owns from `client/src/locales/*/login.json` instead of copying them.
- **Class map** is the stylesheet for every stock page (default CSS off); polish the required-field `*`, checkbox/radio rows and the OTP instruction list.
- **Baselines:** add Storybook-based baselines for the theme pages (Playwright captures the static Storybook; Linux CI renders them). AUTH-14 removes AUTH-13's 21 client auth baselines with the screens.
- **Local rebuild on Windows:** delete `dist_keycloak/*.jar` before `keycloakify build` (the final rename fails with `EPERM` otherwise); install the JAR by copying to `infra/keycloak/providers/` and restarting, never `docker cp` into the read-only mount.
