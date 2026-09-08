# C7 · Attribute framework — paths + value filter

**Status:** `DONE` (2026-09-08)
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (§3, §5, §6, §8). Read it first.
**Depends on:** **C5** (DTO tree) + **C6** (which builds `value/AttributeValues.isValid` + the
primitive `withinBounds` / option helpers — see C6's scope-refinement note, 2026-09-08). C7 adds
the record + dispatcher + filter + paths layers on top.
**Filed:** 2026-09-08, from the C5 split.

## What C7 ships

The `path/` and `value/` packages of `com.sportconnect.common.attributes` — path flattening and
the **lenient, never-throwing** drop-invalid value machinery.

Ports `SchemaPaths` (96 ln), `SportAttributeValues` (208 ln) and `ProfileAttributeFilter` (222 ln):

- **`path/AttributePaths`** — flattens the nested group tree to `/`-separated paths (the one place
  the path string is built), with `definedByPath` (physical presence, ignores `isAvailable`) and
  `availableByPath` (the live subset). The `isAvailable` cascade runs **full depth, parent wins**;
  a live descendant does not resurrect a retired ancestor. `DefinedAttribute(node, live)` record.
- **Per-type `ValueChecker`** implementations + a registry — "is this submitted value valid for
  this node/field type" for the primitive types (`instanceof String` / `instanceof Number` +
  bounds / `instanceof Boolean` / option membership / list-of-options with `MAX_LIST_ITEMS = 10`).
- **`value/AttributeValues`** — `isValid` (primitives; throws on a record type reaching it — that
  is a programming error), `isValidRecord` (the v2 §6 required-field cascade: a missing/invalid
  *required* field kills the record, an optional one is dropped and the record survives;
  undeclared keys ignored), `filterScalarOrRecord` (the dispatcher).
- **`value/AttributeValueFilter`** — `filter` (keep only entries whose key is a live path and whose
  value validates — everything else silently dropped), **generalized `retainDefined`** (re-filter
  an already-stored map: prune keys with no physical definition, keep soft-deleted keys verbatim,
  re-validate live keys), and the `DEFINITION_LIST` element-iteration policy (per-element
  `DEFINITION` validation, drop bad elements, keep the rest; cap checked against *submitted*
  length before filtering).

**Naming:** `retainDefined` loses its "profile" framing (plan doc D10) — it is now a generic
"prune a stored value map against the current schema" operation. No profile-only variant remains.

## Invariants (plan doc §5)

- `AttributeValueFilter` **never throws** — size is the caller's concern, not this class's.
- `MAX_LIST_ITEMS = 10`, checked against submitted length before element filtering.
- Full-depth `isAvailable` cascade; `definedByPath` vs `availableByPath` semantics.
- Soft-deleted key in `retainDefined` → value kept **verbatim**, not re-validated.
- Exact keep/drop outcomes of every ported spec case.

## Spec parity

Port **`ProfileAttributeFilterSpec`** (608) — `retainDefined` cases carry over minus the profile
framing. `SportAttributeValuesSpec` / `SchemaPathsSpec` **do not exist** (confirmed 2026-09-08,
plan doc §8) — write fresh `AttributeValuesSpec` (record cascade / dispatcher; `isValid` primitive
core is C6's) and `AttributePathsSpec` (flatten + cascade). Add per-`ValueChecker` unit specs.

## Out of scope

Validation of the schema document itself (C6). Locale resolution (C8). `#ref` / pair (C9).

---

## Implementation summary (2026-09-08)

**Approved design (Phase 3), restated:** verbatim port of `SchemaPaths` → `path/AttributePaths`,
the record/dispatcher layers of `SportAttributeValues` → `value/AttributeValues` (`isValid`
primitive core already in C6), and `ProfileAttributeFilter` → `value/AttributeValueFilter`
(`filter` + generalized `retainDefined` + `DEFINITION_LIST` iteration). Behaviour parity (D11);
`retainDefined` loses its "profile" framing (D10).

**What was built:**

| File | Role |
|---|---|
| `AttributeNodes` (root pkg, **public**) | `isAvailable(AttributeNode)` / `typeOf(AttributeNode)` — the two facts the sealed `AttributeNode` interface doesn't expose (own subtypes have them, `RefAttribute` returns `null`). One `switch` instead of every walk repeating it. **Not in the Phase-3 sketch** — added because both `AttributePaths` and `AttributeValueFilter` need per-subtype `isAvailable`. |
| `path/AttributePaths` (**public**) | `definedByPath` / `availableByPath` / `record DefinedAttribute(AttributeNode, boolean live)` + `SEPARATOR`. Full-depth `isAvailable` cascade, parent wins. Verbatim `SchemaPaths`. |
| `value/AttributeValues` (+=) | `isValidRecord` (required-field cascade, recurses for `DEFINITION` fields), `filterScalarOrRecord` (dispatcher; `DEFINITION_LIST` throws — caller iterates), `asRecord`, pkg-private `FieldShape`/`shapeOf` (per-sealed-`AttributeField`-subtype `(type, allowed, min, max, definitionRef)`). |
| `value/AttributeValueFilter` (**public**) | `filter` (drop-invalid on a write), `retainDefined` (re-filter a stored map — undefined key pruned, soft-deleted key kept verbatim, live key re-validated), private `filterValue` (`switch` over the node subtype; `DEFINITION_LIST` handled inline — per-element `DEFINITION` validation, cap on *submitted* length, empty result list stored; `RefAttribute` → drop). **Never throws.** |

**Key points / divergences:**
- **`AttributeNodes` helper added** (see table) — the only structural addition beyond the Phase-3
  plan. Small, public, reused by C8/C9/A23.
- **`RefAttribute` in the filter** → dropped (returns `null`), never throws — it can't appear in a
  C6-validated single schema, and C9 filters only expanded ref-free schemas.
- Per-subtype `(type, min, max, definitionRef)` extraction is an exhaustive `switch` in each
  consumer, same pattern as C6.

**Verification:**
- `./gradlew :modules:common:test` — green, **237** (148 after C6 + `AttributePathsSpec` 11 +
  `AttributeValueFilterSpec` 60 + `AttributeValuesSpec` +18).
- `./gradlew :server:test` — 179 run, 9 failed: all `AmqpIOException` in
  `SessionEventsConsumerIntegrationTest` / `UserFriendEventsConsumerIntegrationTest` (RabbitMQ
  consumers). **Both classes pass in isolation** → parallel-load broker-contention flake, same
  signature as the C5 run. C7 adds no Spring bean/entity/wiring, so it cannot affect AMQP.
- N+1: N/A — pure library, no queries. `:server:bootRun` not run — no beans/wiring/entities.

**Not done (by design):** locale resolution (C8); base×derived pair + `#ref` resolution (C9); any
`sport-*`/`session-*`/client change (A23).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
