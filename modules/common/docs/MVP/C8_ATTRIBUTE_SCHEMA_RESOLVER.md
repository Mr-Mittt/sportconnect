# C8 · Attribute framework — locale resolver

**Status:** `TODO`
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (§3, §5, §6, §8). Read it first.
**Depends on:** **C5** (the raw tree + the flat `resolved/` tree).
**Filed:** 2026-09-08, from the C5 split.

## What C8 ships

The `resolve/` package of `com.sportconnect.common.attributes` — turns a raw, multi-locale
`AttributeSchema` (every `label` a `Map<String,String>`) into a **flat** `ResolvedAttributeSchema`
(every `label` one `String`) for one caller's `Locale`.

Ports `SportAttributeSchemaLabelResolver` (156 ln):

- **Per-type `NodeResolver`** implementations + a registry — each maps its raw `AttributeNode`
  subtype to a `ResolvedAttributeNode` (flat: `type` + that subtype's fields + nulls elsewhere).
  Dispatch is per-type (open/closed); the output is deliberately the one flat `ResolvedAttributeNode`
  (plan doc D6).
- A `FieldResolver` equivalent for `AttributeField` subtypes.
- **`AttributeSchemaResolver`** — the entry point. Recurses the nested group tree (arbitrary
  depth), resolves `definitions` + `groups`, drops `defaultLocale` from the output (it was only
  ever a resolution input).
- **Label fallback order:** exact language tag → language-only tag → document `defaultLocale`.
  C6 guarantees every label carries a `defaultLocale` entry, so the last step never misses.

## Invariants (plan doc §5)

- Fallback order exactly as above.
- A `null` schema resolves to `null`.
- The resolved tree carries no `defaultLocale`.
- `cardinality` / `prefillable` / `prefillKey` are **not** set by this resolver — those are stamped
  by C9's `DerivedSchemaResolver` after expansion. C8 resolves a plain single schema only.
- Exact output of every ported `SportAttributeSchemaLabelResolverSpec` case (label strings, tree
  shape).

## Spec parity

Port **`SportAttributeSchemaLabelResolverSpec`** (196) + add per-`NodeResolver` specs.

## Out of scope

Schema validation (C6). Value filtering (C7). `#ref` expansion + the
`prefillable`/`prefillKey`/`cardinality` stamping (C9).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
