# Attribute-schema framework — extraction plan

**Status:** in progress — **C5 + C6 + C7 `DONE` 2026-09-08** (C5: ADR + DTO tree; C6: single-schema
`validate/`; C7: `path/` + `value/` filter); C8 next
**Owner tickets:** common `C5`–`C9`, sport `A23`, client `CLIENT-SESSION-17`
**Decision record:** `documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md`
**Supersedes the "do it as two tickets" framing in** `modules/common/docs/MVP/C5_*.md` /
`modules/sport/sport-impl/docs/MVP/A23_*.md` as originally filed (2026-09-07).

This document is the single place the whole move is tracked. Every ticket below links here; if a
class, a spec, or a consumer is not on one of the checklists in §7–§9, it has been missed.

---

## 1. Why

The per-sport attribute schema (sport `A9`/`A12`/`A13`/`A16`/`A17`/`A19`) is now a platform
primitive: a typed, localized, admin-managed schema tree; lenient drop-invalid value validation;
locale resolution for display. Profiles use it (`A9`); sessions use it (`SESSION-23`); groups,
facilities and equipment are expected to. Today the DTOs live in `sport-api` and the logic lives
package-private in `sport-impl`, so a new consumer either **clones** (drift risk — `SESSION-23` did,
404 lines) or forces `sport-api` to expose surface it does not own.

## 2. Decisions (rationale in the ADR)

| # | Decision |
|---|---|
| D1 | **Home: `modules/common`**, package `com.sportconnect.common.attributes`. The ADR explicitly overrides the "`common` holds shared *shape*, not shared *logic*" rule from `CLAUDE.md` / the `C2` ResourceGate ADR — the framework is pure, dependency-free functions and is a fourth `common` primitive alongside `ApiResponse`, the exception hierarchy and `ResourceGate`. |
| D2 | **`common.attributes` is Spring-free** — plain classes / static factories, no `@Component`, a package-private `ObjectMapper` for the size check. Consumers wrap in their own `@Component` façades if they want injection. |
| D3 | **Domain-neutral vocabulary.** `common.attributes` knows nothing of "sport" / "profile" / "session". It offers two shapes: validate/resolve/filter **a single schema**, and validate/expand/resolve **a `(base, derived)` pair**. |
| D4 | **One `AttributeSchema` type serves both roles.** There is no `DerivedAttributeSchema`. A schema used as a *derived* schema is just an `AttributeSchema` whose tree may contain `RefAttribute` nodes; the pair-ness lives in the validator/expander/resolver **API**, not the DTO. |
| D5 | **Raw tree = sealed per-type hierarchy** (`AttributeNode` permits `StringAttribute` … `RefAttribute`; `AttributeField` permits `StringField` … `DefinitionField`). Each subtype carries only its own fields; each has its own validator / value-checker / resolver, dispatched by an **exhaustive `switch` over the sealed set** (adopted C6 in place of the "N classes + registry" sketch — same compile-time open/closed guarantee, less ceremony). A new type later = new subtype + `switch` cases the compiler forces you to add. **Amended C6:** `defaultValue` on the value-bearing node subtypes is typed `Object`, not per-subtype (`String`/`Number`/…) — Jackson scalar coercion (`"27"`→`27`, `42`→`"42"`) on a typed field diverged from the value validator's `instanceof` checks and made parity cases unrepresentable. The value validator (`AttributeValues.isValid`) is the single arbiter, exactly as in the sport framework. |
| D6 | **Resolved tree = flat DTO.** `ResolvedAttributeNode` keeps a `type` discriminator + `cardinality` + nullable per-type fields. The resolved tree is a write-once, read-once, immediately-serialized projection; the client narrows it into a discriminated union itself (`CLIENT-SESSION-17` Part A). C8's resolver dispatch is still per-type; only its *output* is flat. Asymmetry is deliberate — see ADR. |
| D7 | **Wire-compatible** (revised 2026-09-08 from "byte-identical" — field order and `type`-as-metadata make a strict byte match the wrong bar). The testable contract: every currently-accepted schema JSON still **parses**; re-serialisation **renames no field, drops no field, changes no value**; field order is pinned (`@JsonPropertyOrder`) to today's where it can be. Jackson `@JsonTypeInfo(use = NAME, include = As.PROPERTY, property = "type")` on the sealed `AttributeNode` — `type` is type-metadata Jackson owns, so subtypes carry **no** `type` field (Java code discriminates by `switch` pattern-match). Wire `type` values: `STRING`…`DEFINITION_LIST` + `REF` for `RefAttribute` (a `@JsonSubTypes` name only — **not** an `AttributeType` enum member). `#ref` stays the JSON key `#ref` (`@JsonProperty`). The **one** shape that does change is the `#ref` node — governed by D9, and only derived schemas have `#ref`. |
| D8 | **Per-subtype unknown fields rejected at parse** (`@JsonIgnoreProperties(ignoreUnknown = false)` / `FAIL_ON_UNKNOWN_PROPERTIES`) — a `min` on a `STRING` node fails one layer earlier than today; same documents rejected. A readable message is preserved via `GlobalExceptionHandler`. |
| D9 | **`#ref` semantics change** (folded in, not a pure move). A `RefAttribute` no longer *mirrors* the base attribute. It declares an attribute whose **value(s) are chosen from the base schema at the `#ref` path** (the ref = the data source). It **requires** an explicit `key` (was: last `/`-segment of the ref path) and a `cardinality` (`SINGLE` \| `LIST`); `label` stays an optional override; every other field stays forbidden on it. All four `cardinality` × base-type combinations are legal. **Breaking:** every existing `#ref` node is invalid until it gains `key` + `cardinality` — only the seeded Badminton *session* schema is affected; `A23` rewrites it. |
| D10 | **`retainDefined` generalizes.** The whole drop-invalid filter — type/record/bounds validation **and** the "keep only still-defined keys" prune — is in `common.attributes`. No profile-only half stays behind. |
| D11 | **Behaviour parity is the acceptance bar.** Every existing Spock case (see §8) is ported to a new `common` spec and must pass with identical accept/reject outcomes. Renames aside, no validation, filter or resolution outcome changes — except D9's `#ref` contract, which changes by design. |

