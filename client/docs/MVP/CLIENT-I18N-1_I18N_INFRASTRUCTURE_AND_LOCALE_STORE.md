# CLIENT-I18N-1 · i18n infrastructure, locale store, and `Accept-Language` that follows the in-app locale

**Status:** `TODO`
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
