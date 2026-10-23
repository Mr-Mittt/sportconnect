# AUTH-15 · Keycloakify theme project and the redirect e2e

**Status:** `DONE` (2026-10-15) · **Type:** Feature + testing · **Depends on:** **auth A24 (go)**, INFRA-13, backend A29 for the provider buttons · **Gates:** nothing

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

## Delta (2026-10-15, from AUTH-14)

- **The redirect is covered by a stand-in until this ticket:** AUTH-14's e2e specs drive the real client redirect against `e2e/mocks/keycloakStub.ts` (a browser-level 302 back to `/auth/callback`) and the MSW `/api/auth/callback` handler. This ticket adds the one e2e against a **real Keycloak** (the realm with the theme); keep `keycloakStub.ts` for the other specs, which only need to be signed in.
- **The `login` namespace stays:** AUTH-14 deleted the `register`, `forgotPassword` and `resetPassword` locale files, but kept `src/locales/{en,vi}/login.json` (tagline, heading, subheading, the `form.*` strings) because the theme imports them (A24). Strings the Keycloak pages need beyond those (register labels, forgot/reset copy, update-password) are authored in the theme, not recovered from the deleted client files (git history has them).
- **a11y gate:** AUTH-14 removed the `/login`, `/register`, `/forgot-password` and `/reset-password` axe/overflow/Tab-order tests from `a11y.spec.ts`; the themed pages need the equivalent gate (Storybook-based or against the real Keycloak).
- **Hosted-page translations:** AUTH-14 sends `ui_locales=<app language>`; verify the themed page opens in Vietnamese from it (A24 could not).

## Scope decisions (2026-10-15, Phase 1 of the pickup)

- **Location:** a new `client/keycloak-theme/` pnpm package (own `package.json`; `tsc && vite build && keycloakify build`; alias `@` to `client/src`). The A24 spike code was never committed, so it is rebuilt here.
- **Pages:** every page in the "What" list is built and polished in this ticket (not split): login, register, forgot/reset, update-password, verify-email, idp review profile, OTP, TOTP setup, recovery codes, error, logout confirm, page expired, authenticator select.
- **Realm:** no new user-profile attributes. The theme renders what the realm has today (`username`, `email`, `firstName`, `lastName`, `phoneNumber`; the `locale` claim mapper exists). Country, language and unique-phone rules stay with AUTH-16 and A27.
- **CI is in this ticket:** the theme build job and the real-Keycloak redirect e2e are part of "Done when". A workflow cannot be executed on GitHub from the dev machine, so it is verified locally (same script, same steps) and the first GitHub run is recorded as a conditional.
- **Out:** Keycloak's vi *emails* (email theme type) belong to A28.
- **`/earth.png`:** the A24 watermark note stands only as a check item. The file in `client/public/earth.png` visibly carries a "Vecteezy" watermark; the owner says the image was generated with Claude design, so it is to be confirmed or replaced (see the Phase 1 answer).

# Implementation summary (2026-10-15)

## Design as approved