## 3. Rename map

`common.attributes` unless noted. Old types are `sport-api` (DTOs) or `sport-impl`
`com.sportconnect.sport.service` (logic).

### DTOs

| Today | New | Notes |
|---|---|---|
| `SportAttributeSchema` | `AttributeSchema` | `definitions[]` + `groups[]` + `defaultLocale`. Serves both base and derived roles (D4). |
| `SportAttributeGroup` | `AttributeGroup` | self-nesting `groups[]` + `attributes[]` + `isAvailable`. |
| `SportAttributeDefinition` (flat leaf) | `AttributeNode` **sealed** + `StringAttribute` / `NumberAttribute` / `BooleanAttribute` / `EnumAttribute` / `ListAttribute` / `DefinitionAttribute` / `DefinitionListAttribute` / `RefAttribute` | `NumberAttribute` alone has `min`/`max`; `EnumAttribute`/`ListAttribute` alone have `options`; `DefinitionAttribute`/`DefinitionListAttribute` alone have `definitionRef`/`searchScope`; `RefAttribute` has `ref` + `cardinality` (+ optional `label`). `defaultValue` typed per subtype. |
| `SportAttributeField` (flat) | `AttributeField` **sealed** + `StringField` / `NumberField` / `BooleanField` / `EnumField` / `ListField` / `DefinitionField` | No `DefinitionListField` (a field is never `DEFINITION_LIST`) and no ref field. `isRequired` on all. |
| `SportAttributeDefinitionType` | `AttributeDefinitionType` | `name` + `fields[]`. Class name not on the wire. |
| `SportAttributeOption` | `AttributeOption` | `value` + `label`. |
| `SportAttributeType` (enum) | `AttributeType` (enum) | Same 7 members: `STRING, NUMBER, BOOLEAN, ENUM, LIST, DEFINITION, DEFINITION_LIST`. |
| — (new) | `Cardinality` (enum) | `SINGLE`, `LIST`. On `RefAttribute` and mirrored onto `ResolvedAttributeNode`. |
| `SessionAttributeSchema` | *removed* → `AttributeSchema` (D4) | |
| `SessionAttributeGroup` | *removed* → `AttributeGroup` (D4) | |
| `SessionAttributeNode` | *removed* → `AttributeNode` with `RefAttribute` as the `#ref` case (D4/D5) | |
| `ResolvedSportAttributeSchema` | `ResolvedAttributeSchema` | flat (D6). |
| `ResolvedSportAttributeGroup` | `ResolvedAttributeGroup` | |
| `ResolvedSportAttributeDefinition` | `ResolvedAttributeNode` | flat: `type` + all nullable per-type fields + `cardinality` + `prefillable`/`prefillKey`. |
| `ResolvedSportAttributeDefinitionType` | `ResolvedAttributeDefinitionType` | |
| `ResolvedSportAttributeField` | `ResolvedAttributeField` | flat. |
| `ResolvedSportAttributeOption` | `ResolvedAttributeOption` | |

