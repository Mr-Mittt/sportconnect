# SPORT-15 — implementation summary

**Ticket:** `client/docs/MVP/SPORT-15_READ_ONLY_LAYOUT_PARITY_AND_REF.md`
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`
**Status:** `DONE` (2026-09-10) · 3 of 3 (SPORT-13 scalar + SPORT-14 container layouts done)

## Approved design (restated)

Bring the **read-only** view (`SessionAttributesSummary` in `SessionDetailModal`) to full `layout`
parity with the editable renderer, compose a `#ref` node's layout with its `SINGLE`/`LIST`
cardinality on **both** the edit (`RefField`) and read sides, and add a new **`hidden`** attribute
flag that both renderers honour. Absent `layout`/`hidden` ⇒ output byte-identical; no MSW seed sets
either, so no baselined surface moves. Reuses SPORT-13/14's `formatAttributeValue`,
`renderHeadingLabel`, `normalizeLayout`/`pickLayoutId`/`devWarn`, `RadioGroup`/`SegmentedControl`,
`Collapsible`.

Scope changes locked at the Phase 1 gate (written into the ticket + `common` C11):

1. **Full read-only container parity** — the `<dl>` reshapes for every container id, not just
   value-presentation.
2. **`#ref` composition on both sides** (edit + read).
3. **`hidden` flag** — render-suppression, not soft delete; value round-trips; mutually exclusive
   with `required` (C11 validator; client `hidden` wins). Backend half is `common` C11, scope-expanded
   the same day (its doc notes `hidden` is the one gating rule in an otherwise presentation-only
   ticket).

## What was built

### Types — `shared/types/sport.ts`

`hidden?: boolean | null` added to the raw commons (`SportAttributeField`,
`SportAttributeDefinition`, `SportAttributeGroup`, `SessionAttributeNode`, `SessionAttributeGroup`)
and the resolved commons (`ResolvedAttributeCommon`, `ResolvedFieldCommon`,
`ResolvedSportAttributeGroup`). Mirrors C11.

### `hidden` filtering (editable + read)

- `SportAttributesFields.tsx` — `isGroupAvailable` / `isAttributeVisible` also return `false` for
  `hidden === true` (so grid cells, `seedDefaults`, and the subtree cascade all skip it).
- `DefinitionFields.tsx` — `definitionType.fields.filter(f => f.hidden !== true)` before mapping to
  `RecordField`.
- `SessionAttributesSummary.tsx` `renderGroup` — filters `hidden` attributes and returns `null` for
  a `hidden` group.
- `attributeValues.tsx` `renderRecord` (+ the `table` header/cells and `accordionSummary`) — filters
  `hidden` record fields.
- `hidden` wins over `required` implicitly (the filter is unconditional; the "Required" hint is
  never reached).

### Read-only `layout` parity — `attributeValues.tsx` + `SessionAttributesSummary.tsx`

`renderValueNode` gains a trailing `layout?` + `context` param; `ValueContext` carries `layout`;
`renderRecord` gains a `layout` param; `Row.term` widened `string → ReactNode` (for a `layout.icon`
prefix via `renderHeadingLabel`).

| Element | Read-only behaviour |
|---|---|
| scalar (STRING/NUMBER) | `layout.id` ignored (the read view is already text); `layout.format` applied via `formatAttributeValue`. |
| `LIST` value display | new `listDisplayId` helper: `chips` (default) · `comma` (`"A, B, C"`) · `bullets` (`<ul class="list-disc">`). SPORT-14 editable ids (`checkboxes`/`multiselect`/`ordered`) silently → `chips`; a truly unknown id → `chips` + warn. |
| `DEFINITION` (`renderRecord`) | `stacked` (default) ≡ `inline` → the label-left `<dl>`; `grid-2` → `GridPairs` (a responsive 2-col grid of term-over-value cells). |
| `group` (`renderGroup`) | `section` (default) ≡ `inline` → heading + `AttributeList`; `flat` → no heading; `grid-2` / `grid-3` → `GridPairs` cols 2/3. Heading via `renderHeadingLabel` (`layout.icon`). |
| `DEFINITION_LIST` (`valueRenderers.DEFINITION_LIST`) | `cards` (default, bordered blocks) · `table` (`<th>` per non-`hidden` field, `<tr>` per record, `<td>` = `renderValueNode` of the field, `—` for an empty cell) · `accordion` (each record a `<Collapsible defaultOpen>`, trigger = `Item N · <first scalar value>`, body = `renderRecord`). |

