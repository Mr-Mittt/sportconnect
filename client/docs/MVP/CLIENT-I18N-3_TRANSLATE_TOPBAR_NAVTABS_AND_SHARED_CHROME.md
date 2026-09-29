# CLIENT-I18N-3 · Translate TopBar, NavTabs, and shared modals/empty/error states

**Status:** `DONE` (2026-09-29)
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

## Scope change at pickup (2026-09-29, user decision)

Investigated `src/shared/components/` before locking scope: every component this ticket's own
description anticipated as generic ("confirm dialogs, empty states, error/loading placeholders")
turned out, on inspection, to be domain-specific content owned by one feature (post/broadcast/
sport/session/hashtag), just filed under `shared/components/` rather than a feature folder. The
only components with **zero domain content and zero caller variance** are `TopBar`, `NavTabs`,
`AuthLoadingState`, `ComingSoonPage` — these get plain default translation keys, no override
mechanism (there is nothing to override: each renders once, always the same way).

Separately, the user directed a new i18n convention for shared components whose text a caller
might reasonably want to vary: a **default + prefix-override** key resolution — a shared component
exposes a default key in a new `sharedDialogs` namespace (e.g. `sharedDialogs:joinFeedback.gotIt` =
"Got it"), and a caller can optionally pass an i18n key prefix in i18next's own `"namespace:key.path"`
syntax (e.g. `"profile:save"`); if `profile:save.joinFeedback.gotIt` exists in that feature's own
namespace, it wins, otherwise the `sharedDialogs` default renders. Implemented with i18next's
native key-fallback array (`t([\`${prefix}.joinFeedback.gotIt\`, 'sharedDialogs:joinFeedback.gotIt'])`),
not custom plumbing — see `src/shared/lib/useOverridableText.ts`.

**Applied to all 6 dialog-shaped components under `shared/components/`** (user decision — every
one gets the mechanism, not just the 3 with more than one current call site):
- `JoinFeedbackDialog` (AppShell, any page's join action) — cross-page today
- `ReactivateSportNudgeDialog` (every page except `/profile`) — cross-page today
- `UnsavedPostConfirmDialog` (`CreatePostForm`, mounted on Home Feed + Groups) — cross-page today
- `AddSportIntroDialog` (GRP-8 invite-accept flow) — single caller today
- `NoSportsToAddDialog` (`AddSportModal`'s "Add sport" flow) — single caller today
- `UpdateBroadcastConfirmDialog` (`GroupsPage`) — single caller today

None of these have a second caller wanting different wording *today* — the override plumbing is
built ahead of a concrete need, by explicit user decision, not discovered as a live requirement.
`TopBar`/`NavTabs`/`AuthLoadingState`/`ComingSoonPage` are excluded from the override mechanism:
they take no content-varying props and render exactly once each, so there is no caller to prefix.

## Implementation summary (2026-09-29)

Built exactly per the revised scope above.

**New namespaces:** `shell` (`TopBar`/`NavTabs`/`AuthLoadingState`/`ComingSoonPage` — treated as
its own "feature" per `app/i18n.ts`'s one-namespace-per-page convention, rather than folded into
`common`, which stays reserved for fragments genuinely shared *between* feature namespaces like
`geoLocaleFields`) and `sharedDialogs` (default copy for the 6 dialogs, the override-fallback
target). Both registered in `app/i18n.ts`'s `resources`/`ns` and `.storybook/preview.ts`'s isolated
instance (the exact gap CLIENT-I18N-2 found for `profile` — not repeated here).

**Override mechanism:** new `src/shared/lib/useOverridableText.ts` — `useOverridableText(overridePrefix?)`
returns a `t`-like function; with no prefix it reads `sharedDialogs:<key>` directly, with a prefix
(i18next `"ns:key.path"` syntax) it tries `t([\`${prefix}.<key>\`, \`sharedDialogs:<key>\`])`, i18next's
own key-fallback array — no custom resolution logic. All 6 dialogs (`JoinFeedbackDialog`,
`ReactivateSportNudgeDialog`, `UnsavedPostConfirmDialog`, `AddSportIntroDialog`, `NoSportsToAddDialog`,
`UpdateBroadcastConfirmDialog`) gained an optional `i18nOverridePrefix?: string` prop — purely
additive, every existing call site (confirmed by a consumer census: 1–4 real callers each, all via
JSX props/spread) stays compatible as-is with zero changes needed.

**I18N-10 checklist run against all 6 dialogs:** none use native HTML5 constraint validation (no
form inputs in any of them), and none render a verbatim server error message — each renders its
own client-authored copy for its `isError`/`isCatalogUnavailable` boolean states. No new row needed
in `I18N_READINESS.md`'s I18N-4 census table.

**Real gap found and fixed:** `e2e/flows/profile-journey.spec.ts` step 6 already switches the live
UI locale to `vi` (testing CLIENT-REF-3's language-save-switches-UI-live behavior) and step 7
(Memories tab) runs afterward, still in `vi` — its old assertion (`getByText('Coming soon.')`) only
passed because `ComingSoonPage` was hardcoded English. Now translated, so the assertion needed
updating to the real Vietnamese text ("Sắp ra mắt."), same class of stale-locator gap CLIENT-I18N-2
already fixed once for `locale.spec.ts`. `client/docs/E2E_OVERVIEW.md`'s per-file table updated to
match.

**Two new test files** for dialogs that had none before (`AddSportIntroDialog.test.tsx`,
`UnsavedPostConfirmDialog.test.tsx`) — a pre-existing gap unrelated to i18n, added now since both
files were already being touched, mirroring their 4 siblings' shape.

**Tests:**
- tsc/eslint clean across every touched file.
- Scoped Vitest: 49/49 green across all 10 touched/new test files (`TopBar`, `NavTabs`, all 6
  dialogs, `useOverridableText`, `i18n.test.ts`'s extended key-parity check). One pre-existing test
  needed a real fix, not a false-positive skip: `TopBar.test.tsx`'s vi-locale test still clicked the
  English "Your account" locator after switching to `vi` — now clicks "Tài khoản của bạn".
- `e2e`: full functional project run (96/96 green), not a subset — `TopBar`/`NavTabs` render on
  nearly every authenticated page, so a narrow slice would have missed real coverage. One failure
  surfaced on the first run (the `profile-journey.spec.ts` stale locator above); fixed, then the
  full project re-ran clean.
- **Visual-regression expectation:** no real baseline change expected — every dialog/chrome
  component's **English** copy is unchanged verbatim (English is the only locale any
  visual-regression spec exercises; none of them switch to `vi`). Confirmed via stash-and-rerun on
  the two specs that render changed components (`app-sport-reactivate.spec.ts`,
  `app-profile.spec.ts`): 33 failures before my changes, 33 failures after, byte-identical failure
  set (diffed directly) — the pre-existing Windows font-rendering noise floor, zero incremental
  diff from this ticket.
- Storybook build-time check (`storybook build`) succeeds with the two new namespaces registered.
