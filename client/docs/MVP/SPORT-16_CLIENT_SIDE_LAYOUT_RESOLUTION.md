# SPORT-16 · Client-side resolution of C11's raw `layout` fields (`format` maps, `#ref` `fieldLayouts`, `#ref`→base inheritance)

**Status:** `DONE` (2026-09-10)
**Type:** Client feature
**Depends on:** `common` **C11** (carries `layout` / `hidden` / `fieldLayouts` raw, validates only
`hidden` XOR `required` at schema-update time). **Hard-blocked until C11 ships** — there is no wire
field to consume before then.
**Filed:** 2026-09-10, from the client `SPORT-15` `/workon` session — C11's scope was narrowed to
"validate on update, carry the rest raw", which pushes three resolution steps onto the client.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` + `modules/common/docs/MVP/C11_ATTRIBUTE_SCHEMA_LAYOUT_HINT.md`.

## Why

`SPORT-13`/`14`/`15` built the layout renderers against a **server-resolved** `layout` — in
particular `ResolvedAttributeLayout.format` is a single `string` (the server resolved the locale
map). C11 now carries `layout` (and `hidden`, and the new `#ref` `fieldLayouts`) **raw**: the
server no longer resolves `format` locale maps, no longer overlays `#ref` layout inheritance, and
does not merge `fieldLayouts`. This ticket does all of that client-side.

## Scope

### 1. `format` locale-map resolution moves client-side

- `ResolvedAttributeLayout.format` goes from `string` back to `Record<string, string>` (a raw
  locale map, like `label` on the raw types).
- A small resolve step (`map[uiLocale] ?? map['en'] ?? firstValue`) applied wherever `format` is
  read — `formatAttributeValue` call sites in the scalar arms (`SPORT-13`), `NumberField` /
  `StringField` preview lines, and `SessionAttributesSummary` / `attributeValues` (`SPORT-15`).
  The app has no i18n yet (`I18N-1`, V1) so `uiLocale` is `'en-US'`; keep the same
  documented-simplification comment `formatAttributeValue` already carries.
- Every existing `format` test/story updated from a bare string to a `{ en: '…' }` map.

### 2. `#ref` `fieldLayouts` override merge

- New optional `fieldLayouts?: Record<string, ResolvedAttributeLayout & { hidden?: boolean }>` on
  `ResolvedRefAttribute` (`shared/types/sport.ts`), mirroring C11.
- When rendering a `#ref`-to-`DEFINITION` record, the effective per-field presentation is
  `node.fieldLayouts?.[field.key] ?? field.layout` (whole-object **replace**) and
  `node.fieldLayouts?.[field.key]?.hidden ?? field.hidden`. Applied in **both**:
  - edit — `RefField` → `DefinitionFields` (pass an override map / resolved fields down)
  - read — `SessionAttributesSummary` `#ref` branch → `renderRecord`
- Unknown `fieldLayouts` keys are ignored. `fieldLayouts` never changes a field's `type` /
  `options` / `isRequired`.

### 3. `#ref` → base `layout` inheritance (resolve C11's open decision)

**Resolved at pickup: option (a)** — the client holds the profile schema and does
`node.layout ?? baseAttr.layout`. C11 already locked this ("client-side, no server carry"); no
`baseLayout` field was added. Both the create path (`useCreateSessionModalData`) and the read path
(`useSessionDetailModalData`) call `useSportAttributeSchema(sportId)` — its
`['sportAttributeSchema', sportId]` TanStack Query cache dedupes and persists, so the profile
schema is loaded at most once per sport.

An inherited `layout.id` that doesn't fit the `#ref`'s composed control set
(`SINGLE`→ENUM set, `LIST`→LIST set) already degrades to the default + a dev warning (SPORT-15) —
no new handling needed.

### Delta — `format` fallback (vs. §1's `map['en'] ?? firstValue`)

`ResolvedAttributeLayout.format` resolves as `map['en-US'] ?? map['en'] ?? unformatted`. The
`defaultLocale` fallback §1 gestures at is **not reachable** — the member-facing resolved schema
(`ResolvedSportAttributeSchema`) deliberately omits `defaultLocale` (it's "only an input to
resolution"), and the raw schema that carries it is admin-only. `'en'` (every seed's locale) is
the effective fallback; a map with neither key renders the raw value, same as a null pattern.

## Out of scope

- The backend half (`common` C11).
- New layout *ids* or elements — this is resolution plumbing for the existing vocabulary.
- i18n / a real UI locale (`I18N-1`, V1).

## Tests

- `formatAttributeValue` + every scalar arm + `SessionAttributesSummary`: a `format` given as a
  `{ en: '0%' }` map renders identically to the old bare-string `'0%'`; a missing-locale map falls
  back sanely.
- `RefField` + `SessionAttributesSummary` `#ref` branch: a `fieldLayouts` entry overrides that
  field's control/display; an absent entry leaves the definition field's own `layout` in force; an
  unknown key is ignored; `type`/`options`/`isRequired` are untouched.
- `#ref` inheritance (per the chosen option): a `#ref` node with no own `layout` renders with the
  base attribute's; with its own `layout` set, the own value wins.
- Visual-regression: no baselined surface changes unless an MSW seed sets `layout`/`fieldLayouts`
  (it should not, by default) — call out any shift for an `update-baselines` dispatch.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
