# C7 · Attribute framework — paths + value filter

**Status:** `TODO`
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (§3, §5, §6, §8). Read it first.
**Depends on:** **C5** (DTO tree). C6 is *not* a hard dep, but `C6`'s `defaultValue` check calls
`AttributeValues.isValid` — if C6 lands first it inlines a stub that C7 replaces, or the two land
together. Decide at whichever is picked up second.
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

Port **`ProfileAttributeFilterSpec`** (608), **`SportAttributeValuesSpec`**, **`SchemaPathsSpec`**
(plan doc §8). `retainDefined` cases carry over minus the profile framing. Add per-`ValueChecker`
unit specs.

## Out of scope

Validation of the schema document itself (C6). Locale resolution (C8). `#ref` / pair (C9).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
