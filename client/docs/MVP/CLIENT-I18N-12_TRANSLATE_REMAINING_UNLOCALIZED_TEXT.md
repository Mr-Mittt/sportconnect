# CLIENT-I18N-12 · Translate remaining unlocalized text (shared/nested components missed by the per-page tickets)

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** none (CLIENT-I18N-1..11 all merged)
**Filed:** 2026-09-30, from a hardcoded-English audit run right after CLIENT-I18N-11 merged. I18N-4..11 translated per page, so components shared across pages or nested inside features were missed, and the en/vi parity test can't catch it (it compares keys, not whether visible text goes through `t()`).

Localize every remaining client-authored English string. Audit findings (a text-pattern scan of the 146 non-test/non-story `.tsx` files, verify at pickup — not exhaustive): `LocationPicker` (search placeholder/aria-label, Search, Searching…, error/empty states, "Add a new location", "Back to search" — ~18 strings, no translation hook at all); `shared/components/attributeFields/*` (`DefinitionFields` "Required" ×3, `RefField` "Value"/"Cancel"/"Other…"/`Add — {label}` title, `AddDefinitionRecordModal`, `DefinitionField`, `refChoices`); `shared/ui/dialog.tsx` `DialogHeader` `aria-label="Close"` (used by dialogs that don't pass their own label); `EmojiPickerButton` "Add emoji" (aria-label + title); `ProfileHeader` "Edit profile"; `SessionAttributesSummary` `aria-label="Session detail"`; plus the un-inspected 1–3-hit files (`LocationMapPreview`, `AuthShell`, `CommentItem`, `SportAttributesFields`). Also scan `.ts` files (hooks, libs, mappers, error-message builders) — the audit only covered `.tsx`.

Each component follows the established pattern: `useOverridableText(ns, prefix?)` + an `i18nOverridePrefix` prop, keys in the owning feature's namespace (or `common` for shared chrome); plain functions read the i18next singleton. Add `en`/`vi` keys with parity, `vi` Storybook check, scoped e2e, and the visual-regression expectation (English *rendering* can still change when several text runs merge into one `t()` string — I18N-10 changed 11 baselines this way; state the expected set up front). Add an I18N-4 census row for any form found displaying a raw server error.

Recurrence guard: decide at pickup between an ESLint rule (e.g. `react/jsx-no-literals` scoped to non-admin `src/`) and a scripted test that fails on hardcoded JSX text / a11y attributes, so a new component can't reintroduce the gap; if it is noisy, file it as its own ticket rather than blocking this one.

**Out of scope:** admin pages (English-only, accepted in I18N-4/6); backend-authored text incl. raw server messages (I18N-4); server-resolved attribute-schema labels (A13); user-authored content; locale-neutral formats (VND amounts, the Discover picker's `dd/MM/yyyy` custom-date option); the `SportHub` brand name; the `VND` input placeholder; the language picker.

**Tests:** per-component vi-render tests (RTL) + override-prefix tests, `i18n.test.ts` parity for any new namespace, one `locale.spec.ts` e2e covering LocationPicker/attribute widgets in `vi`, and a scoped `visual-regression` expectation.