### Logic

| Today (`sport-impl`) | New (`common.attributes`) | Ticket |
|---|---|---|
| `SchemaChecks` (god-validator, 377 ln) | `validate/` — per-type `NodeValidator` + `FieldValidator` + `AttributeSchemaValidator` + shared `SchemaLabelChecks`/`KeyChecks`/`SizeCheck` | C6 |
| `SchemaPaths` (96 ln) | `path/AttributePaths` (`definedByPath` / `availableByPath` + `DefinedAttribute`) | C7 |
| `SportAttributeValues` (208 ln) | `value/` — per-type `ValueChecker` + `AttributeValues` (`isValid` / `isValidRecord` / `filterScalarOrRecord`) | C7 |
| `ProfileAttributeFilter` (222 ln) | `value/AttributeValueFilter` (`filter` + `retainDefined` + `DEFINITION_LIST` iteration) | C7 |
| `SportAttributeSchemaValidator` | folds into `validate/AttributeSchemaValidator` (single-schema mode) | C6 |
| `SportAttributeSchemaLabelResolver` | `resolve/` — per-type `NodeResolver` + `AttributeSchemaResolver` | C8 |
| `SessionAttributeSchemaValidator` | `pair/DerivedSchemaValidator` (or `AttributeSchemaValidator.validate(base, derived)`) | C9 |
| `SessionAttributeSchemaExpander` | `pair/DerivedSchemaExpander` | C9 |
| `SessionAttributeSchemaResolver` | `pair/DerivedSchemaResolver` | C9 |
| `SessionAttributeNodes` | folds into `pair/*` | C9 |
| `session-impl` `SessionAttributeFilter` / `SessionAttributeValues` / `SessionSchemaPaths` (the clone) | **deleted** — use `common.attributes` | A23 |

## 4. Target package layout

```
com.sportconnect.common.attributes
  AttributeType, Cardinality                             (enums)                       — C5
  AttributeSchema, AttributeGroup, AttributeDefinitionType, AttributeOption            — C5
  node/    AttributeNode (sealed) + 8 subtypes incl. RefAttribute                      — C5
  field/   AttributeField (sealed) + 6 subtypes                                        — C5
  resolved/ ResolvedAttributeSchema, ResolvedAttributeGroup, ResolvedAttributeNode,
           ResolvedAttributeDefinitionType, ResolvedAttributeField, ResolvedAttributeOption  — C5
  json/    the @JsonTypeInfo config / mix-ins / a shared ObjectMapper factory          — C5
  validate/ NodeValidator (per type) + FieldValidator + AttributeSchemaValidator + registry  — C6
  path/    AttributePaths                                                              — C7
  value/   ValueChecker (per type) + AttributeValues + AttributeValueFilter            — C7
  resolve/ NodeResolver (per type) + AttributeSchemaResolver                           — C8
  pair/    DerivedSchemaValidator + DerivedSchemaExpander + DerivedSchemaResolver      — C9
```

