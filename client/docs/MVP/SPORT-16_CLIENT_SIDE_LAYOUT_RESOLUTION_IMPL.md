# SPORT-16 — Client-side resolution of C11's raw `layout` fields · implementation

**Status:** `DONE` (2026-09-10) · **Branch:** `feature/SPORT-16-client-side-layout-resolution`
**Depends on:** `common` **C11** (merged `28462ba`, PR #249) — carries `layout` / `hidden` /
`fieldLayouts` raw.

## Approved design (Phase 3, as built)

C11 narrowed the backend to "validate the shape on an admin write, carry the rest raw", which
pushed three resolution steps onto the client. All three land here.

### 1. `layout.format` locale-map resolution

- `ResolvedAttributeLayout.format`: `string` → **`Record<string, string> | null`** — the C11 wire
  now carries the raw locale map on the resolved schema too (only `label` is still
  server-resolved). New `ResolvedAttributeFieldLayout` (partial layout + `hidden`) for the
  `fieldLayouts` map value.
- `layout.ts`: new `resolveFormatMap(format)` — `map['en-US'] ?? map['en']`, else `null` (render
  unformatted, same as an absent pattern); tolerates a bare string for old fixtures / hand-built
  layouts. `UI_LOCALE = 'en-US'` (no i18n yet — `I18N-1`, V1).
- `normalizeLayout` resolves the map internally, so its `NormalizedLayout.format: string | null`
  return shape is unchanged — **`NumberField` / `StringField` / `attributeValues.tsx` need no
  change**. 13 `format: '…'` string literals in stories/tests became `format: { en: '…' }`;
  rendered output is identical.

### 2. `#ref` `fieldLayouts` per-field override merge

- New `attributeFields/refFieldLayouts.ts` — `applyRefFieldLayouts(definitionsByName, node)`
  returns a **new** `definitionsByName` map with just the `#ref`'s definition entry replaced by
  one whose fields carry the overridden `layout`/`hidden`. Every record renderer
  (`DefinitionFields`, `renderRecord`, `renderValueNode`) resolves the definition **by name** from
  the map, so swapping the entry threads the overrides through with **zero renderer signature
  changes**.
  - `layout` is **replaced whole** (not deep-merged) when the override carries any of
    `id`/`icon`/`format`; a `{ hidden: true }`-only override leaves `field.layout` in force.
  - `hidden` = `override.hidden ?? field.hidden`.
  - Never touches `type`/`options`/`isRequired`/`definitionRef`; unknown map keys ignored; the
    input map is never mutated; returns the **same reference** when the node has no `fieldLayouts`.
- Applied in `RefField` (folds into `effectiveDefinitions`, `useMemo`-wrapped) and
  `SessionAttributesSummary`'s `#ref` branch (local `defs` per `#ref` attribute).

### 3. `#ref` → base `layout` inheritance (C11 open decision → **client-side**, no server carry)

- New `findAttributeByPath(schema, path)` in `refFieldLayouts.ts` — walks group keys down a
  `/`-path, matches the leaf against the target group's `attributes`. `undefined` for a bare
  single-segment path (every attribute is under ≥1 group), unknown path, or null schema.
- `SportAttributesFields` + `SessionAttributesSummary` gain an optional `refBaseSchema?:
  ResolvedSportAttributeSchema | null` prop (only the session context passes it — same pattern as
  `refChoiceSource`). For a `#ref` node the effective layout is
  `attribute.layout ?? findAttributeByPath(refBaseSchema, attribute.prefillKey)?.layout ?? null`.
- `RefField` gains a `layout?: ResolvedAttributeLayout | null` prop — used via
  `effectiveLayout = layout === undefined ? node.layout : layout`, so existing callers/tests that
  don't pass it are unaffected. An inherited `id` outside the `#ref`'s composed control set →
  existing SPORT-15 `pickLayoutId` degrade-to-default + dev warn (no new handling).

### Data layer

- `useSportAttributeSchema(sportId)` wired into `useCreateSessionModalData` and
  `useSessionDetailModalData` → each exposes `refBaseSchema`. Its `['sportAttributeSchema',
  sportId]` TanStack Query cache is the "load once / check-then-fetch" layer (shared with
  `/profile`, deduped, lazy via `enabled`); no Zustand / `sessionStorage` (per `client/CLAUDE.md`
  — server state is TanStack Query's).
- `useMatchesPageData` binds `refBaseSchema` (create) + `detailRefBaseSchema` (detail) explicitly
  — same `...spread` collision the `sessionAttributeSchema` pair already had.
  `useDiscoverModalData` re-exposes it through its existing `...sessionDetailData` spread.
- Threaded to `<CreateSessionModal>` (MatchesPage + Friends/Groups/HomeFeed/Profile) and
  `<SessionDetailModal>` (MatchesPage + the 4 pages via `discoverModalData` + `AppShell`).

## Delta vs. the ticket / epic

- **`#ref`→base inheritance mechanism:** option **(a)** (client holds the profile schema), per
  C11's already-locked decision. Option (b)'s `baseLayout` carry-field was never added server-side.
- **`format` fallback:** `map['en-US'] ?? map['en'] ?? unformatted`. The ticket suggested a
  `defaultLocale` fallback, but the **resolved** schema (the only one a Normal User can read) drops
  `defaultLocale` by design (`ResolvedAttributeSchema`), so `'en'` (every seed's locale) is the
  fallback and a map with neither key renders unformatted.

## Tests

- **`layout.test.ts`** (new) — `resolveFormatMap` locale precedence / null / bare-string /
  non-string-value; `normalizeLayout` format resolution + no-warn on an unusable map.
- **`refFieldLayouts.test.ts`** (new) — `applyRefFieldLayouts` same-ref / missing-def / whole
  replace / `{hidden}`-only / unknown key / no-mutation; `findAttributeByPath` top-level / nested /
  unknown / bare-key / null.
- **`RefField.test.tsx`** — `layout` prop overrides `node.layout`; `layout={null}` = no hint;
  omitted prop falls back to `node.layout`; `#ref` `fieldLayouts` `{hidden}` drops the field from
  the Other… record form; absent / unknown key = all fields render.
- **`SessionAttributesSummary.test.tsx`** — `#ref` with no own `layout` inherits the base
  attribute's `format` (`0.62` → `62%`); without `refBaseSchema` shows the raw value; `#ref`
  `fieldLayouts` `{hidden}` drops the field from the read record.
- **`RefField.stories.tsx`** — `InheritedLayout` (layout prop, no `node.layout`) + `FieldLayoutsOverride` (record base, `code` hidden / `note` textarea).

## Verification

- `tsc -b` clean · `eslint` clean.
- **Vitest:** 179 files / **1301 pass**, 0 failures (SPORT-15 baseline 177 / 1276; +2 files, +25
  tests).
- **E2E:** `pnpm e2e` — **82 passed, 1 failed** (`friends-journey.spec.ts`). Re-run in isolation:
  **1 passed** — a suite-parallelism flake (`[vite] ws proxy error: write ECONNABORTED` — the dev
  server's chat-websocket proxy choking under concurrent load, same class as the documented
  `a11y` / `feed-groups-journey` flakes), **not a regression**: SPORT-16 touched no friends/chat
  code, only two optional `refBaseSchema` props on modals not in that flow.
- **Visual-regression expectation:** no baselined surface touched — no MSW seed sets `layout` /
  `format` / `fieldLayouts`, so every renderer stays on its default (`layout` absent) path and the
  DOM is unchanged. A failing `visual-regression` run is the documented Windows font noise floor,
  not a regression. No `update-baselines` dispatch needed.
- Real backend: this ticket only *reads* an existing endpoint (`GET
  /api/sports/{id}/attribute-schema`) whose payload C11 enriched; C11's own IT
  (`SportAttributeSchemaIntegrationTest`) verified the raw `layout`/`format` wire round-trip.
