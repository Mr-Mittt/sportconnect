# CLIENT-I18N-1 · i18n infrastructure, locale store, and `Accept-Language` that follows the in-app locale

**Status:** `DONE` (2026-09-28)
**Type:** Infrastructure (Foundation)
**Depends on:** none to build; language *persistence* for a signed-in user needs backend **U16** (until then the choice is
stored locally only)
**Supersedes:** V1 backlog **`I18N-1`** ("Introduce i18n / multi-language UI text support", filed 2026-07-21 as an
unscoped placeholder) — that row is marked `SUPERSEDED` and its six open questions are answered below.
**Filed:** 2026-09-25, from the `/feature` session "Language, country and zone"
(`documentation/md/REFERENCE_DATA_DESIGN.md` § 9). Not to be confused with the *considerations* numbered `I18N-<n>` in
`documentation/md/I18N_READINESS.md` — this is the ticket that builds against them.

## What

Add app-wide i18n **infrastructure** with two locales, `en` and `vi` (BCP 47 codes, matching A13), and prove it on a
small first surface (translated by CLIENT-REF-2/3). **Not** a translation of the whole app (CLIENT-I18N-2).

- **Library:** `i18next` + `react-i18next` (Vite-compatible; `next-intl` etc. are Next.js-only — I18N_READINESS I18N-6).
  This is the one permitted new dependency category; note it in `client/CLAUDE.md`'s stack table.
- **Bundles:** `src/locales/{en,vi}/*.json`, statically bundled, one namespace per feature area
  (`common`, `auth`, `profile`, …). Initialise in `src/app/i18n.ts`, imported by the app entry.
- **`localeStore`** (`src/app/localeStore.ts`, Zustand): the active language code. Source order: signed-in user's stored
  language (once U16 ships) → locally stored choice → `navigator.languages` → `en`. Sets `<html lang>`. Storing the
  *language code* in `localStorage` is fine (not a token); wrap access in try/catch.
- **`Accept-Language` follows the in-app locale** (I18N_READINESS **I18N-2**): an `apiClient` interceptor sets it from
  the store. `Accept-Language` is not a forbidden header (confirm live once).
- **Query keys** for locale-dependent queries (`useSportAttributeSchema`, `useSessionAttributeSchema`, …) include the
  locale so switching language refetches rather than serving the previous language's cache.
- **Formatting:** use `Intl` for anything this ticket touches; do not change existing date/number formatting elsewhere.

## Answers to V1 `I18N-1`'s open questions

1. Languages: `en` + `vi`, general N-locale framework (adding one is a bundle + a `languages` seed row).
2. Scope: infrastructure + sign-up + profile-edit first; the rest incrementally (CLIENT-I18N-2).
3. Library: `react-i18next`.
4. Strings: JSON per locale in the repo, owned by whoever ships the UI copy.
5. Tests: **keep Vitest/RTL pinned to `en`** (a test setup that initialises i18n with `en`, so existing literal-string
   assertions keep passing); new tests may assert against `vi` explicitly. Prefer roles/labels over raw text in new tests.
6. Backend strings: out of scope (I18N-4/5, not built) — server messages shown verbatim stay English for now.

## Edge cases

- Unsupported browser language (`fr`) → `en`.
- Missing key in `vi` → falls back to `en` (configure `fallbackLng`), never renders the raw key.
- Locale changes at runtime must update `<html lang>`, the `Accept-Language` header, and refetch locale-keyed queries.
- No token or auth data ever touches `localStorage` (client/CLAUDE.md) — only the language code.

## Tests

Vitest for `localeStore` (source order, fallback, `<html lang>`), the interceptor header, and a small integration test that
switching language re-renders a translated component. e2e: the `Accept-Language` request header changes after a
switch (MSW handler inspection). Storybook: a global locale toolbar switch, if cheap. Visual baselines are not expected to
change in *this* ticket (no visible string is translated yet) — state that explicitly at close-out.

**Out of scope:** translating any screen beyond a demo string (CLIENT-REF-2/3, CLIENT-I18N-2); the language picker UI
(CLIENT-REF-1/3); backend messages/enums (I18N-4/5); backend `Accept-Language` preference (A24).

## Scope decisions (2026-09-28 pickup, before Phase 2)

Answered before implementation, all within the ticket's own stated scope (no ticket-text change needed):

1. **"Signed-in user's stored language" is wired now, not stubbed.** U16 shipped (2026-09-26) since this ticket was
   filed, so its own conditional — "once U16 ships" — is satisfied. Added a new `useUserPreferences()` hook
   (`GET /users/me/preferences`) and `useSyncUserLocale()`, mounted once in `RootLayout` next to
   `useSessionBootstrap`. This is a **new unconditional fetch on every authenticated session**, discovered via the
   consumer census to affect `App.test.tsx` (default + 3 test-specific `apiClient.get` mocks) and
   `AdminLayout.test.tsx`'s `mockSportReads` — all four/one updated with a `/users/me/preferences` branch, same
   precedent as SPORT-3/NTF-3/FEED-6/FEED-7 before it.