`RefAttribute` lives in `node/` even though it is only legal in a *derived* schema — it is a
permitted `AttributeNode` subtype; the single-schema validator (C6) **rejects** it, the pair
validator (C9) **requires** it to carry `key` + `cardinality` and resolves its `ref` against the
base schema.

## 5. Behaviour-preservation invariants

These must not change (D11). A ported spec that would need its expectation rewritten (other than a
rename) is a bug in the port, not the spec.

- **Wire:** every currently-accepted JSON document round-trips to a byte-identical document.
- **Validation outcomes:** the exact set of documents `AttributeSchemaValidator` accepts / rejects,
  and the message text where a spec asserts on it.
- **Lenient vs strict split:** admin `PUT` validation is strict all-or-nothing; profile/value
  writes are lenient drop-invalid and **never throw** (size is the one loud failure, and it stays
  in the consumer, not the filter).
- **`isAvailable` cascade:** full depth, parent wins, a live descendant does not resurrect a
  retired ancestor. `definedByPath` (physical presence) vs `availableByPath` (live subset).
- **`MAX_LIST_ITEMS = 10`** for `LIST` and `DEFINITION_LIST`; checked against submitted length
  before element filtering.
- **`MAX_SCHEMA_BYTES = 16384`.**
- **Locale fallback order:** exact tag → language-only → document `defaultLocale`.
- **Record rules:** required-field cascade; inner-position definitions primitive-only (the whole
  cycle rule); `defaultValue` forbidden on `DEFINITION`/`DEFINITION_LIST`; a `DEFINITION` field may
  not be `DEFINITION_LIST`.
- **`#ref` (changes by design — D9):** was "mirror, key = last segment, only `label` extra"; now
  "data source, explicit `key` + `cardinality` required". Dangling `#ref` → strict reject on
  validate, lenient-drop on expand. Session-local `definitions` must not collide with a name a
  `#ref` pulls from the base registry.

## 6. Ticket breakdown

| Ticket | Backlog | Scope | Depends |
|---|---|---|---|
| **C5** ✅ | `modules/common` | This doc + the ADR + the whole DTO tree (§4 `C5` rows) + Jackson polymorphism (D7/D8) + round-trip / wire-parity tests. **No business logic.** — *done 2026-09-08; `AttributeSchemaJsonSpec` green.* | — |
| **C6** ✅ | `modules/common` | Single-schema `validate/`: per-type validators (exhaustive `switch`) + `AttributeSchemaValidator` (label/locale/key/size + 3-pass `definitions` registry + inner-position cycle rule) + `value/AttributeValues.isValid`. Rejects `RefAttribute`. — *done 2026-09-08; 122 spec cases green.* | C5 |
| **C7** ✅ | `modules/common` | `path/AttributePaths` (flatten + full-depth `isAvailable` cascade), `value/AttributeValues` record cascade + dispatcher, `value/AttributeValueFilter` (`filter` + generalized `retainDefined` + `DEFINITION_LIST` iteration), `AttributeNodes` helper. — *done 2026-09-08; `ProfileAttributeFilterSpec` ported, 237 common tests green.* | C5, C6 |
| **C8** | `modules/common` | Single-schema `resolve/`: per-type node resolvers + `AttributeSchemaResolver` (locale fallback). | C5 |
| **C9** | `modules/common` | `pair/`: `RefAttribute` validation (D9), `DerivedSchemaExpander` (inline `#ref` as data source, lenient-drop stale, merge `definitions`, carry `cardinality`), `DerivedSchemaResolver` (stamp `prefillable`/`prefillKey`/`cardinality`). | C6, C7, C8 |
| **A23** | `modules/sport` | Repoint `sport-impl` + `session-impl` onto `common.attributes`; delete `sport-api` DTO tree + `sport-impl` logic + the `session-impl` clone; rewrite every `def.getType()` / `def.getMin()` site as a pattern switch; rewrite the seeded Badminton session schema for D9; repoint `SportService` `-api` signatures; full client census. | C9 |
| **CLIENT-SESSION-17** | `client` | Part A: migrate `shared/types/sport.ts` to a discriminated union + per-type render components. Part B: `#ref` single/multi-select from profile values. | A23 |

