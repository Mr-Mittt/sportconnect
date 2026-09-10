# C11 · `layout` presentation hint + `hidden` flag on attribute-schema nodes

**Status:** `TODO`
**Type:** Enhancement
**Depends on:** `C5`–`C9` (the `common.attributes` DTO tree). Pairs with client `SPORT-13` /
`SPORT-14` / `SPORT-15`, which define and consume the vocabulary.
**Filed:** 2026-09-09, from the client `SPORT-13` `/ticket` session — the client layout tickets
add a schema-driven per-element/per-type `layout` rendering hint but the schema DTOs have no field
to carry it, so they ship client-types + MSW-seed only until this lands.
**Design:** `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` (object shape + vocabulary, shared with
the client tickets).

**Scope change (2026-09-10, from the client `SPORT-15` `/workon` session):** adds an optional
**`hidden`** boolean and an optional **`fieldLayouts`** map (per-field overrides on a `#ref` node)
to the same node model, and **narrows the server's job to "validate on schema update, carry the
rest raw"**. `hidden` means *"the value is stored and round-trips, but no editor input and no
read-only row is rendered for it"* — e.g. a `Reference` definition keeps a `url` field populated
by code while only its `name` is user-facing. `hidden` is a **rendering-suppression flag, not a
soft delete** (`isAvailable: false` covers removal). The **only** structural rule this ticket adds
is `hidden` XOR `required` (rejected at schema-update time); everything else is carried through
untouched and interpreted entirely client-side.

## Scope — validate on update, carry the rest raw

The server does **not** resolve or interpret `layout` / `hidden` / `fieldLayouts`. It validates a
schema when the admin saves it, and otherwise passes these fields straight through the model,
JSON round-trip, resolver, and `#ref` derived-schema expander as opaque data.

### 1. Model fields

Add to the raw `AttributeNode` / `AttributeField` / `Group` sealed sets **and** their `Resolved*`
twins (mirror client `SPORT-13`'s `AttributeLayout`, reconcile names at pickup):

- `layout` — an object `{ id, icon?, format?, … }`:
  - `id` — string, the layout id (opaque server-side; client owns the vocabulary).
  - `icon` — optional string (Tabler icon name).
  - `format` — **carried raw as a locale map** `Record<String,String>` (like `label`), **not**
    resolved to a single string server-side. The client resolves it. *(This differs from what
    `SPORT-13` shipped, where `ResolvedAttributeLayout.format` was a single string — see the
    `SPORT-13` follow-up below.)*
  - tolerate unknown extra properties.
- `hidden` — optional boolean. Absent ⇒ `false`.
- `fieldLayouts` — optional, **`#ref` nodes only**: a map keyed by field key of the referenced
  definition type, each value a partial `{ id?, icon?, format?(raw map) }` **and/or** `hidden`.
  Unknown keys tolerated. Presentation only — it never overrides a field's `type` / `options` /
  `isRequired` / `definitionRef`. The client applies `fieldLayouts[key] ?? definitionField.layout`
  (whole-object **replace**, not deep-merge) when rendering a `#ref`-to-`DEFINITION` record.

### 2. Carry-through (no resolution)

- `AttributeJson` round-trip: a node with a full `layout` object, `hidden: true`, and a
  `fieldLayouts` map survives serialize/deserialize byte-for-byte.
- Resolver: copies `layout` / `hidden` / `fieldLayouts` to the `Resolved*` twin **verbatim** — no
  locale resolution of `format`, no interpretation of `id` / `icon`.
- `#ref` derived-schema expander: a `#ref` node's own `layout` / `hidden` / `fieldLayouts` survive
  expansion untouched. The referenced definition type is included in the derived `definitions` (as
  it already is for `definitionRef`), so its fields' own `layout` / `hidden` reach the client.
- `SportService` `-api` resolved DTOs expose the three fields.

### 3. Validate (the only gating behaviour — at admin `PUT`, single-schema validator)

- **Reject** a node with `hidden == true` **and** `required == true` / `isRequired == true`.
- Shape sanity only, otherwise: `layout` must be an object with a string `id` when present;
  `fieldLayouts` must be an object whose values are objects. Reject malformed *shapes*; **never**
  reject on *values* — an unknown `layout.id`, an unknown `fieldLayouts` key, an unusual `icon`
  string all pass (the client owns the vocabulary and degrades gracefully).
- The derived validator stays lenient (presentation data is never a gate there).

### 4. Seeds + docs

- Mark one demo field `hidden` (e.g. a `Reference` definition's `url`) and give one `#ref` node a
  `fieldLayouts` entry, so the client tickets/tests have real examples.
- Admin `PUT` docs note `layout`, `hidden` (+ the `hidden` XOR `required` rule), and `fieldLayouts`.

## Open decision — `#ref` → base `layout` inheritance

`SPORT-15` wants: a `#ref` node with **no** own `layout` falls back to the **referenced base
attribute's** `layout`. Since the server no longer overlays anything, the fallback needs a home.
Two options, decide at pickup:

- **(a) Client fetches the base schema.** The client already loads the profile schema at
  session-create time (for `#ref` choices); it does `node.layout ?? baseAttr.layout` itself. The
  read path (`SessionDetailModal`) would also need to load the profile schema. Zero extra server
  carry.
- **(b) Expander carries the base's `layout`/`hidden` onto the `#ref` node as a `baseLayout`
  fallback field.** Still "carry, not resolve" — one more copied field. The client reads
  `node.layout ?? node.baseLayout`. No second schema fetch.

## Out of scope

Client rendering and all interpretation of `layout` / `hidden` / `fieldLayouts` (`SPORT-13` /
`SPORT-14` / `SPORT-15` + the new `SPORT-16` client follow-up). Any admin schema-editor UI. Server
resolution of `format` locale maps for `layout` (moved client-side). Any behaviour change from
`hidden` beyond the `hidden` XOR `required` validator.

## Follow-ups filed alongside this scope change

- **client `SPORT-16`** — consume C11's raw fields client-side: resolve `layout.format` locale
  maps (retrofit `ResolvedAttributeLayout.format` from `string` to a raw map + a resolve step —
  the `SPORT-13` assumption this reverses), apply `#ref` `fieldLayouts` overrides in `RefField` /
  `SessionAttributesSummary`, and implement whichever `#ref`→base inheritance option is chosen.

## Tests

- Round-trip parity: a node with a full `layout` object (incl. a `format` locale map),
  `hidden: true`, and a `fieldLayouts` map survives serialize/deserialize unchanged.
- Resolver: `layout` / `hidden` / `fieldLayouts` reach `Resolved*` **verbatim** — `format` is still
  a locale map, not a string.
- Single-schema validator: **rejects** `hidden: true` + `required: true`; **accepts** `hidden: true`
  alone, an unknown `layout.id`, and an unknown `fieldLayouts` key; **rejects** a `layout` that is
  not an object / has a non-string `id`, and a `fieldLayouts` whose value is not an object.
- `#ref` expansion: a `#ref` node's `layout` / `hidden` / `fieldLayouts` survive; the referenced
  definition type is present in the derived `definitions` with its fields' `layout` / `hidden`
  intact.
