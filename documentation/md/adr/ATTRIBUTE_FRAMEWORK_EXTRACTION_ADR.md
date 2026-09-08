# ADR: Extract the attribute-schema framework into `modules/common`

**Status:** Accepted (2026-09-08)
**Context tickets:** common `C5`–`C9`, sport `A23`, client `CLIENT-SESSION-17`
**Execution plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` (rename map, package
layout, spec-parity matrix, consumer checklist). This ADR records the *decisions*; the plan tracks
the *work*.
**Related ADRs:** `RESOURCE_ACCESS_GATE_ADR.md` (C2 — the "`common` = shared shape" principle this
ADR partially overrides).

---

## Context

The per-sport attribute schema (sport `A9`/`A12`/`A13`/`A16`/`A17`/`A19`) has become a platform
primitive: a typed, localized, admin-managed schema tree; lenient drop-invalid value validation;
locale resolution for display. Sport profiles use it (`A9`); sessions use it (`SESSION-23`);
groups, facilities and equipment are expected to.

Today the DTOs live in `sport-api` and the logic lives package-private in `sport-impl`
(`SchemaChecks`, `SchemaPaths`, `SportAttributeValues`, `ProfileAttributeFilter`, the two
schema validators, the three session-schema classes). A second consumer already had to pay for
this: `SESSION-23` **cloned** ~400 lines of value logic into `session-impl` as a deliberate,
deletable bridge, because there was no shared home and `session-impl` may not import
`sport-impl`.

A third consumer would either clone again (drift) or force `sport-api` to expose surface it does
not own. The framework needs a domain-neutral home.

---

## Decision 1 — Home: `modules/common`, package `com.sportconnect.common.attributes`

**Chosen:** a new `com.sportconnect.common.attributes` package in `modules/common`, holding the
neutral DTO tree **and** the pure validation / resolution / filter logic.

**Rejected — a new `modules/attributes` (`attributes-api` + `attributes-impl`):** keeps `common`
pure, but costs a new pair of modules in the build graph and a new `-api`/`-impl` split for a body
of code that is entirely pure functions with no Spring, JPA, transport or domain dependencies —
the split would carry no weight.

**Rejected — keep it in `sport-*`, make the classes public:** smallest diff, but bakes "attributes
are a sport concept" into every future consumer's import statements. `SESSION-23` rejected this at
pickup for the same reason.

### The principle this overrides

`CLAUDE.md` and the `C2` ResourceGate ADR state that `modules/common` carries shared **shape**
(DTOs, interfaces, the `ResourceGate<T>` two-method contract), not shared **logic**. The attribute
framework *is* logic — type validation, the required-field cascade, numeric bounds, path
flattening, the `isAvailable` cascade, locale fallback.

**We override that principle here, deliberately and narrowly**, because the attribute framework has
the properties that made `common` the right home for `ApiResponse`, the exception hierarchy,
`ResourceGate` and the transactional outbox:

- **Pure functions, zero infrastructure.** No Spring (`common.attributes` declares no
  `@Component`), no JPA, no transport, no clock, no I/O. Input DTO in, output DTO or exception out.
- **No domain knowledge.** It speaks `base schema` × `derived schema`, never "sport" / "profile" /
  "session". Every domain-specific rule (which sport, which profile, cross-domain lookups) stays in
  the consumer.
- **It is itself a primitive.** "Define a typed schema, validate values against it, resolve it for
  display" is now used the way `ApiResponse` is used — by every domain, the same way.

The override is **scoped to this framework**. It is not licence to move arbitrary business logic
into `common`; the next candidate is its own ADR-level call.

---

## Decision 2 — `common.attributes` is Spring-free

Plain classes, static factories, package-private helpers. No `@Component`, no injection. The size
check uses a package-private `ObjectMapper` (`AttributeJson`), not the Spring-managed one — which
matters (see D8). Consumers that want a Spring bean wrap the pure classes in their own
`@Component` façade (`sport-impl` will, in `A23`).

---

## Decision 3 — Domain-neutral vocabulary: `base` schema × `derived` schema

`common.attributes` offers two shapes:

- validate / resolve / filter **a single schema** (today: a sport's profile schema);
- validate / expand / resolve **a `(base, derived)` pair** — a derived schema's tree may contain
  `#ref` nodes pointing at `/`-paths in the base schema (today: a sport's session schema pointing
  at its profile schema).