New exported helper `GridPairs({ rows, cols })` in `attributeValues.tsx`. Every "absent `layout`"
path reproduces the pre-SPORT-15 markup (verified: `renderHeadingLabel` returns a bare string with
no icon; `pickLayoutId(null,…)` returns the default silently).

### `#ref` composition

**Read** — `renderGroup` now passes `attribute.layout` into `renderValueNode` for the `#ref` row,
so a `LIST` `#ref` picks up the `LIST` display variant and a record `#ref` the `DEFINITION_LIST`
variant automatically; unknown id → default + warn.

**Edit — `RefField.tsx`** — resolves `node.layout.id` against the composed set and switches the
control shape, keeping `choices` / `selectedKeys` / `toggle` / `commitDraft` / `modal` /
`noProfileValues` shared:
- **SINGLE** — `pickLayoutId(id, ['dropdown','radio','segmented'], 'dropdown')`. `dropdown` = the
  prior `<Select>` (+ `Other…` option), byte-identical. `radio` = `<RadioGroup>` of choices + a
  separate `Other…` `<Button>`. `segmented` = `<SegmentedControl>` + `Other…`, → `dropdown` + warn
  past 5 choices.
- **LIST** — `pickLayoutId(id, ['checkboxes','chips','multiselect','ordered'], 'checkboxes')`.
  `checkboxes` = the prior checkbox list, byte-identical. `chips` = `role="checkbox"` toggle pills.
  `multiselect` = native `<select multiple>` over `choice.text`. `ordered` = checkbox list + up/down
  (`IconChevronUp`/`Down`) reordering the stored array. All keep the trailing `Other…` `<Button>` +
  cap note + modal.

### Tests / stories

- `SessionAttributesSummary.test.tsx` — new `SPORT-15 read-only layout parity` block (13 cases:
  `comma`/`bullets`, editable-id fallback, `format`, group `grid-2`/`flat`/`icon`,
  `table`/`accordion`, unknown-id warn, absent-layout unchanged) + a `hidden` block (2 cases).
- `RefField.test.tsx` (new — `RefField` had no unit test) — 12 cases across SINGLE
  `dropdown`/`radio`/`segmented` (+ >5 degrade, unknown-id) and LIST
  `checkboxes`/`chips`/`multiselect`/`ordered` (+ unknown-id, `Other…` in every layout).
- `DefinitionFields.test.tsx` — `hidden` field renders no input, its value round-trips.
- `SportAttributesFields.test.tsx` — `SPORT-15 — hidden` block: `hidden` attribute/group render no
  input; a `hidden` field's `defaultValue` is not seeded.
- Stories — `SessionAttributesSummary.stories.tsx`: `ReadOnlyLayouts` (every read id in one doc) +
  `HiddenField`. `RefField.stories.tsx` (new): one per SINGLE + LIST layout id + defaults.

## Divergences from the approved plan

- **`inline` ≡ `stacked`/`section` in read-only** — the read view is already label-left, so there
  is no distinct `inline` rendering to build. Documented in the code and the ticket; `pickLayoutId`
  still accepts `inline` without a warning.
- Read-only scalar `layout.id` is a **no-op** (only `format` matters) — an editable-only scalar id
  on a read node renders text with no warning, rather than warning on every such id.
- `RefField` had **no** unit test before this ticket; added a full one rather than extending an
  existing file.

## Consumer census (client)

