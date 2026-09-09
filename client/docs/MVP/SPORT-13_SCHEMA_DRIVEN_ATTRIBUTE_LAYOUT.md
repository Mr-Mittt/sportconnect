# SPORT-13 · `layout` mechanism + scalar-type layouts (STRING / NUMBER / BOOLEAN / ENUM)

**Status:** `TODO`
**Type:** Client feature + architecture
**Depends on:** `CLIENT-SESSION-17` (`DONE` — the per-arm `attributeFields/` split this threads
through) and `SPORT-7` (`DONE`). No blocker.
**Filed:** 2026-09-09, `/ticket` session — picking up the presentation-hint scope `SPORT-7`
explicitly deferred. First of a three-ticket split (`SPORT-13` mechanism + scalar arms,
`SPORT-14` container elements, `SPORT-15` read-only parity + `#ref`).
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` (shared vocabulary + object shape for all
three tickets + backend `common` C11).

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
  `client/src/shared/types/sport.ts`, undefined-safe. Shape (full definition in the design doc):

  ```ts
  interface AttributeLayout {
    id: string;       // required — layout id for this element/type
    icon?: string;    // Tabler outline name (used by containers — SPORT-14)
    format?: string;  // per-type value-format token (this ticket: STRING + NUMBER)
    // extension point for later props
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
| `BOOLEAN` | `checkbox` · `switch` · `segmented` |
| `ENUM` | `dropdown` · `radio` · `segmented` |

Build all of these in `StringField` / `NumberField` / `BooleanField` / `EnumField` for the
**editable** control. `segmented` on an `ENUM` with too many options → fall back to `dropdown` +
warn.

### 3. `format` (STRING + NUMBER only)

A small documented token set applied to the **read display** and, where sensible, as an input
format:

- `NUMBER` — `0.0` (fixed decimals), `0%` (percent), `#,##0` (grouped), a trailing unit string.
- `STRING` — `uppercase`, `titlecase`, a simple mask.

Unknown token → render the raw value + warn. A shared `formatAttributeValue(value, type, token)`
helper (consumed by `SessionAttributesSummary` too in `SPORT-15`).

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
- Any layout-picker UI in ADMIN-2 / ADMIN-5; a full format DSL; localisation of layout ids.

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

🤖 Generated with [Claude Code](https://claude.com/claude-code)