## Decision 4 — One `AttributeSchema` type serves both roles

There is **no** `DerivedAttributeSchema`. A schema used as a derived schema is just an
`AttributeSchema` whose tree may contain `RefAttribute` nodes. The "derived-ness" lives in the
validator / expander / resolver **API** (`C9`), not in the DTO. This is what keeps `common` from
knowing about "session" — it only knows "a schema" and "a schema that references another schema".

## Decision 5 — Raw tree: sealed per-type hierarchy

`AttributeNode` is a `sealed interface` permitting `StringAttribute`, `NumberAttribute` (the only
one with `min`/`max`), `BooleanAttribute`, `EnumAttribute` + `ListAttribute` (the only ones with
`options`), `DefinitionAttribute` + `DefinitionListAttribute` (the only ones with `definitionRef`/
`searchScope`), and `RefAttribute` (`ref` + `cardinality`). `AttributeField` gets the same
treatment (6 subtypes; no `DEFINITION_LIST`, no ref).

This replaces the flat `SportAttributeDefinition` god-class where a `STRING` node carried
`options`/`min`/`max`/`definitionRef`/`searchScope`, all `null`, all kept absent by one procedural
`switch`. With the hierarchy, each kind has its own validator / value-checker / resolver.

**Dispatch (settled C6):** an **exhaustive `switch` over the sealed interface**, not a
`Map<…, …>` registry of classes — Java's exhaustiveness check on a sealed type gives the same
"add a subtype → compile error until you handle it" guarantee with far less code. A future type is
a new subtype plus the `switch` cases the compiler forces.

**`defaultValue` typing (amended C6):** typed `Object` on the value-bearing subtypes, not
per-subtype (`String`/`Number`/…). A typed field lets Jackson coerce scalars (`"27"` → `27`,
`42` → `"42"`), which diverges from the value validator's `instanceof` checks and the sport
framework's behaviour. `AttributeValues.isValid` is the single arbiter of default validity, exactly
as before.

## Decision 6 — Resolved tree: flat

`ResolvedAttributeNode` keeps a `type` discriminator + `cardinality` + nullable per-type fields.
The resolved tree is a write-once, read-once, immediately-serialised projection; the client
narrows it into its own discriminated union (`CLIENT-SESSION-17` Part A). `C8`'s resolver
*dispatch* is still per-type (open/closed preserved on the input side) — only its *output* is one
flat DTO. Sealing the resolved tree too would double the class count for no benefit on the read
side.

## Decision 7 — Wire-compatible (not strictly byte-identical)

