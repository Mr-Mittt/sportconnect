# SPORT-14 — implementation summary

**Ticket:** `client/docs/MVP/SPORT-14_CONTAINER_ELEMENT_LAYOUTS.md`
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md`
**Status:** `DONE` (2026-09-09) · 2 of 3 (SPORT-13 scalar layouts done; SPORT-15 read-only parity + `#ref` open)

## Approved design (restated)

Make the four **container** elements honour the schema-driven `layout` object SPORT-13 wired
through the scalar arms, degrading to today's exact markup (+ a deduped dev warn) whenever `layout`
is absent, malformed, or carries an id/icon the element doesn't support. Reuses SPORT-13's
`normalizeLayout` / `pickLayoutId` / `devWarn`. No `sport.ts` migration — every `layout?` field
already exists on the resolved types. No backend change (that's `common` C11); no MSW seed sets
`layout`, so every existing surface renders unchanged.

Locked decisions from the Phase 1 gate:

- **`group`** — `section` (default) · `grid-2` · `grid-3` · `inline` · `flat`. **All layouts keep
  the `Collapsible` wrapper**; only the inner attribute arrangement changes (`flat` = collapsible
  heading, ungridded stack, no box). `section` and `grid-2` render the identical SPORT-7 grid.
- **`DEFINITION`** — `stacked` (default) · `inline` · `grid-2`.
- **`DEFINITION_LIST`** — `cards` (default) · `table` · `accordion`.
- **`LIST` (container)** — **`checkboxes`** (default) · `chips` · `multiselect` · `ordered`. The
  design doc labelled `chips` "current", but the shipped component is a checkbox list — default id
  is `checkboxes` so "absent `layout` → today, byte-identical" stays literally true (Delta below).
- **`layout.icon`** on `group` / `DEFINITION` / `DEFINITION_LIST` headings via a `headingIcons.tsx`
  registry (Tabler-backed common names + local `IconShuttlecock` / `IconRacket` for the two glyphs
  Tabler lacks). Unknown name → no icon + dev warn. Icon is decorative (`aria-hidden`); the text
  label carries the meaning.
- **`inline`** is a container-level CSS affordance only — the seven arm components are **not**
  restructured (user decision, to keep SPORT-13's just-stabilised arm APIs untouched).

## What was built

### `attributeFields/layout.ts`

`NormalizedLayout` gains `icon: string | null`; `normalizeLayout` now also surfaces a non-empty
`layout.icon`. The four scalar arms destructure `{ id, format }` and are unaffected.

### `attributeFields/headingIcons.tsx` (new)

- `HEADING_ICONS` — a closed `Record<string, ComponentType<{ className?: string }>>` of ~20 names:
  Tabler outline components (`tennis` → `IconBallTennis`, `strength` → `IconBarbell`, `settings` /
  `gear` → `IconSettings`, `calendar`, `ruler`, `clock`, `list`, `user(s)`, `map-pin`, `note`,
  the ball sports…) plus `shuttlecock` / `racket` → the local glyphs.
- `resolveHeadingIcon(name, context)` → component | `null`. Nullish/empty → `null` silently;
  unknown non-empty → `devWarn('layout-icon-unknown:<ctx>:<name>')` + `null`.
- `renderHeadingLabel(label, iconName, context): ReactNode` — returns the **bare `label` string**
  when no icon resolves (so a no-icon heading is byte-identical to pre-SPORT-14), else
  `<span class="inline-flex items-center gap-1.5"><span aria-hidden><Icon/></span>{label}</span>`.

### `attributeFields/icons/IconShuttlecock.tsx`, `IconRacket.tsx` (new)

Outline SVG React components authored to Tabler's spec (24×24 viewBox, `currentColor` stroke, 1.75
width, round caps/joins) — theme-safe in light/dark, bundled as code. **Placeholder path data,
marked `TODO(SPORT-14)`** — real artwork to be supplied and swapped in.

### `attributeFields/ListField.tsx`

`layout` prop; `pickLayoutId(..., ['checkboxes','chips','multiselect','ordered'], 'checkboxes')`.
- `checkboxes` — the prior markup verbatim (default).
- `chips` — `role="checkbox"` toggle `<button>`s in a wrap row, token-styled
  (`bg-accent-solid text-white` selected + a `✓`, `bg-surface-1 border-hairline` unselected);
  `atCap` disables the unselected.
- `multiselect` — a token-styled native `<select multiple>` (native = a11y for free, no new dep).
- `ordered` — the checkbox list, with `IconChevronUp` / `IconChevronDown` icon-buttons on each
  **selected** row reordering it within the stored array; unselected options list below without
  arrows.

Every variant stores / emits a `string[]`; cap = `MAX_LIST_ITEMS`.

### `attributeFields/DefinitionFields.tsx`

`layout` prop; `pickLayoutId(..., ['stacked','inline','grid-2'], 'stacked')`. `stacked` renders the
`RecordField`s directly (byte-identical); `grid-2` wraps them in `grid ... sm:grid-cols-2`;
`inline` wraps each in a `grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)]` row with `[&>div]:contents`
so a scalar field's `<Label>` + control split into the two columns without the arm knowing, and
`[&>fieldset]:col-span-2` / `[&>div>fieldset]:col-span-2` keeps `LIST` / nested `DEFINITION` fields
full-width and stacked. `RecordField` is now **exported** so `DefinitionListField`'s `table` layout
can render one field per cell. `RecordField`'s nested-`DEFINITION` branch forwards `field.layout`
to its inner `DefinitionFields` and renders `renderHeadingLabel` in its `<legend>`.

### `attributeFields/DefinitionField.tsx`

`Pick` widened to include `layout`; forwards `attribute.layout` to `DefinitionFields` and renders
`renderHeadingLabel` in its `<legend>`.

### `attributeFields/DefinitionListField.tsx`

`layout` prop; `pickLayoutId(..., ['cards','table','accordion'], 'cards')`.
- `cards` — the prior markup verbatim (default; only the heading text node can now carry an icon).
- `table` — a real `<table>`: `<th scope="col">` per definition field + an actions column; one
  `<tr>` per record; each `<td>` renders an exported `RecordField` with `[&_label]:sr-only` on the
  row (accessible name kept, the column header is the visible label). **Degrades to `cards` + a
  `devWarn('layout-degrade-table:<label>')` when any record field is `LIST` / `DEFINITION`** — those
  don't fit a cell.
- `accordion` — each record in a `Collapsible` (`defaultOpen`); the trigger shows `Item N` plus the
  first non-empty scalar field value as a summary; the body is the same `DefinitionFields` + a
  remove button (outside the trigger — no nested buttons).

The heading `<span>` (all three layouts) and the accordion trigger use `renderHeadingLabel`.

### `SportAttributesFields.tsx` — `GroupSection`

`GROUP_LAYOUTS` = `['section','grid-2','grid-3','inline','flat']`. `GROUP_ATTR_WRAPPER` maps each id
to the inner wrapper class — `section` and `grid-2` are the exact SPORT-7 string
(`grid grid-cols-1 gap-3.5 sm:grid-cols-2`), `grid-3` adds `lg:grid-cols-3`, `flat` /`inline` are
`flex flex-col`. In `inline` each `AttributeField` cell is wrapped in `GROUP_INLINE_ROW` (the same
`display:contents` 2-col-grid trick as `DefinitionFields`, one level deeper for the `.min-w-0`
cell). The `<CollapsibleTrigger>` renders `renderHeadingLabel(group.label, icon, path)`. The
`AttributeField` `LIST` / `DEFINITION_LIST` cases now pass `layout={attribute.layout ?? undefined}`;
`DEFINITION` already received the whole `attribute`.

### Tests

- `headingIcons.test.tsx` (new) — known / local / unknown / nullish name; `renderHeadingLabel`
  returns a bare string with no icon, an `aria-hidden` icon with one.
- `ListField.test.tsx` (new) — each layout renders + emits a `string[]`; unknown id → `checkboxes`
  + one warn; `ordered` reorders and disables the first row's up-arrow; cap disables unselected in
  `checkboxes` and `chips`.
- `DefinitionFields.test.tsx` (new) — `stacked` / `grid-2` / `inline` render every field and keep
  the bare record-key `onChange` shape; unknown id → `stacked` + one warn.
- `DefinitionListField.test.tsx` (new) — `cards` / `table` / `accordion` render; `table` edits
  write through unchanged keys; `table` + a `LIST` field → `cards` + one warn; cap disables `Add`
  in every layout.
- `SportAttributesFields.test.tsx` — new `describe('SPORT-14 — container layouts')`: default keeps
  the 1→2-col grid; `grid-3` adds `lg:grid-cols-3`; `flat` drops the grid; `inline` still renders
  every field and keeps path-keyed `onChange`; unknown group id → grid + one warn; known / unknown
  `layout.icon`; `isAvailable:false` still hides a group under a non-default layout; a
  `DEFINITION_LIST` node honours its own `layout.id`.

### Stories (+ `addon-a11y`)

- `ListField.stories.tsx`, `DefinitionFields.stories.tsx`, `DefinitionListField.stories.tsx` (new)
  — one story per `layout.id` + `DefaultNoLayout` (+ a heading-`icon` variant on the list).
- `SportAttributesFields.stories.tsx` — `GroupLayoutGrid3`, `GroupLayoutInline`, `GroupLayoutFlat`,
  `HeadingIcons`, `MixedNestedLayouts` (a `grid-3` group holding an `inline` DEFINITION and a
  `table` DEFINITION_LIST).

## Divergences from the approved plan

- **`inline` known limitation (documented, not a divergence in intent):** because the arms are not
  restructured, `BOOLEAN` / radio / segmented arms — which have their own internal flex layout —
  render label-left but with looser alignment than the scalar `<input>` / `<select>` arms. Accepted
  per the "CSS wrapper only" decision.
- **`table` DEFINITION_LIST is scalar-only** — a record with a `LIST` or nested `DEFINITION` field
  degrades to `cards` + a dev warning rather than trying to fit those controls in a cell. Folded
  into the ticket's Delta.
- `RecordField` is now exported from `DefinitionFields.tsx` (was module-private) so the `table`
  layout can render one field per cell.

## Consumer census (client)

| Consumer | Disposition |
|---|---|
| `SportAttributesFields` `GroupSection` / `AttributeField` | updated here — reads container `layout`, threads to the 4 container components |
| `DefinitionFields` imported by `RefField` (the `#ref` "Other…" modal) | compatible as-is — new `layout` prop optional, defaults to `stacked`; `RefField` passes nothing |
| `DefinitionField` / `DefinitionListField` / `ListField` (only `SportAttributesFields` uses them) | updated here — optional `layout` prop |
| `RefField` `#ref` controls | compatible as-is — `#ref` composition is SPORT-15; no `layout` passed |
| `SessionAttributesSummary` (read-only) | compatible as-is — imports only `attributeValues`; read-only parity is SPORT-15 |
| `CollapsibleSection.tsx` (admin) | compatible as-is — names `GroupSection` only in a comment |
| MSW `e2e/mocks/handlers/sport.ts` + label resolver | compatible as-is — no seed sets `layout` |
| existing `SportAttributesFields` tests / stories | compatible as-is — `layout` optional; default branches byte-identical |

No shared-type change, no hook/store change, no API contract touched.

## Verification

- `pnpm exec tsc -b` — clean. `pnpm lint` — 0 errors (2 pre-existing `SessionStartTimePicker.tsx`
  warnings, untouched).
- `pnpm test` — **176 files / 1248 passed** (was 172 / 1213 at SPORT-13; +4 files —
  `headingIcons`/`ListField`/`DefinitionFields`/`DefinitionListField` `.test.tsx` — +35 cases incl.
  the `SportAttributesFields` SPORT-14 block).
- `pnpm build-storybook` — success (all new stories compile).
- **Browser / Storybook:** no dev-server walk — no MSW schema seed sets `layout`, so `/profile` and
  the session modals render the unchanged defaults (already covered by the composite Vitest + e2e).
  The container variants' human-review surface is the new `attributeFields/*.stories.tsx` +
  `SportAttributesFields` layout stories; `addon-a11y` runs on every story in CI. No real backend
  endpoint is touched (pure rendering, no hook).

### E2E

`pnpm e2e` — **75 passed, 8 failed**, every failure in `e2e/flows/a11y.spec.ts` (home-feed
overflow + axe at 375/768/1280, sport-filtered state, groups Members tab) — surfaces SPORT-14 does
not touch. The run had the full Vitest suite executing concurrently and the failures carried
`[WebServer] Error: write ECONNABORTED` (the Windows Vite-dev-server write-pipe artifact under
load) — identical to SPORT-13's e2e result. **Isolated re-run: `a11y.spec.ts` 31/31 passed** — a
suite-parallelism flake, not a regression. Every attribute-rendering spec (`matches-journey`,
`profile-journey`) passed in the main run.

### Visual-regression expectation

**No baselined surface touched — no baseline change expected.** Every container's default branch
reproduces its pre-SPORT-14 DOM verbatim (`section`/`grid-2` = the SPORT-7 grid string,
`stacked`/`cards`/`checkboxes` = the prior markup, `renderHeadingLabel` returns a bare string with
no icon), and no MSW schema seed sets `layout`, so `app-profile` / `app-session-detail-modal` /
`app-create-session-modal` render byte-identically. New Storybook stories are not
`visual-regression` baselines. A failing `visual-regression` run on this Windows host is the
documented font-rendering noise floor, not a regression.

**Stash-and-rerun proof:** ran `visual-regression` on `app-profile` + `app-session-detail-modal` +
`app-create-session-modal` (all three render `SportAttributesFields` / `RefField` → `DefinitionFields`)
with SPORT-14 applied, then `git stash`ed and re-ran the same three. **Every diff is byte-for-byte
identical between the two runs** — e.g. `create-session-session-detail-ref-{375,768,1280}` at
4959 / 5872 / 5866 px, `create-session-no-sport-profiles-*` with the same 424→430 px height shift,
`app-profile` at 22223 px / 375×1869→375×1807. The `session-detail-ref` shots exercise
`DefinitionFields` (which gained the optional `layout` prop) and are unchanged with no `layout`
passed. So the failures are entirely the Windows noise floor and **no `update-baselines` dispatch
is needed**.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01SbRuC23SyMfuaoCukgG1oe
