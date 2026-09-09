# C10 · `#ref` value arity follows `cardinality`, not the base type

**Status:** `DONE` (2026-09-09)
**Type:** Bug fix (design gap in C9/D9)
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` §D9.
**Depends on:** **C9** (`pair/DerivedSchemaExpander` + `value/AttributeValueFilter`).
**Filed:** 2026-09-09, found while live-testing `CLIENT-SESSION-17`'s `#ref` create flow against a
real backend.

## The bug

A `#ref` node with `cardinality: SINGLE` pointing at a `LIST` / `DEFINITION_LIST` base attribute
still validates its **value** as a list, so the client's single value is silently dropped.

Concrete case hit live: the seeded Badminton *session* schema's `#ref` `gear/shuttlecocks`
(`cardinality: SINGLE`, base `gear/shuttlecocks` is a `DEFINITION_LIST`). `CLIENT-SESSION-17` sends
`attributes["gear/shuttlecocks"] = { "value": "Ba Sao ProX" }` (one record, per `SINGLE`).
`POST /api/sessions` → 201, but `GET` returns `attributes: {}`. Isolated: a bare record → dropped;
`[{ "value": "Ba Sao ProX" }]` → kept.

## Root cause

`DerivedSchemaExpander` inlines a `#ref` as a **verbatim copy of the base target's concrete
subtype** (`reKey`) and never applies the `#ref`'s own `cardinality`. C9/D9 deliberately kept
`cardinality` **off the expanded node** — it is carried only in
`ExpandedSchema.refExpansionsByPath`, for `DerivedSchemaResolver` to stamp onto the member-facing
schema. So the value-validation schema (`getSessionAttributeSchemaRaw` → `AttributeValueFilter`)
keeps the base's arity: a `SINGLE` `#ref` off a `DEFINITION_LIST` base expands to a
`DefinitionListAttribute`, and `AttributeValueFilter.filterValue` then requires
`raw instanceof List`.

D9 says "all four `cardinality` × base-type combinations are legal" but never pinned the **stored
value shape** per combination — this ticket does.

## The fix

In `DerivedSchemaExpander`, the emitted node's **arity follows `cardinality`**; the base target
still supplies the element type (`options` / `definitionRef` / bounds / `searchScope`):

| base target type | `SINGLE` → emit | `LIST` → emit |
|---|---|---|
| `ENUM` | `EnumAttribute` (base options) | `ListAttribute` (base options) |
| `LIST` | `EnumAttribute` (base options — pick one) | `ListAttribute` (base options) |
| `DEFINITION` | `DefinitionAttribute` | `DefinitionListAttribute` |
| `DEFINITION_LIST` | `DefinitionAttribute` (one record) | `DefinitionListAttribute` |
| `STRING` / `NUMBER` / `BOOLEAN` | that scalar as-is (single by nature) | that scalar as-is |

`STRING`/`NUMBER`/`BOOLEAN` + `LIST`: there is no "list of free scalars" node type
(`ListAttribute` validates against `options`), and the combination is not producible by a real
client (a scalar profile attribute holds one value). Kept as the scalar; a validator rule
rejecting `LIST` off a plain-scalar base is a **separate follow-up if it's ever wanted**, not this
ticket.

`AttributeValueFilter` is **not touched** — it already does the right thing once the node has the
right subtype. `DerivedSchemaResolver` is unchanged (still reads `cardinality` from the side map);
the member-facing resolved node's `type` now agrees with the value shape for a `SINGLE` record
`#ref` (`DEFINITION_LIST` → `DEFINITION`).

`RefExpansion` still carries `cardinality` for the resolver — unchanged. Base `defaultValue` still
not carried (D9). Dangling-`#ref` lenient drop unchanged.

## Consumer census

- `SportServiceImpl.getSessionAttributeSchemaRaw` (session create/update filter path) — benefits,
  no signature change.
- `SportServiceImpl.getSessionAttributeSchema` (member-facing, resolved) — a `SINGLE` record
  `#ref`'s resolved `type` flips `DEFINITION_LIST` → `DEFINITION`. `CLIENT-SESSION-17` keys `#ref`
  rendering off `type` **+** `cardinality` (`effectiveRenderType`, `deriveRefChoices`) and already
  submits a bare value for `SINGLE`, so it stays consistent — **re-verify live after merge**.