2. **Proof string is a real, already-shipped string** (`TopBar`'s "Log out"), not a test-only demo component — the
   ticket's own "Out of scope" line already permitted "a demo string"; this just picks a real one instead of inventing
   a throwaway one. Census: `TopBar.test.tsx` + 8 e2e role-name assertions all keep passing unchanged, since Vitest is
   pinned to `en` and Playwright's default context locale is `en`.
3. **Only the `common` namespace ships** (one key: `logOut`) — `auth`/`profile` namespaces are created by
   CLIENT-REF-2/3 when they have real strings, not scaffolded empty here.

## Implementation summary

Built exactly the Phase 3 design, plus the scope decisions above:

- **`src/shared/lib/locale.ts`** — `SUPPORTED_LOCALES`/`LocaleCode`, `mapToSupportedLocale`, `detectBrowserLocale`.
- **`src/app/localeStore.ts`** — Zustand + `persist` (localStorage, key `locale-storage`), single persisted field
  `locale`. `setLocale` (explicit action, unused until CLIENT-REF-1/3's picker) and `setUserLanguage` (tier-1 override,
  no-op for an unsupported/`null` language) both set `<html lang>` as part of the same update; `onRehydrateStorage`
  re-applies it after async rehydration. **Simplification vs. the original 4-tier design:** collapsed to one
  persisted field rather than tracking "explicit choice" separately from "resolved locale" — tier 2 (stored choice)
  falls out naturally from persisting `locale` itself, and tier 1 is just "the one thing allowed to overwrite it
  later." No revert-on-logout: there's no separate explicit-choice value to fall back to, so a user's last active UI
  language persists after signing out (deliberate, not a bug — documented on `setUserLanguage`).
- **`src/app/i18n.ts`** — `i18next` + `react-i18next`, bundled `en`/`vi` `common` resources, subscribes to
  `localeStore` to call `changeLanguage`. Imported once from `main.tsx`.
- **`src/app/apiClient.ts`** — `attachAcceptLanguageHeader`, wired into the shared `createAuthenticatedClient` factory
  (covers `apiClient` and `chatApiClient` both).
- **`useSportAttributeSchema`/`useSessionAttributeSchema`** — query key gained a `locale` segment; no manual
  invalidation needed since a new key is a new query to TanStack Query.
- **`src/features/profile/useUserPreferences.ts`** + `UserPreferenceResponse` type + `useSyncUserLocale.ts`** — the
  tier-1 wiring from scope decision 1.
- **`TopBar.tsx`** — "Log out" through `t('logOut')`.
- **Storybook** — `.storybook/preview.ts` uses its **own** isolated `i18next` instance, not `src/app/i18n.ts`.
  **Deviation from the original plan:** importing the app's own i18n module (which imports `localeStore.ts`, touching
  `document`/`localStorage`/`navigator`) doesn't typecheck under `tsconfig.node.json` (`.storybook/**/*.ts`'s
  project — Node-only `lib`, no DOM). Adding `"DOM"` to that shared lib was tried first and rejected: it broke
  `e2e/mocks/mockServer.ts`'s unrelated `Buffer`/`BodyInit` typing (that file is compiled under the same
  `tsconfig.node.json`). An isolated instance sidesteps the whole issue and is arguably more correct anyway —
  Storybook stories are reviewed one at a time, not exercising the app's own locale source-order logic.
- **`tsconfig.app.json`** (and, for the same JSON-import reason, `tsconfig.node.json`) — `resolveJsonModule: true`.

**Tests:** `locale.test.ts`, `localeStore.test.ts`, `apiClient.test.ts` additions, `useUserPreferences.test.tsx`,
`useSyncUserLocale.test.tsx`, a `vi`-locale assertion added to `TopBar.test.tsx`, `useSessionAttributeSchema.test.tsx`'s
key-shape assertion updated, `App.test.tsx`/`AdminLayout.test.tsx` fixture updates (scope decision 1), and a new
`e2e/flows/locale.spec.ts` (2 tests) + `e2e/mocks/handlers/preferences.ts`.

**E2E:** full `e2e` project run: **91 passed, 1 failed** (`friends-journey.spec.ts`'s cancel-request step) — re-run in
isolation and it **passed**, confirming a suite-parallelism flake unrelated to this change (nothing in this ticket
touches friend requests). `locale.spec.ts` itself: 2/2 passed, including the `getByLabel(..., { exact: true })` fix
needed once "Show password"'s `aria-label` turned out to substring-match a bare `getByLabel('Password')` (same
convention `auth-journey.spec.ts` already uses).

**Visual-regression expectation:** no baselined surface's rendering changes — `TopBar`'s "Log out" renders byte-
identically at the `en` locale (the baseline locale; only `vi` differs). Ran `app-home-feed.spec.ts` on
`visual-regression` to confirm: 9/9 failed, but a `git stash`-and-rerun with this ticket's changes fully removed
produced the **exact same 9 failures** — the documented Windows font-rendering noise floor (`IT_OVERVIEW.md`-style
investigation), not a regression from this change.

Full Vitest suite (`pnpm test`): 186 files / 1440 tests passed (18 non-fatal `vitest-pool` worker-startup timeouts —
environment flakiness on this machine, not test failures; all listed files still show as passed).
