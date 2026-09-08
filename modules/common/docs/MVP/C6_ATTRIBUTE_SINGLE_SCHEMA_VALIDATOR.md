# C6 · Attribute framework — single-schema validator

**Status:** `TODO`
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (§3 rename map, §5 invariants,
§6 breakdown, §8 spec parity). Read it first.
**Depends on:** **C5** (the DTO tree + Jackson polymorphism must exist).
**Filed:** 2026-09-08, from the C5 split.

## What C6 ships

The `validate/` package of `com.sportconnect.common.attributes` — the strict, all-or-nothing
admin-`PUT`-time validator for **a single schema** (no `#ref` resolution — that is C9).

Ports `SportAttributeSchemaValidator` + the node/field/definition halves of `SchemaChecks`
(sport-impl, 377 lines) into:

- **Per-type `NodeValidator`** implementations (one per `AttributeNode` subtype) + a
  `Map<AttributeType, NodeValidator>` registry. Each validates only its own subtype's fields.
  A future type = one new `NodeValidator` + one registry line.
- **Per-type `FieldValidator`** implementations for `AttributeField` subtypes (same shape).
- Shared leaf checks — `KeyChecks` (`^[a-z][a-zA-Z0-9_]*$`), `LabelChecks` (locale coverage +
  `LOCALE_PATTERN`, every label carries `defaultLocale`), `SizeCheck` (`MAX_SCHEMA_BYTES = 16384`
  via the shared `ObjectMapper`), `DefaultLocaleCheck`.
- **`AttributeSchemaValidator`** — the entry point. Walks groups (sibling-key namespace: sub-group
  keys + attribute keys share one namespace), validates the `definitions` registry with the exact
  **3-pass rule** (collect names → validate each definition's fields incl. `definitionRef`
  resolution → inner-position definitions primitive-only, which *is* the whole cycle/depth rule —
  no traversal), validates every node via the registry.
- **`RefAttribute` is rejected** in single-schema mode ("`#ref` is only valid in a derived
  schema") — C9 handles it in pair mode.

## Invariants (plan doc §5 — do not change)

- Exact accept/reject set of documents, and message text where a ported spec asserts on it.
- Strict all-or-nothing: first violation throws `BadRequestException`.
- `defaultValue` checked against its own node exactly as a user value would be (delegates to C7's
  `AttributeValues.isValid` — **C6 depends on C7 for this one call**, or C6 inlines a minimal
  primitive check and C7 replaces it; decide in Design. Cleanest: C6 and C7 land together if the
  coupling bites).
- `defaultValue` forbidden on `DEFINITION`/`DEFINITION_LIST`; `definitionRef`/`searchScope` only
  on those; `min`/`max` only on `NUMBER` with `min <= max`; `options` non-empty only on
  `ENUM`/`LIST`; a `DEFINITION` field may not be `DEFINITION_LIST`.

## Spec parity

Port **`SportAttributeSchemaValidatorSpec`** (957 lines). Split into per-`NodeValidator` /
per-`FieldValidator` specs + an `AttributeSchemaValidatorSpec` covering the group walk, the
sibling-key namespace, the 3-pass `definitions` rule and the cycle cases. Every existing case
preserved (plan doc §8). Add: `RefAttribute` in a single schema → reject.

## Out of scope

`#ref` resolution and the base×derived pair (C9). Value filtering / paths (C7). Locale
resolution (C8).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
