# C8 · Attribute framework — locale resolver

**Status:** `DONE` (2026-09-08)
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

## Implementation summary (2026-09-08)

**Approved design (Phase 3), restated:** verbatim port of `SportAttributeSchemaLabelResolver` (156
ln) into `resolve/AttributeSchemaResolver` — one `public static resolve(AttributeSchema, Locale)`,
private recursive `resolveGroup` + `resolveNode`/`resolveField` as exhaustive `switch`es fanning
the sealed subtypes into the flat `ResolvedAttribute*` DTOs. Behaviour parity (D11).

**What was built** — `resolve/AttributeSchemaResolver` (`public final`, private ctor, Spring-free
per D2):
- `resolve` — `null` → `null`; computes `exact`/`language`/`defaultLocale`, maps `definitions` +
  `groups`; output carries no `defaultLocale`.
- `resolveLabel(map, exact, language, defaultLocale)` — `null` map → `null`; else exact tag →
  language-only → `defaultLocale`.
- `resolveNode` — `switch` over `AttributeNode`: `type` + per-kind (`isAvailable`, `defaultValue`,
  `min`/`max`, resolved `options`, `definitionRef`/`searchScope`) → flat `ResolvedAttributeNode`.
  `RefAttribute` → key + label only, `type` null, never throws (can't reach a single-schema
  resolve; C9 resolves post-expansion). `cardinality`/`prefillable`/`prefillKey` left null — C9
  stamps them.
- `resolveField` — `switch` over `AttributeField` → flat `ResolvedAttributeField` (`type` +
  `isRequired` + per-kind).

**Key points:** no divergence from the plan. Same `switch`-over-sealed-set pattern as C6/C7. Old
resolver was `@Component`; C8's is `public static` (D2) — A23 wraps if it wants a bean, C9 calls it
statically.

**Verification:**
- `./gradlew :modules:common:test` — green, **252** (237 after C7 + `AttributeSchemaResolverSpec`
  15: ported all ~13 `SportAttributeSchemaLabelResolverSpec` cases + a `RefAttribute`→key/label
  case + a null-label-map case).
- `./gradlew :server:test` — 179 run, 9 failed: all `AmqpIOException` in
  `SessionEventsConsumerIntegrationTest` / `UserFriendEventsConsumerIntegrationTest`. **Both pass
  in isolation** → parallel-load RabbitMQ flake, same signature as the C5/C7 runs. C8 adds no
  Spring bean/entity/wiring.
- N+1: N/A — pure library. `:server:bootRun` not run — no beans/wiring/entities.

**Not done (by design):** base×derived pair + `#ref` resolution + `cardinality`/`prefill` stamping
(C9); any `sport-*`/`session-*`/client change (A23).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
