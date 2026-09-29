# CLIENT-I18N-4 · Translate per-feature pages (Home Feed, Groups, Friends, Profile, Sessions/Matches, Notifications, Admin)

**Status:** `TODO`
**Type:** Enhancement (broad, incremental — expected to split into one ticket per feature at pickup)
**Depends on:** CLIENT-I18N-2 (step 1), CLIENT-I18N-3 (step 2 — shared chrome translated first, so a
feature page isn't the only translated island the wrong way around: shell in English, content in
Vietnamese)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup — step 3 of that ticket's ordered list.

## What

Translate the remaining feature pages' own copy: Home Feed, Groups, Friends, Profile, Sessions/
Matches, Notifications, Admin. Each gets its own PR, its own i18n namespace (per `app/i18n.ts`'s
one-namespace-per-page convention), its own tests, and its own regenerated visual baselines — this
ticket is filed as the umbrella placeholder; **file each feature as its own backlog ticket when
picked up**, same "prefer splitting" note the parent ticket (`CLIENT-I18N-2`) itself carried.

**Entry point:** each feature's own route(s).
**Inputs/outputs:** no data-shape change — pure UI string extraction per feature.

## Notes for pickup

- Pick an order — likely highest-traffic first (Home Feed, Profile) — and file/pick up one feature
  at a time rather than attempting all seven in one pass.
- Same per-feature checklist as every prior i18n ticket: new namespace + `.storybook/preview.ts`
  registration + `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines
  (`update-baselines`, never from Windows) + audit any hardcoded date/number/currency (`VND`)
  formatting for `Intl` + the active locale while that feature is touched anyway.
- Admin pages: confirm whether admin-only surfaces are in scope for `vi` at all, or English-only is
  an accepted call (admins may be internal-only) — a real scope question, not obvious either way.

**Out of scope:** `TopBar`/`NavTabs`/shared chrome (CLIENT-I18N-3); client-mirrored backend enums
(CLIENT-I18N-5); backend message/enum localization (I18N-4); the language picker UI.
