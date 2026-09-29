# CLIENT-I18N-5 · Translate client-mirrored backend enums

**Status:** `TODO`
**Type:** Enhancement (broad, incremental)
**Depends on:** CLIENT-I18N-2 (step 1), ideally after CLIENT-I18N-4 (the pages these labels render
inside should already be translated, so a Vietnamese page doesn't get an English status pill)
**Filed:** 2026-09-29, split out of `CLIENT-I18N-2` at pickup — step 4 of that ticket's ordered
list. Closes `documentation/md/I18N_READINESS.md`'s **I18N-5** (`CANDIDATE`, sized into this ticket
at that doc's own 2026-09-25 update).

## What

Translate the display strings the client generates from ~15 hand-mirrored backend enum values —
session status labels, post/comment type labels, `getNotificationText`'s per-`NotificationType`
strings, and any other enum-driven copy found at pickup. Distinct from generic static UI copy
(buttons, nav labels): these are backend-enum-driven, not authored directly in a component's JSX,
so they need their own audit pass to find every call site rather than a simple grep for hardcoded
strings.

**Entry point:** wherever an enum-driven label renders — notification bell/list, post/comment type
badges, session status pills, etc.
**Inputs/outputs:** no data-shape change — the enum values themselves are untouched; only their
display-string mapping becomes locale-aware.

## Notes for pickup

- `NotificationType` is an exhaustive union, so the compiler already forces a case for every new
  member added to `getNotificationText` — this ticket adds the translated-string lookup inside each
  existing case, it doesn't change the exhaustiveness guard itself.
- Do a real audit at pickup (grep every `switch`/lookup keyed on an enum-shaped value under
  `src/features/`/`src/shared/`) rather than assuming the list is only the ones named above — this
  ticket's own filing note explicitly flags "distinct chunk of the surface, worth accounting for in
  scope/sizing... not discovered partway through" (I18N-5).
- Same per-namespace checklist as every prior i18n ticket: `.storybook/preview.ts` registration +
  `src/app/i18n.test.ts` key-parity coverage + regenerated visual baselines wherever an enum label
  is visible.

**Out of scope:** backend message/enum localization itself (I18N-4 — the *value* stays an English
enum constant on the wire; only the client's own display mapping is translated here); the language
picker UI.
