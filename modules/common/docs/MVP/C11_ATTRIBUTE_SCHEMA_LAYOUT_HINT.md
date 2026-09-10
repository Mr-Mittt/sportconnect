# C11 · `layout` presentation hint + `hidden` flag on attribute-schema nodes

**Status:** `DONE` (2026-09-10)
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

---

## Implementation (2026-09-10)

### Approved design (Phase 3, as built)

Three server-opaque fields on the neutral `com.sportconnect.common.attributes` model — the server
**validates the shape on an admin write and carries everything else raw** (no resolution, no
interpretation).

**New value types** (`common/attributes/`):

- **`AttributeLayout`** `{ String id, String icon, Map<String,String> format }` —
  `@JsonInclude(NON_NULL)` + `@JsonIgnoreProperties(ignoreUnknown = true)` (the framework mapper
  has `FAIL_ON_UNKNOWN_PROPERTIES` on globally; the class-level annotation lets a newer client
  send an unmodelled prop — it is dropped, not carried). Shared by the raw model **and** the
  `Resolved*` twins: `format` stays a raw `locale → pattern` map on both sides, the one
  `Resolved*` field not collapsed to a single locale.
- **`AttributeFieldLayout`** `{ String id, String icon, Map<String,String> format, Boolean hidden }`
  — the `fieldLayouts` map-value bundle (a partial layout override + `hidden`).

**Model fields** — `layout` (`AttributeLayout`) + `hidden` (`Boolean`) as **siblings** (never
nested in `layout`, matching the shipped client contract) on: `AttributeNode` sealed iface + all 8
subtypes; `AttributeField` sealed iface + all 6 subtypes; `AttributeGroup`. `fieldLayouts`
(`Map<String,AttributeFieldLayout>`) on `RefAttribute` **only**. Resolved twins:
`ResolvedAttributeNode` (all three), `ResolvedAttributeField` / `ResolvedAttributeGroup`
(`layout` + `hidden`).

**Carry-through:**

- **JSON** — no code; Lombok `@Data`/`@Builder` + `@JsonInclude(NON_NULL)` + the two
  `@JsonIgnoreProperties` classes. `AttributeJson` mapper untouched.
- **`AttributeSchemaResolver`** — `resolveNode` / `resolveField` / `resolveGroup` copy
  `layout` / `hidden` verbatim in the common pre-`switch` chain; the `RefAttribute` arm also copies
  `fieldLayouts`. `format` is **not** locale-resolved.
- **`#ref` (`DerivedSchemaExpander` + `DerivedSchemaResolver`)** — `RefExpansion` grew from
  `(basePath, cardinality)` to also carry `(layout, hidden, fieldLayouts)`; `markRefs` stamps all
  three onto the resolved `#ref`-derived node alongside `prefillable`/`prefillKey`/`cardinality`.
  **`expandRefTarget` is untouched** — the inlined concrete node carries none of the C11 fields
  (only the `Resolved*` tree does; the raw expanded schema feeds only `AttributeValueFilter`, which
  ignores presentation). This was chosen over having `expandRefTarget` copy them so C10's
  carefully-tested arity mapping stays byte-identical and one mechanism covers all three fields.

**Validation** — the only gate, via a shared `LeafChecks.validateLayout(layout, ctx)` (reject a
`layout` present with a null/blank `id`; a non-object `layout` is already impossible post-parse):

- `NodeValidators.validateOwnNode` (own nodes), `FieldValidators.validate` (fields),
  `AttributeSchemaValidator.validateGroup` **and** `DerivedSchemaValidator.validateGroup` (groups).
- `FieldValidators.validate` also rejects a definition field that is `hidden == true` **and**
  `isRequired == true`.
- **Decision (Phase 1):** the field-level checks live in shared code (`DefinitionRegistryValidator`
  → `FieldValidators`), so they run for **both** the profile (single-schema) and session (derived)
  validators. "Derived validator stays lenient" is honoured where it actually matters — a `#ref`
  node's own `layout` / `fieldLayouts` are carried **unvalidated** (`validateRefNode` unchanged).
- Nodes/groups have no "required" concept, so the `hidden` XOR required rule is field-only.

**`sport-api` / `sport-impl`** — no change. `SportService` returns the common `AttributeSchema` /
`ResolvedAttributeSchema` directly, so all 6 schema endpoints expose the new fields for free. Only
the two admin `PUT` Swagger descriptions in `SportController` were updated (doc text, not a
contract change).

