# C9 · Attribute framework — base×derived pair + `#ref` semantics

**Status:** `TODO`
**Type:** Refactor / architecture + a real behaviour change (`#ref`)
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (D9, §5, §6, §8). Read it first.
**Depends on:** **C6, C7, C8** (reuses the single-schema validator, `AttributePaths` /
`availableByPath`, and the resolver).
**Filed:** 2026-09-08, from the C5 split. This ticket carries the `#ref` semantics change
(plan doc D9) — it is **not** a pure move.

## What C9 ships

The `pair/` package of `com.sportconnect.common.attributes` — validate / expand / resolve a
`(base, derived)` schema pair, where a `derived` schema's tree may contain `RefAttribute` nodes
pointing at `/`-paths in the `base` schema. Ports `SessionAttributeSchema{Validator,Expander,
Resolver}` + `SessionAttributeNodes`.

### 1. `DerivedSchemaValidator`

Runs C6's single-schema rules over the derived schema's **own** (non-`RefAttribute`) nodes, plus:

- **`RefAttribute` rules (NEW — plan doc D9):**
  - `key` **required** — explicit, its own sibling-unique key (replaces "last `/`-segment of the
    ref path"). Shares the sibling namespace with sub-groups + own nodes.
  - `cardinality` **required** — `SINGLE` or `LIST`. Not in the enum → reject.
  - `ref` **required**, non-blank, globally unique across the derived schema, and must resolve to a
    **live + available** node in the base schema (`AttributePaths.availableByPath`). Dangling →
    strict reject.
  - `label` optional (an override; need not cover `defaultLocale`). Every other field forbidden.
  - All four `cardinality` × base-node-type combinations are legal.
- Derived-local `definitions` validated by C6's 3-pass rule; a derived-local definition name must
  not collide with a definition name a `RefAttribute` pulls in from the **base** registry.

### 2. `DerivedSchemaExpander`

Inlines every `RefAttribute` into a plain `AttributeSchema` (the shape C7's filter consumes):

- Look the `ref` path up in the base schema's live+available view. **Lenient:** drop the node if
  it no longer resolves (the base schema may have retired the attribute since the derived schema
  was stored). This is the one place `#ref` handling is lenient — validation (1) is strict.
- Emit a node **inheriting** the base target's `type` / `options` / `definitionRef` / bounds,
  keyed by the `RefAttribute`'s explicit `key`, carrying its `cardinality`, in the same group.
- Pull the base definition the target references — and its whole reachable closure — into the
  merged `definitions` registry. A name already present (derived-local, or an earlier pull) wins.
- Return `prefillKeyByPath`: expanded-node full path → source base path.

### 3. `DerivedSchemaResolver`

`expand` → C8's `AttributeSchemaResolver` → walk the resolved tree stamping, on every node the
`prefillKeyByPath` names: `prefillable = true`, `prefillKey = <base path>`, **`cardinality`**
(from the `RefAttribute`). `prefillKey` now means "the base path the client reads the **choice
list** from" (was: a one-shot default). Own nodes and profile-schema resolutions carry none of
these three.

## Invariants (plan doc §5)

- Strict on validate, lenient-drop on expand — for dangling `#ref` and for stale merged
  definitions.
- Everything C6/C7/C8 guarantee for the own-node parts.
- `#ref` JSON key stays `#ref` on the wire.

## Spec parity

Port **`SessionAttributeSchemaValidatorSpec`** (292) + **`SessionAttributeSchemaResolverSpec`**
(231). **Add** (plan doc §8): `RefAttribute` missing `key` → reject; missing `cardinality` →
reject; `cardinality` not in enum → reject; each of the 4 `cardinality` × base-type combos →
accept + expand correctly; resolved node carries `cardinality`; `prefillKey` names the base path.

Also: before `A23` deletes `session-impl`'s `SessionAttributeFilterSpec` (243), confirm its cases
are all covered by C7's `AttributeValueFilter` specs.

## Out of scope

The sport/session repoint + clone deletion + seeded-schema rewrite (**A23**). Client rendering
(**CLIENT-SESSION-17**).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
