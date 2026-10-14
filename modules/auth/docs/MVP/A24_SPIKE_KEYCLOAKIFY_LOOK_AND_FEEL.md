# A24 · Spike: build our `/login` look as a Keycloakify theme (condition of the A23 go)

**Status:** `DONE` (2026-10-14) · **Type:** Spike / design decision · **Depends on:** A23 (done) · **Gates:** the Keycloak implementation tickets and the final choice of hosted pages over the password-grant hybrid

**Filed:** 2026-10-14, as the condition attached to A23's conditional go.

## Why

A23 proved hosted pages are viable (build, providers, no-email Zalo, code + PKCE) but rendered only the stock Keycloakify theme. "Hosted pages in our look" was **not** tested, and it is the main reason for choosing hosted pages over the hybrid.

## What

Reusing the A23 setup (Keycloak 26 in Compose, Keycloakify v11 starter, Maven on PATH), build the real thing for the login page and measure:

1. Match `client`'s `/login` (`LoginForm`, `AuthShell`) using our design tokens (Tailwind v4 `@theme` in `client/src/index.css`, shadcn primitives). Compare a shared package against copy-paste and name the drift risk of each.
2. The Google, Facebook and Zalo buttons (Zalo icon by `alias`), the register page, and the en/vi inline translations for the pages we use (A23: Vietnamese is not shipped).
3. The pages A23 did not cover: reset-password, update-password, verify-email, OTP, required-action handling.
4. Storybook for the theme pages, and what AUTH-13's auth-screen baselines become.
5. Effort in days for the full set of pages, to compare with keeping our screens (the hybrid).

## Out of scope

Production deployment (INFRA-12), the production implementation, user migration, a custom unique-phone validator or phone login (decided in the `/feature` design, Phase 3).

## Done when

A go / no-go for "hosted pages in our look" with the measured effort. **No-go → the hybrid** is chosen and recorded in A23.

---

# Findings

**Run 2026-10-14**, Windows host, Keycloak 26.4 (`start-dev`, the dev Compose service), Keycloakify 11.16.1, Tailwind 4.3.2, Maven 3.9.9. The spike code stayed in the untracked `tmp/a24-spike/` (not committed). The dev realm was changed for the run (login theme, three placeholder providers, three test users, `verifyEmail`) and **put back afterwards**; the theme JAR was removed from `infra/keycloak/providers`. Everything is **measured** unless marked *estimate* or *not verified*.

## Result: GO for hosted pages in our look

The real `/login` card renders on Keycloak's own page, and a stock page picks up the same look from a class map alone.

