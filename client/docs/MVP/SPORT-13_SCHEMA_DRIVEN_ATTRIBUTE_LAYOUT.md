# SPORT-13 · `layout` mechanism + scalar-type layouts (STRING / NUMBER / BOOLEAN / ENUM)

**Status:** `DONE` (2026-09-09) — implementation summary:
`client/docs/MVP/SPORT-13_SCHEMA_DRIVEN_ATTRIBUTE_LAYOUT_IMPL.md`
**Type:** Client feature + architecture
**Depends on:** `CLIENT-SESSION-17` (`DONE` — the per-arm `attributeFields/` split this threads
through) and `SPORT-7` (`DONE`). No blocker.
**Filed:** 2026-09-09, `/ticket` session — picking up the presentation-hint scope `SPORT-7`
explicitly deferred. First of a three-ticket split (`SPORT-13` mechanism + scalar arms,
`SPORT-14` container elements, `SPORT-15` read-only parity + `#ref`).
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` (shared vocabulary + object shape for all
three tickets + backend `common` C11).

## Scope refinement 2026-09-09 (Phase 1 pickup, user decision)

Three calls locked at pickup:

1. **`layout.icon` is added to the shared `AttributeLayout` type now**, even though SPORT-13
   renders nothing from it (SPORT-14 does). Keeps the type stable across the three-ticket split.
2. **`format` is a pattern string, and localizable exactly like `label`** — not the small fixed
   token set this ticket first described. In the **raw** schema types it is a locale map
   (`Record<string, string>`, mirroring `label`); in the **resolved** twins it is the single
   already-resolved string. A small pattern grammar (number: `0`, `0.0`, `0.00`, `#,##0`,
   `#,##0.0`, `0%`, optional literal prefix/suffix incl. a unit; string: `uppercase`,
   `lowercase`, `titlecase`) rendered through `Intl.NumberFormat`/locale rules for separators.
   Supersedes the old **Out of scope** "full format DSL" bullet — this is a deliberately small
   grammar, still not an open-ended DSL.
