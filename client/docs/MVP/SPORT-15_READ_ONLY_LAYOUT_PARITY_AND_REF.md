# SPORT-15 · Read-only `layout` parity in SessionAttributesSummary + `#ref` composition

**Status:** `TODO`
**Type:** Client feature
**Depends on:** `SPORT-13` (mechanism + `format` helper + scalar layouts) and `SPORT-14`
(container layouts). Soft overlap with `SPORT-6` / `CLIENT-SESSION-18` (the `#ref` data source —
not touched here).
**Filed:** 2026-09-09, `/ticket` session — third of the three-ticket layout split.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`.

## Why

`SPORT-13` / `SPORT-14` make the **editable** renderer (`SportAttributesFields` + the
`attributeFields/` arms) honour the `layout` object. The **read-only** view —
`SessionAttributesSummary` in `SessionDetailModal` (`CLIENT-SESSION-16`) — still renders every
value with fixed markup (term/value `<dl>`, chips for `LIST`, nested blocks for
`DEFINITION(_LIST)`). This ticket brings it to parity so a session's stored attributes display the
way the schema asked, and settles how a `#ref` node's control/display picks a layout.

## Scope

### 1. Read-only parity in `SessionAttributesSummary`

- Honour `layout.id` for the read presentation of every element: scalar values respect their
  read variant (`readonly-text`, etc.); a `DEFINITION_LIST` with `layout.id: table` renders a
  table, `accordion` an accordion; a `group` with `grid-2` / `inline` / `flat` arranges its
  term/value pairs to match.
- Honour `layout.format` on displayed values via the shared `formatAttributeValue` helper from
  `SPORT-13` (percent, decimals, unit, uppercase, …).
- Honour `layout.icon` on section headings (`{icon} {label}`), same rules as `SPORT-14`.
- `LIST` **value display** layouts (read-only): `chips` (current) · `comma` · `bullets`.
- Absent `layout` → current `SessionAttributesSummary` output, byte-identical. Malformed / unknown
  → default + dev warning. Still renders nothing when the session has no `attributes`, the sport
  has no session schema, or every field filters out (`CLIENT-SESSION-16` behaviour unchanged).

### 2. `#ref` layout composition

A `#ref` node carries an inherited base `type` plus a `SINGLE` / `LIST` `cardinality`
(`CLIENT-SESSION-17`). Its `layout.id` vocabulary **composes** with cardinality rather than being
its own list:

- `cardinality: SINGLE` → the `ENUM` layout set (`dropdown` · `radio` · `segmented`) for the
  control; scalar read display for the value.
- `cardinality: LIST` → the `LIST` container set (`chips` · `checkboxes` · `multiselect` ·
  `ordered`) for the control; the `LIST` display set for read.

`RefField` (edit) and the `#ref` branch of `SessionAttributesSummary` (read) both apply this.
The `#ref` **data source** (choices from the creator's profile at `prefillKey`) and the "Other…"
add-modal are **unchanged** — owned by `CLIENT-SESSION-17` / `SPORT-6` / `CLIENT-SESSION-18`.

### 3. Storybook

- `SessionAttributesSummary.stories.tsx` (exists — `CLIENT-SESSION-16`): add one story per read
  `layout.id` per element, `format` variants, `icon`-on-headings, and a `#ref` `SINGLE` / `LIST`
  story per composed layout. `addon-a11y` passes on all.

## Out of scope

- Editable-side layouts (`SPORT-13` / `SPORT-14`).
- The `#ref` data source / "Other…" typeahead (`SPORT-6`, `CLIENT-SESSION-18`).
- Backend schema field → `common` C11.

## Tests

- Vitest `SessionAttributesSummary`: each read `layout.id` per element renders the expected
  markup; `format` applied; `icon` on headings; absent `layout` = current output; malformed =
  default + warning; the three "renders nothing" conditions still hold.
- Vitest `RefField` + `SessionAttributesSummary` `#ref` branch: `SINGLE` picks from the `ENUM`
  set, `LIST` from the `LIST` set; an `id` outside the composed set → default + warning; value
  shape unchanged.
- Storybook a11y pass on all new stories.
- Visual-regression: new stories only; the existing `session-detail-*` +
  `create-session-session-detail-ref-*` baselines (`CLIENT-SESSION-16` / `CLIENT-SESSION-17`)
  return byte-identical. Any shift → `update-baselines` dispatch, called out in the summary.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