A separate pnpm package `client/keycloak-theme/` (Keycloakify 11.16, React 18, Tailwind 4.3, Storybook 10) that compiles the client's own tokens and primitives through an `@` alias, so the Keycloak pages cannot drift from the app. One custom page (`login.ftl`); every other Keycloak page is Keycloakify's stock page inside our `Template` (the client's `AuthShell` card) and styled by a class map. en + vi. A real-Keycloak e2e (own Playwright config), a Storybook-based visual spec and a11y gate, and CI for all of it.

## What was built

- **Theme package** (`client/keycloak-theme/`): `Template` (AuthShell card, language links, server message as an alert, try-another-way, provider slot), `pages/Login` (password toggle, busy state, bfcache reset, wrong-password error), `components/ProviderButtons` (Google, Facebook, Zalo icon by `alias`, a generic icon for any other provider), `classes.ts` (the class map: the stylesheet for every stock page), `theme.css` (what a utility cannot express: required mark, nested checkbox/radio rows, TOTP steps, recovery-code grid, the few PatternFly classes stock pages hard-code), `i18n.ts`, `messages/{en,stockKeys}.ts`, `messages_vi.ts`, 17 stories in `KcPage.stories.tsx` (login with/without providers and with an error, register with/without errors, reset, update-password, verify-email, IDP review profile, OTP, TOTP setup, recovery codes config/input, error, logout confirm, page expired, select authenticator), a Vitest suite for the messages (5 tests).
- **Client**: `CommunityIllustration` and `AuthShell` take an optional `earthSrc` (default `/earth.png`; test file added, 3 tests); ESLint `no-restricted-imports` on the six shared files (no router, i18n, stores, query), verified to fire; ESLint ignores `keycloak-theme` and Vite's `.vite` cache.
- **Realm**: `"loginTheme": "sportconnect"` in `infra/keycloak/realm/sportconnect-realm.json` (the only realm change; no attributes).
- **Scripts**: `infra/scripts/dev-keycloak-theme.sh` (the local loop: build, restart the Compose Keycloak, set the dev realm's login theme through the admin API; `SKIP_BUILD=1` to reuse the JAR), `infra/scripts/build-keycloak-theme.sh` (falls back to the usual Windows locations of node, pnpm, java and Maven, then a JDK + Maven check, deletes the old JAR first for the Windows `EPERM` trap, installs to `infra/keycloak/providers/` or a given dir) and `infra/scripts/run-keycloak-e2e.sh` (builds the JAR, starts a throwaway Keycloak 26.4 on :8082 with the realm and JAR, waits, runs `pnpm e2e:keycloak`, always tears down; `--keep` for debugging).
- **Tests**: `e2e/keycloak/redirect.spec.ts` (9 tests) with `keycloakAdmin.ts`; `e2e/theme/auth-theme-a11y.spec.ts` (70 tests, new `theme` Playwright project); `e2e/visual/auth-theme.spec.ts` (57 test instances); `e2e/mocks/staticServer.ts` and `themeStorybook.ts`; the mock `/api/auth/callback` accepts any code when `MOCK_AUTH_ACCEPT_ANY_CODE=1`.
- **CI** (`client-ci.yml`): the `test` job gains theme lint/typecheck/unit, the theme Storybook build, the theme a11y gate; new `keycloak-e2e` job (setup-java 21, runs the script, uploads the JAR and a failure report); path filters now include `infra/keycloak/**` and the two scripts.
- **Docs**: I18N-4 census row for the Keycloak pages, `E2E_OVERVIEW.md` (projects, directory, commands, three new catalog sections), `INFRA-13` (the CI note closed, the realm theme line), client `README.md`, root `CLAUDE.md` Commands.

## Key decisions and findings

- **Keycloak's server renders some strings.** The wrong-password alert, field validation errors and profile-attribute labels (`${username}`, `${firstName}`, ...) come from `messages_<lang>.properties`, which `keycloakify build` generates by evaluating the vi file **statically** (it follows neither an import nor a spread, and only recognises a bare `import('./messages_vi')` in `getMessages`). A first version silently produced no `messages_vi.properties`, so the register page showed English labels under `ui_locales=vi`. Now `messages_vi.ts` is a plain literal for everything the server renders (guarded by a test) and the build output was checked (`messages_vi.properties` present). The build still warns that `withCustomTranslations` is not statically evaluable; that is benign (documented in `i18n.ts`): its keys come from the client's `login.json` and the server never renders them.
- **`ui_locales=vi` works** against a real Keycloak (A24 finding 3, now verified): Vietnamese sign-in and register pages, and a Vietnamese server message.
- **A real a11y issue**: Keycloakify's stock OTP, recovery-code and logout-confirm pages hard-code `tabindex > 0` (axe serious). `Template` strips it.
- **Provider buttons** draw from whatever providers the realm lists, so A29 (the real Google / Facebook / Zalo apps) does not gate the theme; the e2e container gets three placeholder providers through the admin API (never in the realm file).
- **Stock pages through a class map** (A24's result) covered all 17 pages with one custom page; the polish was CSS (required mark, list and checkbox rows, PatternFly leftovers) and Vietnamese, not 14 page components.

## Divergences from the approved plan

- The plan's `@source not '../keycloak-theme'` in the client's `index.css` was **dropped**: the theme's stylesheet imports that file, so the exclusion also removed the theme's own classes from its build. The client's Tailwind auto-detection may therefore pick up a few theme-only utilities (harmless; build output folders are git-ignored, so no doubling).
- The e2e client runs on **:5175**, not 5173 (a developer's own `pnpm dev` held 5173); the spec adds that origin to the e2e Keycloak's web client through the admin API, so the committed realm is unchanged.
- 17 stories, not 16, so **57** baselines (17 × 3 + login and register in vi × 3), not 54.
- Added after discovery: the static-literal guard test, the `tabindex` fix, the `.vite` ESLint ignore (a pre-existing lint failure whenever a dev server had run), `chmod` in `run-keycloak-e2e.sh` (a `mktemp -d` folder is mode 700 and Keycloak's container user cannot read it on a Linux runner), and a clean-first `build-storybook` (a rebuild over an existing output folder failed with `EEXIST` and left a half-built folder).

## E2E

`e2e` project, 14 spec files (the five auth specs, `admin-route-guard`, `admin-sports`, `account-deactivate`, `locale`, `a11y`, `post-deep-link`, `profile-journey`, `session-errors`, `post-errors`, `msw-setup`): **76 passed**. Not run: about 19 other flow specs (they only sign in through the same `seedAuthenticatedSession` helper the 76 exercise). Also: the real-Keycloak run **9 passed** (`run-keycloak-e2e.sh`, Docker, Keycloak 26.4.7) and the `theme` project **70 passed**. Scoped Vitest (`features/auth`, `app`, `shared/components`, `features/admin`, `features/profile`, `App.test.tsx`): 95 of 96 files passed; the one failure, `app/noRawServerError.test.ts` (2 tests), timed out under load at 12 s and **passes in isolation** (5.8 s), a load flake, not a regression. `tsc -b` clean; client `eslint` clean (the two known `SessionStartTimePicker` warnings); theme `tsc`, `eslint` and Vitest (5) clean.

## Visual-regression expectation

(b) **57 new baselines** `auth-theme-<story>-<width>.png` (17 stories × 375/768/1280, English) and `auth-theme-login|register-vi-<width>.png` (6) legitimately appear and are expected to fail (missing baseline) until the `update-baselines` GitHub dispatch generates exactly those files; every existing baseline must come back byte-identical (no existing screen changed). The dispatch now also builds the theme Storybook. I ran one theme visual test locally only to prove the spec loads (it wrote a Windows baseline, which I deleted); no baseline was committed. The globe in these baselines still carries the Vecteezy watermark until AUTH-17 replaces the image; regenerate again then. **Executed by AUTH-19 (2026-10-22): the dispatch artifact was classified by SHA-256 against the committed set and exactly the 90 predicted files differed (84 new, 6 changed), the other 153 byte-identical; commit `160ee0c`.** The 57 baselines of this ticket are part of the 81 `auth-theme-*` files created there (25 stories x 3 widths + login and register in Vietnamese x 3; the extra ones are AUTH-16's and the A29/A33 `link-account-*` pages), with the AUTH-17 globe. Human check of `auth-theme-register-1280`: the globe, the zone block and the name row render as designed.

## IT changes

None on the backend (client, realm and infra only). Test files added or changed are listed under "What was built".

## Real-Keycloak verification

Run with the throwaway container (not the dev Compose Keycloak): a protected deep link lands on the themed page with S256 PKCE, the three provider buttons and the client's background token; no asset 404 (the `earthSrc` fix); a real sign-in returns through `/auth/callback` to the deep link; wrong password shows the themed alert; `/register` (`prompt=create`) renders and registering a user returns to the app; forgot-password is themed; under `vi-VN` the sign-in and register pages, the profile labels and the server's own error message are Vietnamese. Looked at by eye in Storybook: login (en/vi, 3 widths), register with errors, TOTP, IDP review, recovery codes, select authenticator, logout confirm.

## Not verified

- The GitHub Actions workflow itself (cannot run it from here): the first run on GitHub is the conditional; it uses the same two scripts that passed locally on Windows + Docker. A Linux-only trap (`mktemp` permissions) was fixed blind.
- The provider buttons against the real Google, Facebook and Zalo apps (A29), and the Zalo no-email first-login page (idp-review-user-profile renders from a mock context only).
- Linux-rendered baselines; the pages I did not eyeball (reset, update-password, verify-email, OTP, error, expired, recovery-code input) were checked only by axe, overflow and the vi/en parity tests.
- The Vietnamese copy for the stock pages is mine, not reviewed by a native speaker.
- Deploying the JAR to a real Keycloak (INFRA-14 already lists "the theme and extension JARs").
- Facebook / Google displayName rendering with other `displayName` values (the e2e uses "Google", "Facebook", "Zalo").

## Follow-ups filed

- **AUTH-17** (client `client/docs/BACKLOG_MVP.md`): replace the watermarked `earth.png`.
- Dev Keycloak: an existing realm keeps its old theme (the import is `IGNORE_EXISTING`): to see the theme locally run `infra/scripts/build-keycloak-theme.sh`, restart Keycloak, and set Realm settings > Themes > Login theme to `sportconnect` (noted in INFRA-13).
