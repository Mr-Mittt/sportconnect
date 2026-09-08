# C6 · Attribute framework — single-schema validator

**Status:** `DONE` (2026-09-08)
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

## Scope refinement (2026-09-08, `/workon` pickup)

The `defaultValue`-validity check needs `AttributeValues.isValid` (primitive type / option / bounds).
The plan originally put all of `AttributeValues` in C7. **Decision:** C6 builds the **primitive
core** — `value/AttributeValues.isValid` + `withinBounds` + option helpers (~50 ln) — since it is
genuinely shared ("is this declared default valid" here / "is this submitted value valid" in C7).
C7 then adds `isValidRecord` / `filterScalarOrRecord` / `AttributeValueFilter` / `AttributePaths`
on top. Parity-matrix shift: C6 also ports the `isValid`/primitives slice of
`SportAttributeValuesSpec`; C7 ports the record/dispatcher slice. Plan doc §8 updated.

## Invariants (plan doc §5 — do not change)

- Exact accept/reject set of documents, and message text where a ported spec asserts on it.
- Strict all-or-nothing: first violation throws `BadRequestException`.
- `defaultValue` checked against its own node exactly as a user value would be — via the
  `value/AttributeValues.isValid` primitive core built here (see the scope refinement above).
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

## Implementation summary (2026-09-08)

**Approved design (Phase 3), restated:** port `SportAttributeSchemaValidator` + the node/field/
definition halves of `SchemaChecks` into `com.sportconnect.common.attributes.validate` as an
exhaustive `switch` over the sealed `AttributeNode`/`AttributeField` sets + shared leaf checks +
the 3-pass `definitions` registry; build the primitive `AttributeValues.isValid` core in
`value/`; behaviour parity with the sport validator except that the ~15 "field on the wrong
subtype" cases are now parse-time (C5 D8), asserted as such in the ported spec.

**What was built:**

| File | Role |
|---|---|
| `value/AttributeValues` | `isValid` (primitive type/option/bounds; throws on record types), `withinBounds`, `optionValues`, `MAX_LIST_ITEMS = 10`. Lifted verbatim from `SportAttributeValues`. **Public** — C7 + A23 consume it. |
| `validate/LeafChecks` (pkg-private) | `KEY_PATTERN` / `DEFINITION_NAME_PATTERN` / `LOCALE_PATTERN` / `MAX_SCHEMA_BYTES`; `validateDefaultLocale` / `validateKey` / `validateLabel` / `validateOptionsList` / `validateSize` (via `AttributeJson.mapper()`, no injected `ObjectMapper` — D2) / `nullSafe`. |
| `validate/NodeValidators` (pkg-private) | `validateOwnNode` — exhaustive `switch`; per-kind label + options + bounds + `definitionRef` resolution + `defaultValue` validity; **rejects `RefAttribute`** ("#ref only valid in a derived schema"). |
| `validate/FieldValidators` (pkg-private) | field counterpart — label + ENUM/LIST options + NUMBER bounds + DEFINITION ref. No `defaultValue`, no `DEFINITION_LIST`/ref subtype. |
| `validate/DefinitionRegistryValidator` (pkg-private) | the verbatim 3-pass: names → fields → inner-position-primitive-only (the whole cycle rule, no traversal). |
| `validate/AttributeSchemaValidator` | **public static** `validate(AttributeSchema)` entry — `defaultLocale` → registry → recursive group walk (v3 sibling-key namespace) → size. First violation throws `common.exception.BadRequestException`, same message text the ported spec asserts. |

**Key decisions / divergences:**
- **`switch` over the sealed set, not a `Map` registry** — was the leaning in the approved Phase 3
  plan; adopted. Same compile-time open/closed guarantee, less boilerplate. Plan D5 / ADR D5
  updated to record it.
- **C5 `defaultValue` typing reverted to `Object`** on all five value-bearing node subtypes — see
  the C5 Delta (2026-09-08). Jackson scalar coercion on a typed field diverged from
  `AttributeValues.isValid`. Folded into this branch.
- **~15 spec cases moved to a "structurally rejected at parse" `@Unroll`** (raw JSON →
  `JsonProcessingException`): no-`type` node, `options`/`min`/`definitionRef`/`searchScope` on the
  wrong subtype, `DEFINITION_LIST`/no-type field, etc. End-to-end parity coverage preserved; only
  the rejecting layer moved. The validator no longer has those branches because the sealed model
  makes the misplacements unrepresentable.
- **`AttributeSchemaValidator` is `public static`, Spring-free** (D2). `A23` wraps it in a
  `@Component` façade if it wants injection.

**Verification:**
- `./gradlew :modules:common:test` — green, **148** (26 pre-C6 + `AttributeSchemaValidatorSpec` 90
  + `AttributeValuesSpec` 32).
- `./gradlew :server:test` — green, **179** (the 9 RabbitMQ parallel-load flakes seen during C5's
  run did not recur — confirming they were flakes, not regressions).
- N+1: N/A — pure library, no queries. `:server:bootRun` not run — no beans/wiring/entities added;
  the `@SpringBootTest` contexts in `:server:test` cover wiring.

**Not done (by design):** paths + value filter + `retainDefined` (C7); locale resolution (C8);
base×derived pair + `#ref` resolution (C9); any `sport-*`/`session-*`/client change (A23 /
CLIENT-SESSION-17).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
