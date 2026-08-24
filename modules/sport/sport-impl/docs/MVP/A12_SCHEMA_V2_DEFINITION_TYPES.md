# A12 · Schema v2 — definition types, registry, and the required-field cascade

**Status:** `TODO`
**Type:** Feature (Architecture)
**Filed:** 2026-08-24
**Depends on:** A9 (`DONE`) — the v1 document format this extends
**Blocks:** A14, A15, client `SPORT-2`
**Design:** `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md` — read it first; this ticket is
the core of the v2 format and does not re-argue the decisions made there.

## Why

A9 shipped a closed `type` set of `STRING`/`ENUM`/`LIST`, so an attribute value is a string or a list
of strings. A real sport's attribute set needs structure: a shoe has a name *and* a size, a size has
a system *and* a value, and a player owns several rackets each of which is a structured item. None of
that is representable today (design §2).

This ticket adds the one missing kind — a **definition** (a named record shape declared once and
referenced by name) — plus the required/optional rules that make a partially-filled record
well-defined.

## What ships

**1. `SportAttributeType` gains two members** — `DEFINITION` and `DEFINITION_LIST`. The enum stays
closed, now of five. **`LIST` is not overloaded** (design §5.1): its existing "multi-select over
`options`" validation path must remain literally unchanged.

**2. `SportAttributeDefinitionType` (new DTO in `sport-api`)** — a registry entry: `name`,
`List<SportAttributeField> fields`.

**3. `SportAttributeField` (new DTO in `sport-api`)** — `key`, `label`, `type`, `options`,
`definitionRef`, `isRequired`, `order`.

**4. `SportAttributeSchema` gains `List<SportAttributeDefinitionType> definitions`.**

**5. `SportAttributeDefinition` gains `definitionRef` and `searchScope`.** `searchScope` is carried
and validated here but is not *consumed* until A14 — it is in this ticket only so the document format
lands once rather than twice.

**6. Validator additions** (design §10) — atomic rejection, never half-applied:
- definition `name` unique; pattern `^[A-Z][a-zA-Z0-9]*$`
- field `key` unique within its definition; pattern `^[a-z][a-zA-Z0-9_]*$`
- every `definitionRef` resolves — **unresolved is a hard reject**
- a definition referenced *by another definition* holds only primitives (§5.3)
- a definition field is never `DEFINITION_LIST` (§5.3)
- `definitionRef` required for `DEFINITION`/`DEFINITION_LIST`, absent otherwise
- `options` and `defaultValue` absent for `DEFINITION`/`DEFINITION_LIST` (§5.5)
- unreferenced definitions are **allowed**
- a document using any v2-only feature must declare `version: 2`

**7. `SportAttributeValues` gains the record case**, and a new `validateRecord` implementing §6's
rule: *a record is valid iff every required field is present and valid; an invalid optional field is
dropped alone and the record survives.* Keep it in `SportAttributeValues` — the shared strict/lenient
rule A9 established, so the validator's `defaultValue` check and the filter's user-value check cannot
diverge.

**8. `ProfileAttributeFilter` implements the full §9 algorithm** — still never throwing, still merging
by top-level key, size check still last.

## Decisions already made (do not relitigate at pickup)

- **`type: "DEFINITION"` + `definitionRef`, never `type: "#Shoe"`.** Keeps the enum
  Jackson-deserializable and both switches exhaustive (§5.2).
- **Depth 2. No cycle detection is written**, because §5.3's rule makes cycles structurally
  unrepresentable. If a reviewer asks where the visited-set is, the answer is §5.3 — not an omission.
- **`DEFINITION_LIST` writes replace the whole list.** No element identity.
- **`isRequired` is scoped to records only** — it must not leak to top-level attributes, which would
  change A9's contract that a profile write never fails on `attributes` content (§6.1).
- **The registry is sport-local**, duplicated across sports on purpose (§5.4).

## Non-obvious constraints

- **No migration.** `sports.attributes_schema` is already JSONB. `Sport.attributesSchema` stays an
  untyped `Map<String, Object>` for the reason A9 recorded — it rides the hot `SportLookupCache` path.
- **`UserSportProfile.attributes` stays flat.** Only the *value* under a key gains structure. If a
  change here starts nesting keys, it has gone wrong (§14).
- **The 4KB profile cap now holds records.** A `DEFINITION_LIST` of ten shoes is much larger than ten
  strings. Expect the cap to bind sooner; do not raise it in this ticket without a measurement.
- **Silent drops get sharper.** Dropping one malformed element from a replaced list loses user data
  with no error. That is A9's deliberate posture and it stays, but say so in the implementation
  summary rather than letting it pass unremarked (§9.1).

## Tests

- **Spock (`sport-impl`)** — extend `SportAttributeSchemaValidatorSpec` with one case per new
  rejection rule above (bundling them into one "invalid document" test rots silently, per A9's own
  note). Extend `ProfileAttributeFilterSpec` with the §6 cascade table in full: required-absent drops
  the record, optional-invalid keeps it, nested-record-invalid drops only the optional parent field,
  unknown fields dropped before the required check, `DEFINITION_LIST` drops bad elements and keeps
  good ones, empty list stored.
- **Construct the validator and filter real, never mocked**, as A9 established — they are pure
  functions and mocking them proves nothing.
- **Integration test** — `PUT` a v2 document with a `DEFINITION_LIST` and `GET` it back through the
  real JSON column; assert an unresolved `definitionRef` is rejected **atomically** (the follow-up
  `GET` shows nothing written). No new authorization boundary is added here, so the existing
  `SportAttributeSchemaIntegrationTest` gates still cover that half.

## Out of scope

Localized labels (**A13**), consuming `searchScope` (**A14**), seeding any sport (**A15**),
`NUMBER`/`BOOLEAN` (**A16**), `isAvailable` on definitions or fields, and a cross-sport registry.