## 7. Class-move inventory (checklist)

**DTOs to move + reshape (C5):** `SportAttributeSchema`, `SportAttributeGroup`,
`SportAttributeDefinition` (→ 8 `AttributeNode` subtypes), `SportAttributeField` (→ 6 `AttributeField`
subtypes), `SportAttributeDefinitionType`, `SportAttributeOption`, `SportAttributeType`,
`SessionAttributeSchema` (→ removed), `SessionAttributeGroup` (→ removed), `SessionAttributeNode`
(→ removed / `RefAttribute`), `ResolvedSportAttributeSchema`, `ResolvedSportAttributeGroup`,
`ResolvedSportAttributeDefinition`, `ResolvedSportAttributeDefinitionType`, `ResolvedSportAttributeField`,
`ResolvedSportAttributeOption`. **New:** `Cardinality`, `RefAttribute`, the `json/` config.

**Logic to move + split:** `SchemaChecks` (C6), `SchemaPaths` (C7), `SportAttributeValues` (C7),
`ProfileAttributeFilter` (C7), `SportAttributeSchemaValidator` (C6),
`SportAttributeSchemaLabelResolver` (C8), `SessionAttributeSchemaValidator` (C9),
`SessionAttributeSchemaExpander` (C9), `SessionAttributeSchemaResolver` (C9),
`SessionAttributeNodes` (C9).

**To delete (A23):** all of the above from `sport-*`, plus `session-impl`'s `SessionAttributeFilter`,
`SessionAttributeValues`, `SessionSchemaPaths`.

## 8. Spec-parity matrix

| Existing spec | Lines | Ported by | Notes |
|---|---|---|---|
| `SportAttributeSchemaValidatorSpec` | 957 | C6 | Split into per-type validator specs + an `AttributeSchemaValidator` integration spec. Every accept/reject case preserved. |
| `ProfileAttributeFilterSpec` | 608 | C7 | `filter` + `retainDefined` cases; `retainDefined` now generalized (no profile framing). |
| ~~`SportAttributeValuesSpec`~~ | — | — | **Does not exist** (confirmed 2026-09-08). `SportAttributeValues` is covered indirectly: the `defaultValue` cases in `SportAttributeSchemaValidatorSpec` exercise `isValid`; `ProfileAttributeFilterSpec` exercises `isValid`/`isValidRecord`/`filterScalarOrRecord`. C6 builds `AttributeValues.isValid` + `withinBounds` (exercised by ported validator `defaultValue` cases); C7 writes a fresh `AttributeValuesSpec` for the record/dispatcher layer + ports `ProfileAttributeFilterSpec`. |
| ~~`SchemaPathsSpec`~~ | — | — | **Does not exist**. `SchemaPaths` is covered indirectly by `ProfileAttributeFilterSpec` (via `availableByPath`/`definedByPath`). C7 writes a fresh `AttributePathsSpec`. |
| `SportAttributeSchemaLabelResolverSpec` | 196 | C8 | locale fallback. |
| `SessionAttributeSchemaValidatorSpec` | 292 | C9 | **plus** new cases: `RefAttribute` missing `key` → reject, missing `cardinality` → reject, `cardinality` not in enum → reject, all 4 base-type × cardinality combos → accept. |
| `SessionAttributeSchemaResolverSpec` | 231 | C9 | **plus** `cardinality` carried onto the resolved node; `prefillKey` = choice-list source. |
| `SessionAttributeFilterSpec` (session-impl) | 243 | A23 | deleted with the clone; its cases are covered by C7's `AttributeValueFilter` specs — A23 confirms no unique case is lost before deleting. |
| `SportAttributeSchemaValidatorSpec` session-own-node cases | — | C6 + C9 | own nodes obey single-schema rules (C6); the `#ref`-vs-own split is C9. |

