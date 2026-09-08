# C5 · Attribute framework — ADR + neutral DTO tree

**Status:** `DONE` (2026-09-08)
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` — the master doc for the whole
move (decisions, rename map, package layout, spec-parity matrix, consumer checklist). **Read it
first.** Every ticket below links back to it.
**Filed:** 2026-09-07, from SESSION-23 pickup (which cloned 404 lines of value logic into
`session-impl` for want of a shared home).
**Rescoped:** 2026-09-08, at `/workon common mvp C5` pickup — the original "stand up the whole
framework" scope was ~5 sessions, so it was split into **C5 (this) + C6 + C7 + C8 + C9**. C5 now
ships only the decision record and the DTO tree; the logic lands in C6–C9. See the plan doc §6.

## What C5 ships

1. **`documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md`** — the decision record:
   - **Home = `modules/common`**, package `com.sportconnect.common.attributes`. Explicitly
     override the "`common` holds shared *shape*, not shared *logic*" rule from `CLAUDE.md` / the
     `C2` ResourceGate ADR — record *why* the attribute framework is the right exception (pure,
     dependency-free functions; a fourth `common` primitive). Record the two rejected homes
     (new `modules/attributes`; public `sport-*`) and why.
   - The **raw = sealed hierarchy / resolved = flat** asymmetry (plan doc D5/D6) and why.
   - The **wire-byte-identical** constraint (D7) and the **parse-time unknown-field strictness**
     (D8).
   - The **`#ref` semantics change** (D9): `RefAttribute` = a data-source pointer with a required
     explicit `key` + required `cardinality` (`SINGLE`/`LIST`), not a mirror. Note it is breaking
     for the one seeded document and that `A23` migrates it.
   - The **rename map** (plan doc §3) and that the client mirror changes in `CLIENT-SESSION-17`.

2. **The DTO tree** in `com.sportconnect.common.attributes` (plan doc §4, the `C5` rows):
   - enums `AttributeType` (7 members, unchanged) + `Cardinality` (`SINGLE`, `LIST`, new);
   - `AttributeSchema`, `AttributeGroup`, `AttributeDefinitionType`, `AttributeOption`;
   - `node/` — sealed `AttributeNode` + `StringAttribute`, `NumberAttribute` (only it: `min`/`max`),
     `BooleanAttribute`, `EnumAttribute` + `ListAttribute` (only these: `options`),
     `DefinitionAttribute` + `DefinitionListAttribute` (only these: `definitionRef`/`searchScope`),
     `RefAttribute` (`ref` + `cardinality` + optional `label`). `defaultValue` typed per subtype;
   - `field/` — sealed `AttributeField` + `StringField`, `NumberField`, `BooleanField`, `EnumField`,
     `ListField`, `DefinitionField` (no `DEFINITION_LIST` / ref field);
   - `resolved/` — **flat** `ResolvedAttributeSchema`, `ResolvedAttributeGroup`,
     `ResolvedAttributeNode` (`type` + nullable per-type fields + `cardinality` +
     `prefillable`/`prefillKey`), `ResolvedAttributeDefinitionType`, `ResolvedAttributeField`,
     `ResolvedAttributeOption`;
   - `json/` — the `@JsonTypeInfo(use = NAME, include = EXISTING_PROPERTY, property = "type")`
     config / mix-ins and a shared `ObjectMapper` factory; `#ref` pinned via `@JsonProperty`.

3. **Round-trip / wire-parity tests only — no business logic.** Spock specs that:
   - every currently-accepted schema JSON (the seeded Badminton profile schema, the
     `client/e2e/mocks` session-schema fixtures, a hand-built fixture covering all 7 types +
     nested groups + `definitions` + a `DEFINITION` field) deserialises into the new tree and
     re-serialises **byte-identical**;
   - an unknown field for a subtype (`min` on a `STRING` node) fails to parse (D8);
   - a `RefAttribute` JSON (`{"key":"x","#ref":"a/b","type":"…"? no}` — settle the exact shape in
     Design) round-trips, carrying `cardinality`.

## Explicitly out of scope (C5)

- **All business logic** — validation (C6), paths + value filter + `retainDefined` (C7),
  locale resolution (C8), the base×derived pair + `#ref` resolution (C9).
- Touching `sport-*`, `session-*`, or the client — `common.attributes` is pure addition and briefly
  unused until `A23`. No `-api` signature change, no wire change, so **no consumer census here** —
  that is `A23`'s (plan doc §9).
- Renaming the wire-visible `#ref` / `prefillable` / `prefillKey` fields.
- `A14` value-suggestions / `searchScope` work.

## Acceptance

- The ADR exists and makes the D1/D6/D7/D8/D9 calls explicitly.
- `./gradlew :modules:common:test` green, including the new round-trip specs.
- `./gradlew build` green (nothing else depends on the new package yet, so this just proves the
  package compiles inside `common`).
- C6–C9 exist as filed `TODO` tickets in `modules/common/docs/BACKLOG_MVP.md`.
- The plan doc §7/§8 checklists are complete (every existing class + spec accounted for).

---

## Implementation summary (2026-09-08)

**What was built** — `com.sportconnect.common.attributes`, pure addition, no consumer touched:

| Area | Files |
|---|---|
| Enums | `AttributeType` (7 kinds, unchanged), `Cardinality` (`SINGLE`/`LIST`, new) |
| Containers | `AttributeSchema`, `AttributeGroup`, `AttributeDefinitionType`, `AttributeOption` |
| `node/` | sealed `AttributeNode` + `StringAttribute`, `NumberAttribute` (only: `min`/`max`), `BooleanAttribute`, `EnumAttribute` + `ListAttribute` (only: `options`), `DefinitionAttribute` + `DefinitionListAttribute` (only: `definitionRef`/`searchScope`), `RefAttribute` (`#ref` + `cardinality`) |
| `field/` | sealed `AttributeField` + `StringField`, `NumberField` (only: `min`/`max`), `BooleanField`, `EnumField` + `ListField` (only: `options`), `DefinitionField` (only: `definitionRef`) |
| `resolved/` | flat `ResolvedAttributeSchema`, `ResolvedAttributeGroup`, `ResolvedAttributeNode` (+ `cardinality`/`prefillable`/`prefillKey`), `ResolvedAttributeDefinitionType`, `ResolvedAttributeField`, `ResolvedAttributeOption` |
| `json/` | `AttributeJson` — a strict, Spring-free `ObjectMapper` (`FAIL_ON_UNKNOWN_PROPERTIES` on, `NON_NULL` inclusion) |

Plus the ADR (`documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md`) and the master plan
(`documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md`, D1–D11 + §3 rename map + §4 layout +
§7/§8/§9 checklists). C6–C9 + the reworked A23 + CLIENT-SESSION-17 all filed.

**Design as approved, with two noted specifics:**
- **DTO style:** sealed `interface` + `final class` subtypes, each `@Data @Builder
  @NoArgsConstructor @AllArgsConstructor @JsonInclude(NON_NULL)` — matches the repo and the old
  `SessionAttributeNode`. Deserialisation uses the no-arg ctor + setters (`@Builder` is for our own
  construction).
- **Discriminator:** `@JsonTypeInfo(use = NAME, include = As.PROPERTY, property = "type")` — `type`
  is Jackson metadata, **no subtype has a `type` field**; callers `switch` on the sealed set. Wire
  `type` values `STRING`…`DEFINITION_LIST` + `"REF"` (a `@JsonSubTypes` name, not an
  `AttributeType` member). `#ref` pinned via `@JsonProperty`.
- **D7 softened** (was in the approved Phase 3 plan): "byte-identical" → "wire-compatible" —
  parses, renames/drops nothing, changes no value; field order pinned where practical. Plan doc D7
  updated.
- **`NumberAttribute.defaultValue` typed `Number`, not `Double`** — so a JSON integer literal
  (`"defaultValue": 175`) round-trips as `175`, not `175.0`. `min`/`max` stay `Double` (already
  were, so `19` → `19.0` is pre-existing, not a regression).

**Tests** — `AttributeSchemaJsonSpec` (6):
1. real seeded Badminton **v3 profile schema** (`A19_BADMINTON_SCHEMA_V3.json`, copied to
   `src/test/resources/attributes/`) → parses, structure asserted, re-serialise→re-parse stable,
   **zero field-name delta** vs the original JSON;
2. comprehensive fixture — every node + field kind, nested groups, a `DEFINITION` field, an
   `isAvailable:false` node → same stability + lossless assertions;
3. NUMBER integer `defaultValue` → stays `175`;
4. derived-schema fixture with two `RefAttribute` nodes (`SINGLE` + `LIST`, one with a label
   override) → `#ref` key and `"type":"REF"` survive, stable;
5. `min` on a `STRING` node → `UnrecognizedPropertyException` at parse (D8);
6. unknown top-level field → rejected.

**Verification:**
- `./gradlew :modules:common:test` — green, 26 (4 pre-existing suites + 6 new).
- `./gradlew :server:test` — 179 run, 9 failed: all `AmqpIOException` in
  `SessionEventsConsumerIntegrationTest` / `UserFriendEventsConsumerIntegrationTest` (RabbitMQ
  consumers). **Both classes pass in isolation** → parallel-load broker-contention flake, not a
  regression. C5 adds no Spring bean, entity, or wiring, so it cannot affect AMQP.
- `./gradlew assemble` — all modules compile.
- `:server:bootRun` not run — C5 adds no beans/endpoints/entities; `:server:test`'s 170 passing
  `@SpringBootTest` contexts cover wiring.
- N+1: N/A — no repository/service calls in C5.

**Not done here (by design):** all business logic (C6–C9), any `sport-*`/`session-*`/client change
(A23 / CLIENT-SESSION-17), the consumer census (A23, plan §9).

## Delta — 2026-09-08 (from C6)

C5 shipped `defaultValue` typed per subtype (`StringAttribute.defaultValue: String`,
`NumberAttribute: Number`, `BooleanAttribute: Boolean`, `EnumAttribute: String`,
`ListAttribute: List<String>`). **C6 changed all five to `Object`** — a typed field let Jackson
coerce scalars (`"27"` → `27`, `42` → `"42"`, `"true"` → `true`), which silently accepted defaults
the sport framework's `SportAttributeValues.isValid` rejects and made those parity cases
unconstructable. `AttributeValues.isValid` (built in C6) is now the single arbiter, matching sport
exactly. The C5 round-trip specs are unaffected (an `Object` field still deserialises `175` as an
`Integer` and re-serialises it as `175`). Plan doc D5 + ADR D5 updated.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