**Seeds** — no DB migration (Phase 1 decision #3). Session schema stays deliberately unseeded
(V062); the Badminton profile seed (V061) untouched. Demo examples added to the `common` test
fixtures `modules/common/src/test/resources/attributes/{comprehensive,derived}-schema.json` and
documented in `documentation/md/ATTRIBUTE_LAYOUT_DESIGN.md` § "C11 — backend carry contract".

### Open decision — resolved

**`#ref` → base `layout` inheritance: client-side (option a).** The server carries nothing extra;
a `#ref` node with no own `layout` falls back to the referenced base attribute's `layout` in the
client (`SPORT-16`), which already loads the profile schema at session-create time.

### Delta vs. the SPORT-13 epic spec

C11's `Resolved*` twin keeps `layout.format` as a **raw `Map<String,String>` locale map**, not the
single resolved string `SPORT-13` shipped in `ResolvedAttributeLayout.format`. The client-side
retrofit + locale resolution is client **`SPORT-16`** (already filed, `TODO`).

### Tests

- **`AttributeSchemaJsonSpec`** — `layout`(+`format` map)/`hidden` on node/field/group + a
  `RefAttribute.fieldLayouts` map round-trip lossless (added to the comprehensive + derived
  fixtures and asserted); a new case proving an unknown property inside a `layout` object is
  dropped, never a parse failure.
- **`AttributeSchemaResolverSpec`** — `layout`/`hidden` reach the resolved node/field/group
  verbatim, `format` stays a `Map`; a `#ref` node's own `layout`/`hidden`/`fieldLayouts` reach the
  resolved node on a single-schema resolve.
- **`AttributeSchemaValidatorSpec`** — accepts a node/field/group carrying `layout`+`hidden` with
  arbitrary values; rejects a definition field that is `hidden`+`isRequired` (`@Unroll` STRING /
  NUMBER / ENUM); accepts `hidden` alone; rejects a `layout` with null/blank `id` on a
  node / field / group.
- **`DerivedSchemaValidatorSpec`** — a `#ref` carrying `layout`/`hidden`/`fieldLayouts` (incl. an
  unknown key) is accepted; a `#ref`'s own blank-`id` `layout` is **not** rejected; a
  derived-local definition field that is `hidden`+`isRequired` **is** rejected; an own node's
  blank-`id` `layout` in a derived schema still fails.
- **`DerivedSchemaResolverSpec`** — a `#ref` node's own `layout`/`hidden`/`fieldLayouts` land on
  the resolved node (the inlined concrete node has none); own nodes keep theirs via the normal
  path; a pulled-in base definition's fields keep their own `layout`/`hidden`.
- **`AttributeValueFilterSpec`** — regression guard: `layout`/`hidden` on a schema node don't
  affect value filtering; a `hidden` field's value still round-trips.
- **`:server:test` IT** — `SportAttributeSchemaIntegrationTest`: real admin `PUT` → member `GET`
  round-trips `layout` (incl. `format` locale map) / `hidden` on node + group + definition field;
  real `PUT` of a `hidden`+`isRequired` field → **400**, nothing written.
  `SessionAttributeSchemaIntegrationTest`: real `PUT` → member `GET` stamps a `#ref`'s own
  `layout`/`hidden`/`fieldLayouts` onto the resolved (expanded) node; a `hidden`+`isRequired`
  session-schema definition field → **400**.

### Verification

- `:modules:common:test` — **320 pass**, 0 failures (was 302 at C10; +18).
- `:server:test` targeted (`--tests SportAttributeSchemaIntegrationTest SessionAttributeSchemaIntegrationTest`)
  — **32 pass**, 0 failures (`SportAttributeSchemaIntegrationTest` 21, +2 new; `SessionAttributeSchemaIntegrationTest`
  11, +2 new). The full `:server:test` was started but ran >40 min on this Windows/Testcontainers
  box without finishing and was cut to the targeted run; the full suite runs on CI/PR. No other
  module's tests were touched (`sport-impl`/`session-impl` call the same unchanged entry points).
- `./gradlew compileJava` — clean across all modules.
- No N+1 risk — pure DTO field copies. Class + method Javadoc updated across the touched files.