Every existing spec file must be accounted for in this table before A23 deletes its subject.

## 9. Consumer-repoint checklist (A23)

Enumerate at A23 pickup; seed list from the 2026-09-08 census:

- **`sport-impl`:** `SportServiceImpl` (schema get/put/raw/resolved), `UserSportProfileServiceImpl`
  (profile write filter + `retainDefined` + size), `SportLookupCache` (caches the raw schema),
  every `SportAttributeSchemaValidator` / `ProfileAttributeFilter` / `Session*` call site.
- **`sport-api`:** `SportService` method signatures naming a moved type — `getAttributeSchema`,
  `getAttributeSchemaForAdmin`, `replaceAttributeSchema`, `getSessionAttributeSchemaForAdmin`,
  `replaceSessionAttributeSchema`, `getSessionAttributeSchemaRaw`, `getResolvedSessionAttributeSchema`.
- **`session-impl`:** `SessionServiceImpl` (`getSessionAttributeSchemaRaw` consumer + write-time
  filter), delete `SessionAttributeFilter` / `SessionAttributeValues` / `SessionSchemaPaths`.
- **`session-api`:** Javadoc-only references to `getSessionAttributeSchemaRaw` — prose, no signature.
- **`server` ITs:** `SessionAttributeSchemaIntegrationTest`, `SessionAttributesIntegrationTest`,
  `SportAttributeSchemaIntegrationTest`.
- **Seeded data:** the Badminton **profile** schema (no change — no `#ref`), the Badminton
  **session** schema (rewrite every `#ref` node for D9 — migration or documented admin re-PUT per
  `A15`).
- **Client (`CLIENT-SESSION-17`):** `client/src/shared/types/sport.ts` mirror; every attribute
  surface (`SportAttributesFields`, `SessionAttributesSummary`, SPORT-2 renderer, ADMIN-2/5
  editors); `client/e2e/mocks/handlers/sport.ts` + session-schema fixtures; `*.test.tsx`.

For each: **compatible as-is / updated in A23 / deferred with a filed ticket** — never "probably
fine".

## 10. Open items / risks

- **Jackson + sealed interfaces + Lombok `@Builder`.** Records or classes? Sealed `interface` +
  `record` subtypes serialise cleanly with `@JsonTypeInfo`, but Lombok `@Builder` on a record is
  awkward and the codebase uses `@Data @Builder` classes everywhere. C5's design step picks one
  (leaning: sealed `interface` + `final class` subtypes with `@Value`/`@Builder`, or plain records
  with compact builders). Whichever — round-trip tests are the gate.
- **`EXISTING_PROPERTY` + unknown-field strictness interaction** — confirm `type` itself is not
  flagged as "unknown" on a subtype that also declares it.
- **`RefAttribute` in a base schema** — structurally representable (permitted subtype), must be
  rejected by C6. Spec it.
- **Resolved-tree flatness (D6)** — if a future need wants the resolved tree sealed too, that is a
  separate change; the client union (`CLIENT-SESSION-17` Part A) is unaffected either way.
- **Definition-type name** — kept `AttributeDefinitionType` over `AttributeRecordType` to preserve
  the `definitionRef` → `definitions` vocabulary. Revisit only if it reads badly in code review.
