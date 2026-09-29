# CLIENT-I18N-8 · Translate Friends page

**Status:** `DONE` (2026-09-29)
**Type:** Enhancement
**Depends on:** CLIENT-I18N-2, CLIENT-I18N-3, CLIENT-I18N-4 (Home Feed), CLIENT-I18N-5 (enums)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-6` at pickup (narrowed to Profile only — user decision).

## What

Translate the Friends feature (`features/friends/`, 7 components). Same per-feature checklist as every prior i18n ticket: new namespace + `i18n.ts`
and `.storybook/preview.ts` registration + `src/app/i18n.test.ts` key-parity coverage + `useOverridableText`
`i18nOverridePrefix` on components + regenerated visual baselines (`update-baselines`, never from Windows)
+ `Intl` + active-locale for any hardcoded date/number/currency. Check `sharedComponents` before adding a
duplicate key. Read `documentation/md/I18N_READINESS.md` I18N-10 before starting: check each form for native
constraint validation and for a verbatim server message (add a row to I18N-4's census if so).
`FriendshipStatus` already done in I18N-5 (`FriendProfilePanel`) — don't redo.

**Out of scope:** shared chrome (CLIENT-I18N-3), mirrored backend enums (CLIENT-I18N-5), backend message
localization (I18N-4), the language picker, Admin pages (no localization needed — user decision 2026-09-29).

## Scope check at pickup (2026-09-29)

User confirmed nothing to add or remove.

## Implementation summary (2026-09-29)

**Approved design (restated):** new `friends` namespace (`locales/{en,vi}/friends.json`, sections `page`, `rail`,
`profile`, `chat`, `unfriendDialog`, `unavailableDialog`) registered in `app/i18n.ts`, `.storybook/preview.ts` and the
`app/i18n.test.ts` parity table. `FriendRail`, `FriendProfilePanel`, `FriendChatPanel`/`FriendChatPanelView`,
`UnfriendConfirmDialog` and `FriendRequestUnavailableDialog` use `useOverridableText('friends', i18nOverridePrefix)` and
gain an optional `i18nOverridePrefix` prop (forwarded down: `FriendChatPanel` → view, `FriendProfilePanel` → unfriend
dialog). `FriendsPage` uses plain `useTranslation('friends')` (sr-only `h1` + the "Select a friend…" empty state).
English values are byte-identical to the literals they replace.

**Built:** exactly the above. `FriendSection` (a helper inside `FriendRail.tsx`) receives the resolved `t` as a prop so the
override prefix reaches its empty-state text; the section labels are resolved by `FriendRail` itself.

**Divergences:** none from the approved design. `FriendProfilePanel`'s stale doc comment ("`CLIENT-I18N-6`'s job") was
rewritten. The per-`FriendshipStatus` action text stays in `enums:friendship.*` (CLIENT-I18N-5) via the singleton, and the
chat typing line stays in `common:typing.*` (I18N-7) — neither was touched. Hooks under `features/friends/` hold no UI
strings. No hardcoded date/number/currency formatting exists in these files.

**I18N-10 form checks:** no native constraint validation anywhere (the rail search and chat textareas are not in a `<form>`
and carry no `required`/`type=email`). No component renders a verbatim server message — every error is client-authored
copy — so **no new I18N-4 census row** is needed.

**Tests:** new `features/friends/FriendsI18n.test.tsx` (8 tests: Vietnamese render for the rail incl. query interpolation,
profile panel, chat view incl. the load error, both dialogs; override-prefix test on the rail); `friends` added to the
`i18n.test.ts` parity table; one new e2e (`locale.spec.ts`, Friends page in `vi`).

**Verification:** `tsc -b` clean; scoped Vitest (`src/features/friends` + `i18n.test.ts`) 11 files / 115 tests passed.
**E2E:** `e2e` project — `locale` + `friends-journey` 5 passed, plus every other spec that touches the Friends surface
(`a11y`, `direct-chat`, `notification-bell`, `smoke`) 38 passed; the full `pnpm e2e` suite was not run (scoped subset only,
by standing instruction). `pnpm lint` reports only errors inside the untracked `client/.vite/` cache (pre-existing, not
this change); no lint findings in touched files.
**Visual-regression expectation:** no baselined surface touched — English output is byte-identical, so no baseline change
is expected; a failing `visual-regression` run on this host is the Windows noise floor, not a regression. Not run.

**IT changes:** none — client-only ticket, no backend, no integration-test surface.