| Consumer | Disposition |
|---|---|
| `sport.ts` `hidden?` on 5 raw + 3 resolved commons | updated here; additive optional → every existing consumer compatible |
| `attributeValues.tsx` `renderValueNode` / `renderRecord` | updated here — trailing optional `layout`/`context` params |
| `refChoices.tsx` (`deriveRefChoices` → `renderRecord`) | compatible — passes no `layout` → default |
| `SessionAttributesSummary` `.test.tsx` / `.stories.tsx` | compatible — added cases |
| `SportAttributesFields` / `DefinitionFields` (+ their tests) | updated here — `hidden` filter; existing tests green |
| `RefField` | updated here — layout-id control switch; no `layout` seed on a `#ref` node → `create-session-session-detail-ref-*` baseline byte-identical |
| MSW `e2e/mocks/handlers/sport.ts`; e2e `matches-journey` / `profile-journey` / `app-*` | compatible — all exercise default paths; no seed sets `layout`/`hidden` |

No hook, store, or endpoint touched.

## Verification

- `pnpm exec tsc -b` — clean. `pnpm lint` — 0 errors (2 pre-existing `SessionStartTimePicker.tsx`
  warnings, untouched).
- `pnpm test` — **177 files / 1276 passed** (was 176 / 1248 at SPORT-14; +1 file — new
  `RefField.test.tsx` — +28 cases incl. the `SessionAttributesSummary` SPORT-15/`hidden` blocks and
  the editable-`hidden` cases).
- Targeted `attributeFields/` + `SportAttributesFields` + `SessionAttributesSummary` run — 150
  passed (12 files).
- **Browser / Storybook:** no dev-server walk — no MSW schema seed sets `layout` or `hidden`, so
  `SessionDetailModal` / `CreateSessionModal` render the unchanged defaults (already covered by the
  composite Vitest + e2e). The variants' human-review surface is the new
  `SessionAttributesSummary` / `RefField` stories; `addon-a11y` runs on every story in CI. No real
  backend endpoint is touched.
- `pnpm build-storybook` — success (all new stories compile).

### E2E

`pnpm e2e` — **72 passed, 11 failed**: 8 in `e2e/flows/a11y.spec.ts` (home-feed overflow + axe at
375/768/1280, sport-filtered, groups Members tab) and 3 in `e2e/flows/feed-groups-journey.spec.ts`
(the "a failed X does not reappear when the dialog is reopened" trio). Both are the documented
Windows suite-parallelism flakes (`a11y` — SPORT-13/14; `feed-groups-journey` "reappear" —
CLIENT-SESSION-16), running with the full Vitest suite concurrently. **Isolated re-run:
`a11y.spec.ts` + `feed-groups-journey.spec.ts` + `matches-journey.spec.ts` — 43/43 passed.**
`matches-journey` (exercises `SessionAttributesSummary` + `RefField` + `SportAttributesFields`
default paths) passed in both runs. No attribute/session spec failed.

### Visual-regression expectation

**No baselined surface touched — no baseline change expected.** Every read-only default branch
reproduces its pre-SPORT-15 markup, `RefField`'s `dropdown`/`checkboxes` defaults are byte-identical,
and no MSW schema seed sets `layout` or `hidden`, so `session-detail-*` /
`create-session-session-detail-ref-*` / `app-session-detail-modal` render byte-identically. New
Storybook stories are not `visual-regression` baselines.

**Stash-and-rerun proof:** `visual-regression` on `app-session-detail-modal` +
`app-create-session-modal` (both render `SessionAttributesSummary` / `RefField`) — **33 failed with
SPORT-15 applied, 33 failed with `git stash`ed**, the same set of pixel-diff magnitudes (3859–6975
px) and the same 424→430 px dimension shifts in both runs (the ±1–5 px wobble between runs, e.g.
6709↔6713, is sub-pixel font-rendering noise on unchanged code). So the failures are entirely the
documented Windows noise floor and **no `update-baselines` dispatch is needed**.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01SbRuC23SyMfuaoCukgG1oe
