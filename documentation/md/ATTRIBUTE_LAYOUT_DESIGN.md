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
  /** Optional. Value-format **pattern string**, per type — NUMBER: `0` / `0.0` / `0.00` /
   *  `#,##0` / `#,##0.0` / `0%`, optional literal prefix+suffix (unit, currency); STRING:
   *  `uppercase` / `lowercase` / `titlecase`. Deliberately closed grammar, not an open DSL.
   *  **Localizable exactly like `label`**: a locale map in the raw schema, the resolved single
   *  string in the `Resolved*` twins. Applied to the read display; SPORT-13 keeps it
   *  display-only (no format-on-blur), SPORT-15 applies it across the read-only view. */
  format?: string; // raw schema: Record<string, string>
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
| `BOOLEAN` | `switch` (current) · `checkbox` · `segmented` | SPORT-13 |
| `ENUM` | `dropdown` · `radio` · `segmented`; selection is **clearable** in every layout (SPORT-13 scope add) | SPORT-13 |
| `format` on `STRING` / `NUMBER` | pattern grammar (`0.0` / `#,##0` / `0%` + literal prefix/suffix; `uppercase` / `lowercase` / `titlecase`), localizable like `label` | SPORT-13 |
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

## C11 — backend carry contract (shipped 2026-09-10)

`common` C11 added the fields to the neutral `com.sportconnect.common.attributes` model so a real
schema can carry them. The server **validates the shape on an admin schema write and otherwise
carries everything raw** — no resolution, no interpretation.

### Object shapes (Java, mirror the client types)

- **`AttributeLayout`** `{ id: String, icon?: String, format?: Map<String,String> }` — on every
  `AttributeNode` / `AttributeField` / `AttributeGroup` and their `Resolved*` twins.
  `@JsonIgnoreProperties(ignoreUnknown = true)`, so a newer client may send a property this
  version does not model (it is dropped, not carried).
  - **`format` stays a raw `locale → pattern` map on both the raw model and the `Resolved*`
    twins** — unlike `label`, it is *not* collapsed to one string server-side. This reverses what
    client `SPORT-13` assumed (`ResolvedAttributeLayout.format: string`); the client-side
    retrofit + locale resolution is client ticket **`SPORT-16`**.
- **`hidden`** `Boolean` — a **sibling** of `layout` on node / field / group (never nested inside
  `layout`), matching the client. Absent ⇒ `false`. A rendering-suppression flag, not a soft
  delete (`isAvailable` covers removal).
- **`fieldLayouts`** `Map<String, AttributeFieldLayout>` — **`#ref` nodes only**
  (`RefAttribute` + `ResolvedAttributeNode`). `AttributeFieldLayout` is a partial
  `{ id?, icon?, format?, hidden? }` override bundle. Client applies
  `fieldLayouts[key] ?? definitionField.layout` as a whole-object *replace* when rendering a
  `#ref`-to-`DEFINITION` record. Unknown map keys tolerated.

### The only gating behaviour (single-schema `AttributeSchemaValidator`; the field walk is shared,
so it also runs for the derived/session validator)

- **Reject** a definition field that is `hidden == true` **and** `isRequired == true` — a
  never-satisfiable contradiction.
- **Shape sanity**: a `layout` object present must carry a non-blank `id`
  (`LeafChecks.validateLayout`, on nodes / fields / groups). Never gated on *values* — an unknown
  `layout.id` / `icon` / `format` pattern / `fieldLayouts` key all pass (the client owns the
  vocabulary and degrades gracefully).
- **`#ref`-specific data stays lenient**: a `#ref` node's own `layout` / `hidden` / `fieldLayouts`
  are carried unvalidated (`DerivedSchemaValidator` adds no `#ref` presentation checks).

### Carry-through

- **JSON round-trip** (`AttributeJson`): a node with a full `layout` (incl. a `format` locale
  map), `hidden: true` and a `fieldLayouts` map survives serialize/deserialize byte-for-byte.
- **Resolver** (`AttributeSchemaResolver`): copies `layout` / `hidden` / `fieldLayouts` to the
  `Resolved*` twin verbatim — no locale resolution of `format`.
- **`#ref` expander/resolver** (`DerivedSchemaExpander` + `DerivedSchemaResolver`): a `#ref`
  node's own `layout` / `hidden` / `fieldLayouts` are carried on the `RefExpansion` record and
  stamped onto the resolved node alongside `prefillable` / `prefillKey` / `cardinality` (the
  inlined concrete node in the raw expanded schema carries none of them). The referenced
  definition type is pulled into the merged `definitions` registry as before, so its fields' own
  `layout` / `hidden` reach the client.

### `#ref` → base `layout` inheritance

Decided **client-side** (option (a)): the server carries nothing extra. A `#ref` node with no own
`layout` falls back to the referenced base attribute's `layout` in the client (`SPORT-16`), which
already loads the profile schema at session-create time.

### Not done here

- No DB migration. The session schema stays deliberately unseeded (V062); the Badminton profile
  seed (V061) is untouched. Demo examples live in the `common` test fixtures
  (`modules/common/src/test/resources/attributes/{comprehensive,derived}-schema.json`).

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