The original framing was "byte-identical". Field order and `type`-as-metadata make a strict byte
match the wrong bar. The **testable contract** (`C5`'s `AttributeSchemaJsonSpec` enforces it):

- every currently-accepted schema JSON still **parses**;
- re-serialisation **renames no field, drops no field, changes no value**;
- field order pinned where practical.

Mechanism: `@JsonTypeInfo(use = NAME, include = As.PROPERTY, property = "type")` on the sealed
`AttributeNode` / `AttributeField`. `type` is Jackson-managed type metadata, so **no subtype
declares a `type` field**; Java code discriminates by `switch` pattern-match. Wire `type` values
are `STRING`…`DEFINITION_LIST` plus `REF` for `RefAttribute` — the latter a `@JsonSubTypes` name
only, **not** an `AttributeType` enum member (the enum stays the 7 value-kinds). `#ref` stays the
JSON key via `@JsonProperty("#ref")`.

The **one** shape that changes is the `#ref` node — governed by D9, and only derived schemas have
`#ref`.

## Decision 8 — Unknown fields rejected at parse

`AttributeJson.mapper()` keeps `FAIL_ON_UNKNOWN_PROPERTIES` **on** (Spring Boot turns it off). A
`min` on a `STRING` node now fails at deserialisation with a Jackson path, one layer earlier than
today's validator. Same documents rejected overall. **Consequence for `A23`:** a controller
deserialising a schema PUT body must route it through `AttributeJson.mapper()`, not the request's
default mapper, or misplaced fields will be silently dropped before the validator sees them.

## Decision 9 — `#ref` semantics change (folded into the extraction, not a pure move)

A `RefAttribute` no longer *mirrors* the base attribute. It declares an attribute whose **value(s)
are chosen from the base schema at the `#ref` path** — the ref is a *data-source* pointer. It
**requires**:

- an explicit **`key`** (was: the last `/`-segment of the ref path) — its own sibling-unique key;
- a **`cardinality`** — `SINGLE` (one value, single-select UI) or `LIST` (many, multi-select UI).

`label` stays an optional override; every other field stays forbidden on it. All four
`cardinality` × base-type combinations are legal. The resolved node carries `cardinality`, and
`prefillKey` now names the base path the client reads the **choice list** from (was: a one-shot
default).

**This is breaking** for any stored `#ref` document. The only one today is the seeded Badminton
*session* schema; `A23` rewrites it (migration or documented admin re-PUT, like `A15`). The
profile schema has no `#ref` and is unaffected.

**Why fold it in rather than a follow-up ticket:** the framework is being designed from scratch in
`common`; encoding the intended `#ref` contract now costs less than shipping the old one and
re-opening every validator/expander/resolver later. The client half is a genuinely separate
concern and *is* a follow-up (`CLIENT-SESSION-17`).

## Decision 10 — `retainDefined` generalizes

The whole drop-invalid filter — type/record/bounds validation **and** the "keep only still-defined
keys" prune (sport `A10`) — moves to `common.attributes` (`C7`). No profile-only half stays
behind. The prune loses its "profile" framing and becomes "re-filter a stored value map against
the current schema".

## Decision 11 — Behaviour parity is the acceptance bar

Every existing Spock case (plan doc §8) is ported to a new `common` spec and must pass with
identical accept/reject outcomes and message text where asserted. The single-schema path is
outcome-identical; only D9's `#ref` contract changes, by design.

---

## Rename map

See `ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` §3 (DTOs and logic classes) and §4 (package layout).
Summary: drop the `Sport` prefix (`SportAttributeSchema` → `AttributeSchema`, etc.); the flat
`SportAttributeDefinition` / `SportAttributeField` become the sealed `AttributeNode` /
`AttributeField` hierarchies; `SessionAttributeSchema`/`Group`/`Node` are removed (D4);
`ResolvedSport*` → `ResolvedAttribute*` (flat, D6); new `Cardinality` enum and `RefAttribute`.

## Client impact

`client/src/shared/types/sport.ts` hand-mirrors this tree (nothing links them). The wire stays
compatible (D7), so the client is not *forced* to change — but `CLIENT-SESSION-17` migrates the
mirror to a discriminated union anyway (matching D5) and adds the `cardinality`-driven
single/multi-select UI (D9). Filed, hard-blocked on `A23`.

## Consequences

- **Positive:** one framework, one set of tests; `SESSION-23`'s clone is deleted (`A23`); a new
  attribute type or a new consumer is cheap; `common` gains a fourth genuine primitive.
- **Negative:** ~30 small classes where there were ~6 fat ones; `A23` is a large repoint (every
  `def.getType()` read becomes a pattern switch); the `common` = "shape not logic" principle now
  has a documented exception that future ADRs must not treat as a general licence.
- **Sequencing risk:** `C5`–`C9` must all land before `A23` starts; until then `common.attributes`
  is unused code. Accepted — the alternative (a broken intermediate state across three modules) is
  worse.