3. **`format` is display-only in SPORT-13's editable arms** — applied where an arm shows the value
   as text (`readonly-text`, `NumberField`'s helper/preview), never as format-on-blur on a live
   input. Full read-side application is SPORT-15.

## Scope addition 2026-09-09 (post-implementation, user decision) — ENUM is clearable

An `ENUM` selection can be **removed**, not only changed, in every layout:

- **`dropdown`** — a small `×` clear button overlays the right of the `<select>` whenever a value
  is set; clicking it sets the value to `''`. The disabled "Select…" placeholder is unchanged.
- **`radio` / `segmented`** — clicking the already-selected option **deselects** it (native radios
  can't do this alone, so `RadioGroup` / `SegmentedControl` gain an opt-in `allowDeselect`).

Applies regardless of `isRequired` (the existing "Required" hint already surfaces the empty
state). `dropdown` is the default `ENUM` layout, so this adds the `×` to the pre-existing profile
Settings-tab / session-modal ENUM controls too — a visual change only in the *value-selected*
state; the empty state is byte-identical.

## Why

Attribute rendering is fixed — an `ENUM` is always a `<select>`, a boolean always a checkbox, a
`NUMBER` always a plain input, and a schema author has no way to ask for anything else. Real
schemas (Badminton profile + session schemas) increasingly need the same value shown differently
per context (a short `ENUM` as a segmented control, a boolean as a switch, a number formatted as a
percentage). This ticket establishes the **mechanism** for a schema-driven `layout` and delivers
it for the four **scalar** arms.

## Scope

### 1. The `layout` object + threading mechanism

- `layout?: AttributeLayout | null` on the resolved (and raw) schema node types in
  `client/src/shared/types/sport.ts`, undefined-safe. `format` is localizable like `label`, so the
  raw and resolved shapes differ (same split `label` already has):

  ```ts
  // resolved twins (what SportAttributesFields consumes) — format already locale-resolved
  interface AttributeLayout {
    id: string;                       // required — layout id for this element/type
    icon?: string | null;             // Tabler outline name (unused in SPORT-13; SPORT-14)
    format?: string | null;           // resolved pattern string (STRING/NUMBER)
    // extension point for later props
  }
  // raw schema types — format is a locale map, mirroring `label`
  interface AttributeLayoutRaw {
    id: string;
    icon?: string | null;
    format?: Record<string, string> | null;
  }
  ```

- Extend `AttributeControlBaseProps` (`attributeFields/types.ts`) so each arm receives its node's
  `layout`. Each arm switches on `layout?.id`; **default branch = current rendering**.
- Absent `layout`, unrecognised / inapplicable `id`, or a malformed object (`id` missing, not an
  object) → current default + a dev-only `console.warn`. Never throws. Mirrors
  `CLIENT-SESSION-17`'s `assertNever` + runtime unknown-type guard pattern.
- Unknown object properties ignored (forward-compatible).

### 2. Scalar-type layouts

| Type | `layout.id` (first = current default) |
|---|---|
| `STRING` | `input` · `textarea` · `readonly-text` |
| `NUMBER` | `input` · `stepper` · `slider` (falls back to `input` if `min`/`max` absent) |
| `BOOLEAN` | `switch` (current — `<Switch>`) · `checkbox` · `segmented` |
| `ENUM` | `dropdown` · `radio` · `segmented` |

Build all of these in `StringField` / `NumberField` / `BooleanField` / `EnumField` for the
**editable** control. `segmented` on an `ENUM` with too many options → fall back to `dropdown` +
warn.

### 3. `format` (STRING + NUMBER only) — display-only

`layout.format` is a **pattern string** (resolved from a locale map — see scope refinement),
applied only where an arm renders the value **as text** (`readonly-text`, `NumberField`'s
helper/preview line). Editable inputs stay raw — no format-on-blur (that's SPORT-15's read side).

Small grammar:

- `NUMBER` — `0` / `0.0` / `0.00` (fixed decimals), `#,##0` / `#,##0.0` (grouped),
  `0%` (percent), an optional literal prefix and/or suffix around the number token
  (`"$"` + `#,##0.00`, `0.0` + `" lbs"`). Rendered via `Intl.NumberFormat` with the resolved
  UI locale so separators follow locale.
- `STRING` — `uppercase` / `lowercase` / `titlecase`.

Malformed / unrecognised pattern → render the raw value + dev `console.warn`. Shared
`formatAttributeValue(value, type, pattern, locale?)` helper (SPORT-15 reuses it on the full read
side).

### 4. Storybook

- **Net-new** `.stories.tsx` for `StringField`, `NumberField`, `BooleanField`, `EnumField` under
  `attributeFields/` (none exist today — the arms are only exercised via the composite
  `SportAttributesFields.stories.tsx`). One story per `layout.id`, plus `format` variant stories
  for STRING/NUMBER. `addon-a11y` must pass on every story.
- Add a scalar-`layout` schema case to `SportAttributesFields.stories.tsx`.

## Out of scope

- Container-element layouts (`group` / `DEFINITION` / `DEFINITION_LIST` / `LIST`) and `icon` on
  headings → `SPORT-14`.
- Read-only rendering in `SessionAttributesSummary`, `LIST` display layouts, `#ref` composition →
  `SPORT-15`.
- The backend schema-DTO field → `common` C11.
- Any layout-picker UI in ADMIN-2 / ADMIN-5; an open-ended format DSL (the grammar in §3 is
  deliberately closed); localisation of layout **ids** (only `format` is localizable).
- Reading `layout.icon` — the field is added to the type but SPORT-14 renders it.
- Applying `format` on the read-only side (`SessionAttributesSummary`) — SPORT-15.

## Tests

- Vitest per arm: each `layout.id` renders the expected control markup; absent = default; invalid
  id / malformed object = default + warning; `onChange` value/shape unchanged across every layout;
  `slider` with no bounds → `input`.
- Vitest `formatAttributeValue`: each token; unknown token = raw + warning.
- Storybook a11y pass on all new stories.
- Visual-regression: new stories only; existing profile / create-session / session-detail
  baselines return byte-identical. Any shift → `update-baselines` dispatch, called out in the
  summary.

---

## Delta for SPORT-14 / SPORT-15

- **Shared pieces to reuse, not rebuild:** `shared/lib/devWarn.ts` (deduped dev warn +
  `resetDevWarnCache`), `shared/lib/formatAttributeValue.ts`, and
  `shared/components/attributeFields/layout.ts` (`normalizeLayout`, `pickLayoutId`). SPORT-15's
  read-only side calls `formatAttributeValue` directly.
- **`AttributeLayout` / `ResolvedAttributeLayout`** already carry `icon` and sit on the group and
  record-field types too — SPORT-14 renders `icon` on container headings and reads
  `ResolvedSportAttributeGroup.layout`; nothing new needed on the type side.
- **New primitives** `shared/ui/{radio-group,segmented-control,slider}.tsx` are native + token
  styled (no Radix). Reuse them for SPORT-14's `LIST` `checkboxes`/`multiselect` and SPORT-15's
  `#ref` `SINGLE`→ENUM-set / `LIST`→LIST-set composition. `RadioGroup`/`SegmentedControl` take an
  opt-in `allowDeselect` (click-selected-to-clear) — SPORT-15's `#ref` `SINGLE` control should
  pass it too. `EnumField`'s `dropdown` clear is an inline `×` overlay pattern to copy.
- **Divergence carried in:** `NumberField` gained a `readonly-text` id (ticket first listed it
  only for STRING) — SPORT-15 should treat `readonly-text` as available on both scalar types.
- Degrade thresholds live in the arms: `EnumField` `segmented` → `dropdown` past 5 options
  (`SEGMENTED_MAX_OPTIONS`); `NumberField` `slider` → `input` without both bounds.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
