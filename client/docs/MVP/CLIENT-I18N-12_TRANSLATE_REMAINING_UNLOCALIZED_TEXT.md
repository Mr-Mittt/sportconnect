# CLIENT-I18N-12 · Translate remaining unlocalized text (shared/nested components missed by the per-page tickets)

**Status:** `DONE` (2026-09-30)
**Type:** Enhancement
**Depends on:** none (CLIENT-I18N-1..11 all merged)
**Filed:** 2026-09-30, from a hardcoded-English audit run right after CLIENT-I18N-11 merged. I18N-4..11 translated per page, so components shared across pages or nested inside features were missed, and the en/vi parity test can't catch it (it compares keys, not whether visible text goes through `t()`).

Localize every remaining client-authored English string. Audit findings (a text-pattern scan of the 146 non-test/non-story `.tsx` files, verify at pickup — not exhaustive): `LocationPicker` (search placeholder/aria-label, Search, Searching…, error/empty states, "Add a new location", "Back to search" — ~18 strings, no translation hook at all); `shared/components/attributeFields/*` (`DefinitionFields` "Required" ×3, `RefField` "Value"/"Cancel"/"Other…"/`Add — {label}` title, `AddDefinitionRecordModal`, `DefinitionField`, `refChoices`); `shared/ui/dialog.tsx` `DialogHeader` `aria-label="Close"` (used by dialogs that don't pass their own label); `EmojiPickerButton` "Add emoji" (aria-label + title); `ProfileHeader` "Edit profile"; `SessionAttributesSummary` `aria-label="Session detail"`; plus the un-inspected 1–3-hit files (`LocationMapPreview`, `AuthShell`, `CommentItem`, `SportAttributesFields`). Also scan `.ts` files (hooks, libs, mappers, error-message builders) — the audit only covered `.tsx`.

Each component follows the established pattern: `useOverridableText(ns, prefix?)` + an `i18nOverridePrefix` prop, keys in the owning feature's namespace (or `common` for shared chrome); plain functions read the i18next singleton. Add `en`/`vi` keys with parity, `vi` Storybook check, scoped e2e, and the visual-regression expectation (English *rendering* can still change when several text runs merge into one `t()` string — I18N-10 changed 11 baselines this way; state the expected set up front). Add an I18N-4 census row for any form found displaying a raw server error.

Recurrence guard: decide at pickup between an ESLint rule (e.g. `react/jsx-no-literals` scoped to non-admin `src/`) and a scripted test that fails on hardcoded JSX text / a11y attributes, so a new component can't reintroduce the gap; if it is noisy, file it as its own ticket rather than blocking this one.

**Out of scope:** admin pages (English-only, accepted in I18N-4/6); backend-authored text incl. raw server messages (I18N-4); server-resolved attribute-schema labels (A13); user-authored content; locale-neutral formats (VND amounts, the Discover picker's `dd/MM/yyyy` custom-date option); the `SportHub` brand name; the `VND` input placeholder; the language picker.

**Tests:** per-component vi-render tests (RTL) + override-prefix tests, `i18n.test.ts` parity for any new namespace, one `locale.spec.ts` e2e covering LocationPicker/attribute widgets in `vi`, and a scoped `visual-regression` expectation.

## Scope check at pickup (2026-09-30)

User confirmed nothing to add or remove; the scripted-test recurrence guard was approved in the plan.

## Implementation summary (2026-09-30)

**Approved design (restated):** add `locationPicker.*` + `attributeFields.*` to `sharedComponents`, plus `common.close`/`editProfile`/`addEmoji` and `session.attributes.detail` (en + vi); route each hardcoded string through `t()`; add a Vitest recurrence guard; RTL vi tests + one `locale.spec.ts` e2e.

**Built:**
- `LocationPicker` (~24 strings incl. interpolated favorite/unfavorite labels) now uses `useOverridableText('sharedComponents', i18nOverridePrefix)` with a new optional `i18nOverridePrefix` prop.
- `attributeFields/*` (`AddDefinitionRecordModal`, `DefinitionFields`, `DefinitionListField`, `EnumField`, `NumberField`, `ListField`, `RefField`, `BooleanField`): Required / Value / Cancel / Add / Other… / Select… / Actions / max-items / Remove item N / Clear / Increase / Decrease / Move up|down / selected-position / "nothing on your profile". The editor's Yes/No and the accordion "Item N" reuse the existing `enums:attributeValues.*` keys.
- `DialogHeader` close `aria-label` (`common:close`), `EmojiPickerButton` (`common:addEmoji`), `ProfileHeader` (`common:editProfile`), `SessionAttributesSummary` (`session:attributes.detail`).
- Recurrence guard: `src/locales/noHardcodedText.test.ts` scans non-admin/test/story `.tsx` for plain-English `aria-label`/`title`/`placeholder`/`alt` literals and bare JSX text lines; allow-list = `SportHub`, `VND`, the example maps URL. Verified it fails (12 hits) against the pre-change `LocationPicker`. Noise was low, so it did not need its own ticket.

**Divergences / findings:** the attribute widgets use plain `useTranslation('sharedComponents')` (no `i18nOverridePrefix`) — they are deep atomic pieces with no override caller, so the prop would be unused. The audit's `AuthShell`, `CommentItem`, `SportAttributesFields` needed no change (default-only tagline overridden by both callers; no user-facing literals); the `LocationMapPreview` OSM attribution is a legal credit and stays. The `.ts` sweep found no user-facing literals (only dev `devWarn` text and fixtures). The guard covers `.tsx` only; `.ts` remains a manual check. No form shows a raw server error here → no I18N-4 census row.

**Tests:** `SharedChromeI18n.test.tsx` (7 tests: LocationPicker search/create/favorite-interpolation/override, DialogHeader, ProfileHeader, DefinitionFields in vi), `noHardcodedText.test.ts`, existing `i18n.test.ts` parity (new files + parity 21/21); scoped Vitest over i18n, location, shared/components, shared/ui, chat, SessionAttributesSummary — 55 files / 524 green (run before the new tests were added). tsc and eslint clean. One new `locale.spec.ts` e2e (LocationPicker + dialog Close in `vi`).

**E2E:** `e2e` project, full run: 86 passed / 16 failed. 15 of the failures were parallel-load flakes (mostly login `waitForURL`) that passed on an isolated `--last-failed --workers=2` re-run (15/15). The 16th, `profile-journey.spec.ts` "Profile journey", was a **real regression from this ticket**: after the language save switches the UI to `vi`, `ProfileHeader`'s button is now "Chỉnh sửa hồ sơ", so the locator `{ name: 'Edit profile' }` no longer matched. Fixed the locator (line 169) to the Vietnamese name; both `profile-journey` tests now pass in isolation. The new LocationPicker `locale.spec.ts` test passed (8/8 in that file).

**Visual-regression expectation:** no baselined surface touched — every `en` string is byte-identical and no text runs were merged, so no baseline change is expected; a failing `visual-regression` run would be the Windows noise floor, not a regression. Not run.

**Storybook:** not opened for a `vi` check — no visual states were added or changed.
