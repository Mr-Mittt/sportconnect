# CLIENT-I18N-3 · Translate TopBar, NavTabs, and shared modals/empty/error states

**Status:** `TODO`
**Type:** Enhancement (broad, incremental — expect to split further at pickup if needed)
**Depends on:** CLIENT-I18N-2 (step 1 — establishes the per-page-namespace i18n pattern this reuses)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup (that ticket's own "Notes for pickup"
recommended splitting into one ticket per feature rather than one giant PR; this is step 2 of its
ordered list).

## What

Translate the app-shell chrome every authenticated page renders — `TopBar`, `NavTabs`, and the
generic shared components reused across features (confirm dialogs, empty states, error/loading
placeholders under `src/shared/components/` that aren't already feature-specific). This is the
highest-impact remaining English surface after Login/sign-up/profile-edit (CLIENT-REF-2/3,
CLIENT-I18N-2): it renders on every authenticated screen regardless of which feature page is open.

**Entry point:** any authenticated route (`AppShell`'s `TopBar`/`NavTabs` wrap all of them).
**Inputs/outputs:** no data-shape change — pure UI string extraction into new i18n namespace(s),
following the one-namespace-per-page/feature convention `app/i18n.ts` documents (a `shell` or
`common` addition, decided at pickup based on how much is genuinely cross-page vs. shell-specific).

## Notes for pickup

- **Read `documentation/md/I18N_READINESS.md`'s I18N-10 before starting.** Translating static JSX
  strings is not the whole job — any form/control in scope needs its own check for (a) native HTML5
  constraint validation (`required`, no `noValidate`) rendering the browser's own untranslated popup
  instead of an app-locale message, and (b) whether it shows a server error message verbatim — if so,
  **add its row to I18N-4's own census table** (same section of that doc), don't just note it locally
  in this ticket. Found and fixed twice already (`RegisterForm`, then `LoginForm`) — don't make it
  three.
- Visual baselines change wherever this chrome appears — regenerate via `update-baselines`, never
  from a Windows host.
- Add the new namespace(s) to `.storybook/preview.ts`'s isolated i18next instance too — CLIENT-I18N-2
  found `profile` (CLIENT-REF-3) had been missed there, leaving those stories untranslated in the
  `vi` toolbar; don't repeat that gap for this ticket's own namespace(s).
- Extend `src/app/i18n.test.ts`'s key-parity check to cover the new namespace pair(s).

**Out of scope:** per-feature page content (CLIENT-I18N-4); client-mirrored backend enums
(CLIENT-I18N-5); backend message/enum localization (I18N-4); the language picker UI.
