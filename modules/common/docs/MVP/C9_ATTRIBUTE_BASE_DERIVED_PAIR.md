# C9 · Attribute framework — base×derived pair + `#ref` semantics

**Status:** `DONE` (2026-09-08)
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

## Implementation summary (2026-09-08)

### Approved design

New package `com.sportconnect.common.attributes.pair` — three `public`, Spring-free, `static`
entry points (matching C6/C7/C8; the old `@Component` `Session*` classes did **not** carry over):

1. **`DerivedSchemaValidator.validate(base, derived)`** — strict, all-or-nothing. Reuses C6's
   own-node rules, the `definitions` 3-pass and the leaf checks verbatim over the derived schema's
   non-`#ref` nodes; adds the D9 `#ref` contract: explicit `key` (required, sibling-unique),
   `cardinality` (required), `#ref` (required, non-blank, globally unique, resolves to a
   live+available base node via `AttributePaths.availableByPath` — dangling → strict reject),
   `label` an optional need-not-cover-`defaultLocale` override. A derived-local definition name
   colliding with one a `#ref` pulls from the base registry → reject. Size cap on the raw derived
   doc.
2. **`DerivedSchemaExpander.expand(base, derived)`** → `ExpandedSchema(AttributeSchema schema,
   Map<String, RefExpansion> refExpansionsByPath)` where `RefExpansion(String basePath,
   Cardinality cardinality)`. Lenient — a `#ref` whose base target is gone/unavailable is
   **dropped**. A surviving `#ref` becomes a clone of the base target's own concrete subtype
   (`EnumAttribute`→`EnumAttribute`, …), re-keyed to the `#ref`'s explicit key, label = override
   if present else the target's. The base definition the target references — and its whole
   reachable closure — is pulled into the merged registry (derived-local name wins). Own
   `DEFINITION`/`DEFINITION_LIST` node whose `definitionRef` is absent from the merged registry →
   dropped; every other own node carried through unchanged.
3. **`DerivedSchemaResolver.resolve(base, derived, locale)`** — `expand` → C8's
   `AttributeSchemaResolver` → walk stamping `prefillable=true`, `prefillKey=<base path>` and
   `cardinality=<the #ref's>` onto every resolved node named in `refExpansionsByPath`. Own nodes
   carry none of the three.

Supporting changes in `common`:

- `LeafChecks`, `NodeValidators`, `DefinitionRegistryValidator` widened package-private → `public`
  (with a "framework-internal, sibling-package reuse only" Javadoc note) so `pair/` reuses the
  exact C6 checks rather than re-deriving them.
- `AttributeNodes.definitionRefOf(AttributeNode)` added — the `definitionRef` accessor the sealed
  interface omits, needed by both pair classes.

### Divergence from strict parity (approved)

The expanded `#ref` node does **not** carry the base target's `defaultValue`. Under D9 a `#ref` is
a choice-list source, not a prefilled default — carrying it would make the resolver stamp both a
`defaultValue` and a `prefillKey` onto the same node. No ported spec asserted on it; a new
`DerivedSchemaResolverSpec` case pins the drop.

### Built vs. designed

Built as designed. Two old `SessionAttributeSchemaValidatorSpec` cases — "a `#ref` carrying a
forbidden field" and "an own node with no type" — are now *structurally* impossible on the sealed
model, so they moved to a "rejected at parse" `@Unroll` (`AttributeJson.mapper()`), mirroring C6's
precedent; end-to-end coverage is unchanged.

### Spec parity + the A23 pre-check

- `DerivedSchemaValidatorSpec` — 16 ported `SessionAttributeSchemaValidatorSpec` cases + 3 new D9
  reject cases (`#ref` missing `key` / missing `cardinality` / blank `ref`) + a 4-row
  `cardinality × {single-valued base, list-valued base}` accept matrix + a 4-row parse-rejection
  `@Unroll`.
- `DerivedSchemaResolverSpec` — 11 ported `SessionAttributeSchemaResolverSpec` cases (exercising
  expander + resolver together, as the original did) + a 4-row matrix proving the resolved node
  carries the **ref's** cardinality independent of the base shape + the `defaultValue`-drop case.
- **Plan doc §8 pre-check for A23:** confirmed every `session-impl` `SessionAttributeFilterSpec`
  (243 ln) case is covered by C7's `AttributeValueFilterSpec`. The one assertion unique to it
  (surviving-entry iteration order follows the request, not the schema) was added to
  `AttributeValueFilterSpec` here. A23 can delete the clone spec with nothing lost — noted on the
  A23 ticket.

### Verification

- `:modules:common:test` — **293 pass** (+41: 40 new pair cases, 1 new `AttributeValueFilter`
  case), 0 failures.
- `:server:test` — **179 pass**, 0 failures (clean run; the C5–C8 RabbitMQ parallel-load flakes
  did not recur this time).
- No N+1 risk — the pair classes are pure in-memory tree walks with no repository/service calls.
- No IT added: C9 is a pure `common` library with no endpoint, no authorization boundary, no
  Spring wiring.

### Client-visible enum note

`Cardinality` (the enum this ticket makes load-bearing on `ResolvedAttributeNode`) landed in C5
and is already tracked for the client mirror by **`CLIENT-SESSION-17`** Part B. No new
client-branching value is introduced by C9.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
