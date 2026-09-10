# SPORT-15 · Read-only `layout` parity in SessionAttributesSummary + `#ref` composition

**Status:** `DONE` (2026-09-10)
**Type:** Client feature
**Depends on:** `SPORT-13` (mechanism + `format` helper + scalar layouts) and `SPORT-14`
(container layouts). Soft overlap with `SPORT-6` / `CLIENT-SESSION-18` (the `#ref` data source —
not touched here).
**Filed:** 2026-09-09, `/ticket` session — third of the three-ticket layout split.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`.

**Scope change (2026-09-10, `/workon` pickup — user decision):**
1. **Full read-only container parity confirmed** — the read-only `<dl>` reshapes for *every*
   container `layout.id` (`group` `grid-2`/`grid-3`/`inline`/`flat`; `DEFINITION`
   `stacked`/`inline`/`grid-2`; `DEFINITION_LIST` `cards`/`table`/`accordion`), not just
   value-presentation. Read-only `DEFINITION_LIST` `accordion` is **collapsible** (reuses the
   `Collapsible` primitive), so `accordion` stays meaningfully distinct from `cards`.
2. **`#ref` composition on both sides** — `RefField` (edit) composes `SINGLE` → the `ENUM` layout
   set / `LIST` → the `LIST` container set; the `#ref` branch of `SessionAttributesSummary` (read)
   composes the display. (Original ticket already implied both; making it explicit.)
3. **New: `hidden` attribute flag** (backend half → `common` C11, scope-expanded the same day).
   A `hidden` attribute / record field / group renders **no editor input and no read-only row**,
   but its stored value is untouched and round-trips normally — it is a *rendering-suppression*
   flag, not a soft delete (`isAvailable: false` covers removal). Use case: a `Reference`
   definition keeps a code-populated `url` field while only `name` is user-facing. `hidden` and
   `required` are **mutually exclusive** (C11 validator rejects both; client-side `hidden` wins).
   SPORT-15 makes **both** renderers skip a `hidden` node — the editable `SportAttributesFields` +
   `DefinitionFields`/`RecordField` (SPORT-13/14 code) *and* the read-only `SessionAttributesSummary`
   / `attributeValues` `renderRecord` — next to their existing `isAvailable` checks, plus the
   `hidden?` field on the raw + resolved commons in `shared/types/sport.ts`.

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

### 3. `hidden` attribute flag

- `shared/types/sport.ts`: optional `hidden?: boolean | null` on the raw commons
  (`SportAttributeField`, `SportAttributeDefinition`, `SportAttributeGroup`, session equivalents)
  and the resolved commons (`ResolvedAttributeCommon`, `ResolvedFieldCommon`,
  `ResolvedSportAttributeGroup`). Mirrors `common` C11.
- **Editable renderer** (`SportAttributesFields` + `DefinitionFields`/`RecordField`): a `hidden`
  node is filtered out exactly where an `isAvailable: false` one already is — no input, no grid
  cell, no `defaultValue` seeding. A `hidden` group hides its whole subtree.
- **Read-only renderer** (`SessionAttributesSummary` `renderGroup` + `attributeValues`
  `renderRecord`): a `hidden` node contributes no row; a `hidden` group contributes no section.
- Client treats `hidden` as winning over `required` (the C11 validator should already prevent
  both, but the renderer must not crash on a bad schema).
- The stored value under a `hidden` key is **not** stripped from `values` / the create payload —
  round-trips untouched.

### 4. Storybook

- `SessionAttributesSummary.stories.tsx` (exists — `CLIENT-SESSION-16`): add one story per read
  `layout.id` per element, `format` variants, `icon`-on-headings, a `#ref` `SINGLE` / `LIST`
  story per composed layout, and a `hidden`-field story (value present, no row). `addon-a11y`
  passes on all.

## Out of scope

- Editable-side **layouts** (`SPORT-13` / `SPORT-14`) — but editable-side **`hidden` filtering** is
  in scope here (scope change above).
- The `#ref` data source / "Other…" typeahead (`SPORT-6`, `CLIENT-SESSION-18`).
- Backend schema field → `common` C11 (now also carries `hidden` + the `hidden`+`required` validator).

## Tests

- Vitest `SessionAttributesSummary`: each read `layout.id` per element renders the expected
  markup; `format` applied; `icon` on headings; absent `layout` = current output; malformed =
  default + warning; the three "renders nothing" conditions still hold.
- Vitest `RefField` + `SessionAttributesSummary` `#ref` branch: `SINGLE` picks from the `ENUM`
  set, `LIST` from the `LIST` set; an `id` outside the composed set → default + warning; value
  shape unchanged.
- Vitest `hidden`: a `hidden` attribute / record field / group renders no input in
  `SportAttributesFields` and no row in `SessionAttributesSummary`; its value still round-trips
  through `onChange` / the summary's `values`; a `hidden` + `required` node still renders nothing
  (no crash).
- Storybook a11y pass on all new stories.
- Visual-regression: new stories only; the existing `session-detail-*` +
  `create-session-session-detail-ref-*` baselines (`CLIENT-SESSION-16` / `CLIENT-SESSION-17`)
  return byte-identical (no MSW seed sets `layout` or `hidden`). Any shift → `update-baselines`
  dispatch, called out in the summary.

## Delta (2026-09-10, at pickup — corrections found during implementation)

- **`inline` ≡ `stacked` / `section` in the read-only view.** The read `<dl>` is already label-left,
  so there is no distinct `inline` rendering to build — `pickLayoutId` accepts `inline` without a
  warning and it renders the label-left list. Only `grid-2` / `grid-3` (groups) and `grid-2`
  (`DEFINITION`) actually reshape.
- **Read-only scalar `layout.id` is a no-op** — only `layout.format` changes a scalar's read
  output. An editable-only scalar id (`textarea`/`stepper`/`radio`/…) on a read node renders text
  with no warning, rather than warning on every such id.
- **`LIST` read display vs. edit vocabulary** — the read set is `chips` / `comma` / `bullets`; a
  SPORT-14 editable `LIST` id (`checkboxes` / `multiselect` / `ordered`) silently resolves to
  `chips` on the read side (valid id, not a display choice), only a truly unknown id warns.
- **`RefField` had no unit test before this ticket** — added a full `RefField.test.tsx` (12 cases)
  rather than extending an existing file.
- **Follow-up `SPORT-16` filed (2026-09-10)** — `common` C11's scope was narrowed the same day to
  "validate on schema update, carry `layout`/`hidden`/`fieldLayouts` raw". That pushes three
  resolution steps onto the client: `layout.format` locale-map resolution (this ticket's code
  assumes the SPORT-13 server-resolved `string`; C11 reverts it to a raw map), `#ref` `fieldLayouts`
  per-field override merge, and `#ref`→base `layout` inheritance. All in `SPORT-16`
  (`client/docs/MVP/SPORT-16_CLIENT_SIDE_LAYOUT_RESOLUTION.md`), hard-blocked on C11.
- **Verified:** `pnpm test` 177/1276; `pnpm e2e` 72 pass + 11 documented parallel-load flakes
  (`a11y` ×8, `feed-groups-journey` "reappear" ×3), 43/43 on isolated re-run incl. `matches-journey`;
  `visual-regression` stash-and-rerun shows an identical 33-fail noise floor on clean `master` — no
  `update-baselines` dispatch. Backend half (`hidden` field + `hidden`/`required` validator) is
  `common` C11 (scope-expanded 2026-09-10, still `TODO`).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