- `SessionServiceImpl.resolveAttributes` — consumes the raw schema; benefits, no change.
- No DB / DTO / REST-shape change. `AttributeSchema` JSON on the wire is unchanged (`#ref` nodes
  are only in the *stored* derived schema, which this doesn't touch — only its **expansion**).

## Behaviour change (D11 note)

D11 said "no filter outcome changes except D9's `#ref` contract" — this **is** part of getting the
D9 `#ref` contract right, so it's in scope. A pre-existing dev session that stored an *array* under
a now-`SINGLE` `#ref` path loses that value on its next attribute write (`retainDefined` re-filter:
array under a `DefinitionAttribute` → dropped). Pre-launch, dev-only data.

## Tests

- **`DerivedSchemaResolverSpec` / a new `DerivedSchemaExpanderSpec`** — all 4 `cardinality` ×
  {`ENUM`, `LIST`, `DEFINITION`, `DEFINITION_LIST`} combos: assert the emitted node's subtype +
  that its `options`/`definitionRef` come from the base; `SINGLE` scalar-base unchanged.
- **`AttributeValueFilter` via the expanded schema** — a `SINGLE` `#ref` off a `DEFINITION_LIST`
  base now **keeps** a bare record and **drops** an array; the `LIST` case is the mirror.
- **session-impl IT** — `POST /api/sessions` with a `SINGLE` `#ref` value round-trips through
  `GET` (the exact case this ticket exists for); `LIST` `#ref` still round-trips as an array.

## Green bar

`:modules:common:test`, `:modules:sport:sport-impl:test`, `:modules:session:session-impl:test`,
full `:server:test`.

---

## Implementation (2026-09-09)

### As built — matches the plan

**One production change:** `DerivedSchemaExpander.reKey` → `expandRefTarget(target, key, label,
cardinality)`. The emitted node's arity now follows `cardinality`; the base target still supplies
`options` / `definitionRef` / `searchScope` / bounds:

| base target | `SINGLE` | `LIST` |
|---|---|---|
| `ENUM` / `LIST` | `EnumAttribute` (base options) | `ListAttribute` (base options) |
| `DEFINITION` / `DEFINITION_LIST` | `DefinitionAttribute` | `DefinitionListAttribute` |
| `STRING` / `NUMBER` / `BOOLEAN` | that scalar (unchanged) | that scalar (unchanged) |

A `null` `cardinality` (not producible past the pair validator) reads as `SINGLE`. `AttributeValueFilter`,
`DerivedSchemaResolver`, `RefExpansion`, the definition-closure merge, and the dangling-`#ref`
lenient drop are all untouched. Class + method Javadoc updated.

### Tests

- **`DerivedSchemaResolverSpec`** — the pre-existing "a `#ref` inherits type … from the base"
  case was the *old* contract; renamed and its assertion flipped to `type == LIST` for a `LIST`
  `#ref` off an `ENUM` base (C10). New: an 8-row `@Unroll` over `{SINGLE,LIST} × {ENUM, LIST,
  DEFINITION, DEFINITION_LIST}` asserting both the expanded node's concrete subtype *and* the
  resolved node's `type` + `cardinality` + `prefillable`; a case that the expanded `#ref` keeps
  the base's `options` / `definitionRef` / `searchScope`; a 4-row `@Unroll` running
  `AttributeValueFilter.filter` over the expanded schema — a `SINGLE` `#ref` off a
  `DEFINITION_LIST` base keeps a bare record and drops an array, `LIST` the mirror.
- **`SessionAttributesIntegrationTest`** (`server`) — 2 new: `PUT /api/sessions/{id}` with a
  `SINGLE` `#ref` (base `DEFINITION_LIST`) keeps `{ "value": "…" }` through the real
  expander → filter → JSONB round trip and back on `SessionResponse`; the array shape is dropped.
  This is the exact case CLIENT-SESSION-17 hit live.

### Verification

- `:modules:common:test` — **302 pass** (0 failures; was 293 at C9).
- `:modules:sport:sport-impl:test`, `:modules:session:session-impl:test` — green, no existing
  test changed behaviour.
- `:server:test` — **181 pass, 0 failures** (was 179 at C9; +2 = the new
  `SessionAttributesIntegrationTest` cases). No RabbitMQ flakes this run.
- **Live re-verify** against the real backend after merge: `CLIENT-SESSION-17`'s `#ref` `SINGLE`
  create flow (`gear/shuttlecocks`) now persists — see that ticket's follow-up note. No client
  change was needed: it already submits a bare value for `cardinality: SINGLE`, and the
  member-facing resolved `type` now agrees (`DEFINITION_LIST` → `DEFINITION`).

### Client impact

`CLIENT-SESSION-17` (still on its own branch, not yet merged): a `SINGLE` record `#ref`'s
resolved `type` flips `DEFINITION_LIST` → `DEFINITION`. The client keys `#ref` rendering off
`type` **+** `cardinality` (`effectiveRenderType`, `deriveRefChoices`) and already sends a bare
value for `SINGLE`, so no code change — just re-run its live check once both land.