| # | Question | Result |
|---|---|---|
| 1 | Does it match `/login`? | **Yes, visually identical.** The client's own `AuthShell` (two-column card, illustration, tagline), `Button`, `Input` and `Label` render unchanged inside the Keycloakify `Template`. Checked at 1280 and 390 px. `LoginForm` itself is **not** reusable: it holds client state and `react-i18next`, so the theme has its own `Login` page (about 130 lines) that reuses the primitives. |
| 2 | Shared package vs copy | **Both work and compile to byte-identical CSS** (same content hash, 17.19 kB, 4.2 kB gzip). *Shared:* a Vite alias `@` to `client/src`, `@import` of `client/src/index.css`, and `@source` limited to the six files the theme uses. *Copy:* the same six files plus `index.css` in the theme. See "Drift" below. |
| 3 | Provider buttons | Google and Facebook use Tabler's brand icons, Zalo a small inline mark chosen by `alias` (Tabler has none). All three render from `social.providers`. Keycloak needs only a provider alias; the label comes from the theme (`continueWith`). |
| 4 | en/vi | **Works, with two traps** (below). Vietnamese was authored for the pages we use, and the strings the client already owns (tagline, heading, labels, button text) are **imported from `client/src/locales/*/login.json`**, so there is no second copy of them. |
| 5 | Other pages | Rendered through real flows against Keycloak: register, forgot-password, update-password (required action), verify-email (required action), mobile-authenticator setup (QR), and the login error. All carry our card, heading, alert style, inputs and buttons from the class map. Storybook mocks cover OTP login, error and IDP review-profile. |
| 6 | Storybook | **Works.** Ten stories (`login/pages`) built to a static Storybook in **35 s** and were captured with Playwright. Mock context shows all 32 languages in the language switcher; the real realm has two. |
| 7 | Build | Theme JAR **2.4 MB**; `keycloakify build` **26 s** warm (first run in A23 was 2m11s with Maven's downloads). |

**Screens checked** (kept in `tmp/a24-spike/`): `login-en-1280`, `login-en-390`, `reg-en`, `reg-vi`, `forgot-en`, `a24upd-en`, `a24ver-en`, `a24totp-en`, `sb-*`.

## What the look cost (measured)

About **40 minutes of work** produced the working login + class map + i18n + JAR + deploy, and **about 25 more minutes** went to four gotchas (below). One time-boxed polish pass on the class map (checkboxes, radios, button rows) took under 2 minutes and fixed those elements; what is left is listed under "Still rough".

**Still rough after the spike** (class-map tweaks, minutes each, not done): the required-field `*` sits on its own line (Keycloakify renders it outside the label); the OTP-setup instructions need list spacing; the radio label wraps under its circle; the checkbox row ("Sign out from other devices") needs alignment.

## Gotchas found (each cost real time, each is now written down)

1. **`vi` is silently English unless it is in the *theme-defined* layer.** Keycloakify resolves a message as: server → theme-defined (`withCustomTranslations`, falling back to **`en`**) → extra-language file (`withExtraLanguages`). Authoring `vi` only through `withExtraLanguages` loses to the English custom keys. Put `vi` in `withCustomTranslations` too. Its type lists only the 32 shipped languages, so `vi` needs a spread (`...{ vi: messages }`) to get past the excess-property check without losing typing on the other keys.
2. **Keys we do not author fall back to English.** The register page showed `Username`, `First name`, `Last name`, `Phone number` in English under `vi`: those are user-profile attribute labels, not stock page keys. Every user-profile attribute label and error needs a `vi` entry.
3. **The first `/auth` request ignores a bare `kc_locale=vi`.** It showed English until the language link was used. The client redirect should send the standard `ui_locales=vi` (to verify when AUTH-14 builds the redirect; *not verified* here).
4. **Windows build traps.** `keycloakify build` ends with a file rename that fails with `EPERM` when the previous JAR still exists, and the failure is easy to miss because the earlier steps print success. A hung `docker cp` also held the JAR open ("Device or resource busy"). A CI runner (Linux) will not see either, but a local rebuild script should delete `dist_keycloak/*.jar` first. `docker cp` into the Compose providers mount (`:ro`) hangs; deploy by copying to `infra/keycloak/providers/` on the host and restarting the service.
5. **Absolute asset paths 404.** `CommunityIllustration` loads `/earth.png`; on Keycloak the page is served under `/resources/<hash>/login/<theme>/`, so the image 404s and the globe is missing (the rest of the illustration is vector and renders). It needs a prop (`earthSrc`, default `/earth.png`) so the theme can pass `kcContext.url.resourcesPath` — a one-line client change that belongs to AUTH-15. (The Storybook render shows that the image file carries a stock-site watermark; worth checking its licence before it is shipped from a second place.)
6. **The mounted `providers` folder is read-only.** Not a theme problem; it only matters for how a dev installs the JAR (see 4).

## Drift: shared vs copy

Measured: the six files and `index.css` are **identical today** between the client and the copy. They changed **6 times in the last 60 days** (and `index.css` has 12 commits in all), so drift is real, not hypothetical.

| | Shared (alias into `client/src`) | Copy into the theme |
|---|---|---|
| Design change in the client | reaches the theme on the next theme build, with no action | **silently missing** from the theme until someone remembers to copy |
| Client change that breaks the theme | possible: any import of app state (router, i18n, a store) added to `Button`, `Input`, `Label`, `AuthShell` or `CommunityIllustration` breaks the theme build, and the client's own CI does not build the theme | not possible |
| Build coupling | the theme build reads `client/src`, so a CI path filter must include both | independent |
| Cost | none | a copy step or a one-off script, plus a review habit |

**Recommendation: shared**, with two guards in AUTH-15: the theme build runs in client CI when any of the shared files change, and the six files stay free of app imports (a note at the top of each is enough; an ESLint `no-restricted-imports` rule for those paths is better). A workspace package (`client/packages/ui`) would make the boundary explicit but is a refactor we do not need yet.

## AUTH-13's auth-screen baselines

AUTH-13's 21 baselines (login default and "password updated", register, forgot-password form and sent, reset-password form and link problem, each at 375/768/1280) cover **client screens that AUTH-14 deletes** (login, register, forgot and reset become Keycloak pages). Measured: Playwright captures the static Storybook (`iframe.html?id=login-pages--login`) in about a second a story, so the same project can baseline the **theme** pages instead, rendered on the Linux CI runner like every other baseline. Plan: AUTH-15 adds the theme baselines, and AUTH-14 removes the 21 client ones with the screens (the `update-baselines` dispatch regenerates the set). The Windows noise floor applies as before.

## Effort (days, *estimate* built from the measured pieces above)

| Piece | Days |
|---|---|
| Theme project in the repo (Node/Maven CI build, JAR into Keycloak, shared-file guards, the `earthSrc` prop) | 1 |
| Login + register at full fidelity (validation display, password rules, a11y, mobile) | 1.5 |
| Register's user-profile attributes in the realm (phone, language; first/last vs full name) and the matching `vi` | 1 |
| Provider buttons + Zalo no-email profile-completion page (`idp-review-user-profile`) polished | 0.5 |
| The remaining pages polished (reset, update-password, verify-email, OTP, TOTP setup, recovery codes, error, logout confirm, page expired, authenticator select) | 1.5 |
| Vietnamese for every page and every user-profile label, and Keycloak's **emails** in vi | 1 |
| Storybook + the Linux-baseline project for the theme pages | 0.5 |
| The redirect e2e against a real Keycloak in CI (A23 showed headless Playwright drives it) | 1.5 |
| **Total** | **about 8.5 days** |

**Against the hybrid** (not re-estimated; A23's reasoning stands): the hybrid keeps our screens but needs a backend password-grant proxy, our own reset/verify/OTP flows, and **still needs the themed Keycloak pages for the social leg** (the browser visits Keycloak to sign in with Google/Facebook/Zalo, and the Zalo no-email completion page is a Keycloak page). So the hosted-page theme is needed under both options; the hybrid adds the screens and the password proxy on top. That is the reason this spike's result is a go and not a close call.

## Decision

**Go: hosted pages in our look, shared files.** Recorded in A23. The implementation tickets already exist (client **AUTH-14**, **AUTH-15**); this spike's follow-ups are written into them as Deltas (see below), not left here.

## Follow-ups filed (real backlog entries)

- **AUTH-15** (client): Delta with the `earthSrc` prop, the shared-file guards, the theme baselines and the `vi` precedence rule.
- **AUTH-14** (client): Delta with `ui_locales`, and the removal of AUTH-13's 21 client auth baselines.

## IT changes

None. The spike changes no product code: no backend, client, migration or `infra` file is touched (only the backlog, this file, the A23 note, AUTH-14/15 and `PROGRESS.md`).

## Not verified

- The Facebook and Google buttons against the real providers (A29 owns provider setup; here they were placeholder providers that only render).
- `ui_locales=vi` on the redirect (finding 3).
- A Linux or CI build of the theme (the run was on Windows; the A23 CI cost note still stands).
- Email templates in vi (Keycloak emails are a separate theme type; *estimate* only).
