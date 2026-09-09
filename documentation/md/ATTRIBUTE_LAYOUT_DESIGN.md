# Attribute `layout` — schema-driven presentation for attribute components

**Status:** design stub, 2026-09-09. Shared reference for client `SPORT-13` / `SPORT-14` /
`SPORT-15` and backend `common` `C11`. Nothing built yet — this doc holds the agreed object shape
and the layout vocabulary so the three client tickets don't each re-derive it.

## Context

`SPORT-7` (`DONE`) added a *fixed* group layout — collapsible section + 1→2-col responsive grid,
`DEFINITION`/`DEFINITION_LIST` full-width — and explicitly deferred *"any schema-driven
presentation hint (`widget`/`display`), per-field widget changes."* `CLIENT-SESSION-17` (`DONE`)
then split attribute rendering into one component per type under
`client/src/shared/components/attributeFields/` (`StringField` … `DefinitionListField`, `RefField`)
behind a common `AttributeControlBaseProps`. That per-arm split is what makes a per-type
presentation axis tractable, so the deferred `SPORT-7` scope is now picked up here.

The goal: for **every container element** (`group`, `LIST`, `DEFINITION`, `DEFINITION_LIST`) and
**every attribute type** (`STRING`, `NUMBER`, `BOOLEAN`, `ENUM`, `LIST`, `DEFINITION`,
`DEFINITION_LIST`, `#ref`), a named set of supported layouts, chosen from the attribute schema,
honoured by **both** the editable renderer (`SportAttributesFields` + the arms) **and** the
read-only view (`SessionAttributesSummary`), each covered by a Storybook story so every variant is
visible and a11y-checked.

## The `layout` object

`layout` is an **object**, not a bare string, so properties can be added later without another
type migration:

```ts
interface AttributeLayout {
  /** Required. One of the layout ids for this element/type (vocabulary below). */
  id: string;
  /** Optional. Tabler icon name (outline set — client CLAUDE.md). Container elements render their
   *  heading as `{icon} {label}`; scalar arms may show it as an adornment. */
  icon?: string;
  /** Optional. Value-format token, interpreted per type — NUMBER: `"0.0"`, `"0%"`, `"#,##0"`, a
   *  unit suffix; STRING: `"uppercase"`, `"titlecase"`, a mask. Applied to the read display and,
   *  where sensible, as an input format. Small documented token set for v1 — not a full DSL. */
  format?: string;
  // extension point — future props (density, columns override, help placement, …) land here
}
```

- Absent `layout`, or `layout` with an unrecognised / inapplicable `id`, or a malformed object
  (`id` missing, not an object) → **current default rendering**, plus a dev-only `console.warn`.
  Never throws.
- Unknown object properties are ignored (forward-compatible with a client that adds props before
  the backend does).
- The default `id` for each element is the **first** entry in its row below — with `layout`
  absent, output must be byte-identical to today (so existing visual-regression baselines don't
  move).

## Layout vocabulary (v1)

| Element | `layout.id` values (first = current default) | Ticket |
|---|---|---|
| `STRING` | `input` · `textarea` · `readonly-text` | SPORT-13 |
| `NUMBER` | `input` · `stepper` · `slider` (needs `min`/`max`) | SPORT-13 |
| `BOOLEAN` | `checkbox` · `switch` · `segmented` | SPORT-13 |
| `ENUM` | `dropdown` · `radio` · `segmented` | SPORT-13 |
| `format` on `STRING` / `NUMBER` | token set (uppercase / titlecase / mask; `0.0` / `0%` / `#,##0` / unit) | SPORT-13 |
| `group` | `section` · `grid-2` · `grid-3` · `inline` (label-left rows) · `flat` (no heading/box) | SPORT-14 |
| `DEFINITION` | `stacked` · `inline` · `grid-2` | SPORT-14 |
| `DEFINITION_LIST` | `cards` · `table` · `accordion` | SPORT-14 |
| `LIST` (container / edit) | `chips` · `checkboxes` · `multiselect` · `ordered` | SPORT-14 |
| `icon` on container headings | Tabler outline name → `{icon} {label}` | SPORT-14 |
| `LIST` (value display / read) | `chips` · `comma` · `bullets` | SPORT-15 |
| read-only parity (`SessionAttributesSummary` honours `id` + `format` + `icon`) | — | SPORT-15 |
| `#ref` | composes with `CLIENT-SESSION-17` cardinality: `SINGLE` → `ENUM` set, `LIST` → `LIST` container set | SPORT-15 |

Exact per-element ids and the `format` grammar are finalised at each ticket's pickup against the
real design tokens — the table is intended coverage, not a frozen API. The `#ref` **data source**
and "Other…" typeahead are unchanged and out of scope here (owned by `SPORT-6` /
`CLIENT-SESSION-18`); SPORT-15 only decides how a `#ref` value's control/display *looks*.

## Ticket split

| Ticket | Module | Scope |
|---|---|---|
| `SPORT-13` | client | The `layout` object type + threading mechanism (`AttributeControlBaseProps` extension, `layout?.id` switch, malformed/unknown → default + warn), per-arm `.stories.tsx` scaffold, and the **scalar-type** layouts (`STRING` / `NUMBER` / `BOOLEAN` / `ENUM`) + `format`. Proves the pattern end-to-end on the simple arms. |
| `SPORT-14` | client | **Container-element** layouts — `group` (+ `icon` on headings), `DEFINITION`, `DEFINITION_LIST`, `LIST` container. Generalises `SPORT-7`'s hardcoded grid. Depends on `SPORT-13`. |
| `SPORT-15` | client | **Read-only parity** — `SessionAttributesSummary` honours `layout` / `format` / `icon`; `#ref` layout composition. Depends on `SPORT-13` + `SPORT-14`. |
| `C11` | common | Optional `layout` object as an opaque passthrough on the `common.attributes` node model + `Resolved*` twins — JSON round-trip, validators (lenient, non-gating), resolver, derived-schema expander; sport + session seeds. No server-side interpretation. |

Until `C11` lands, `layout` is client types + MSW seeds only; a real schema never sets it and the
renderer no-ops to the default. Reconcile the field name (`layout` vs `display` vs `widget`) and
the property names between `SPORT-13` and `C11` at whichever picks up first.

## Cross-cutting

- **Client-visible enum (reverse direction).** The `layout` vocabulary + object shape originate
  client-side; `C11` is the backend mirror so real schemas can carry it. Filed together.
- **No auth / account-lifecycle surface.** Pure client rendering — no endpoint, job, or
  cross-domain call; nothing a deactivated caller can reach that they couldn't before.
- **No notification use case.**

## Testing (applies to each client ticket, for its own elements)

- Vitest per arm: each `layout.id` renders the expected markup; absent = default; invalid id /
  malformed object = default + warning; `icon` / `format` render as specified; `onChange`
  unchanged across layouts.
- Storybook: one story per `layout.id` per element (+ `icon` / `format` variants); a11y addon
  passes all. Per-arm story files are net-new — today the arms are only exercised via the
  composite `SportAttributesFields.stories.tsx`.
- Visual-regression: **new stories only**; existing profile / session-detail / create-session
  baselines must return byte-identical (no default-path change). Any shift needs an
  `update-baselines` dispatch — call it out in the ticket summary.
