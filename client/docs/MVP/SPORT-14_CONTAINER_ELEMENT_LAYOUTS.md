# SPORT-14 · Container-element layouts (group / DEFINITION / DEFINITION_LIST / LIST) + heading `icon`

**Status:** `TODO`
**Type:** Client feature
**Depends on:** `SPORT-13` (the `layout` object type + threading mechanism + per-arm story
scaffold). Generalises `SPORT-7`'s fixed group grid.
**Filed:** 2026-09-09, `/ticket` session — second of the three-ticket layout split.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`.

## Why

`SPORT-7` hardcoded one container layout: every group is a collapsible section with a 1→2-col
responsive grid, `DEFINITION`/`DEFINITION_LIST` full-width. `SPORT-13` adds the schema-driven
`layout` object and wires it through the scalar arms; this ticket makes the **container elements**
honour it too, so a schema author can arrange a group's children (and shape a record / record
list) per context.

## Scope

### 1. Container layouts

| Element | `layout.id` (first = current default) | Where |
|---|---|---|
| `group` | `section` (collapsible, current) · `grid-2` · `grid-3` · `inline` (label-left rows) · `flat` (no heading/box) | `SportAttributesFields` `GroupSection` |
| `DEFINITION` | `stacked` (current) · `inline` · `grid-2` | `DefinitionFields` / `DefinitionField` |
| `DEFINITION_LIST` | `cards` (current) · `table` · `accordion` | `DefinitionListField` |
| `LIST` (container / edit) | `chips` (current) · `checkboxes` · `multiselect` · `ordered` | `ListField` |

`GroupSection` currently hardcodes `grid grid-cols-1 gap-3.5 sm:grid-cols-2` (`SPORT-7`) — that
becomes the `grid-2` branch; `section` keeps the collapsible wrapper, the others replace the grid
wrapper. Nested composition: a child's `layout` composes under its parent's (an `inline`
`DEFINITION` inside a `grid-2` group cell renders inline within the cell).

### 2. Heading `icon`

`layout.icon` (Tabler outline name — client CLAUDE.md) on a container node renders its heading as
`{icon} {label}`. Applies to `group`, `DEFINITION`, `DEFINITION_LIST` section headings. Icon not
in the Tabler set → heading with no icon + dev warning. Decorative — `aria-hidden`, the text label
carries the meaning.

### 3. Storybook

- One story per `layout.id` for `GroupSection` (or a thin wrapper), `DefinitionFields`,
  `DefinitionListField`, `ListField` — extending the `attributeFields/` story set `SPORT-13`
  started. `icon` variant stories on the container headings.
- `SportAttributesFields.stories.tsx`: a mixed-layout nested-schema story (a `grid-3` group
  holding an `inline` DEFINITION and a `table` DEFINITION_LIST), and an `icon`-on-headings story.
- `addon-a11y` passes on every story; collapse/expand still keyboard-reachable in `section`.

## Out of scope

- Scalar-type layouts + `format` → `SPORT-13`.
- Read-only rendering (`SessionAttributesSummary`), `LIST` **display** layouts, `#ref` →
  `SPORT-15`.
- Backend schema field → `common` C11.

## Tests

- Vitest `SportAttributesFields`: each group `layout.id` produces the expected wrapper; `grid-2`
  matches the current SPORT-7 output exactly; `section` still collapses; nested composition; a
  bad `icon` degrades to no-icon + warning; `isAvailable:false` cascade unchanged across layouts.
- Vitest `DefinitionFields` / `DefinitionListField` / `ListField`: each layout renders; record
  value shape and `onChange` keys unchanged (`DEFINITION` record keys stay bare — A19 §3.1).
- Storybook a11y pass on all new stories.
- Visual-regression: new stories only; existing profile / create-session / session-detail
  baselines byte-identical (the default ids reproduce today's output). Any shift →
  `update-baselines` dispatch, called out in the summary.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
