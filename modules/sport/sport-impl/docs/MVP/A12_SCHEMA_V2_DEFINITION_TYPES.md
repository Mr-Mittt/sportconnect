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

## Implementation summary (`DONE`, 2026-08-24)

### The approved plan

Five DTO changes in `sport-api` (`SportAttributeType` gains `DEFINITION`/`DEFINITION_LIST`; two new
DTOs `SportAttributeField` and `SportAttributeDefinitionType`; `SportAttributeSchema` gains
`definitions`; `SportAttributeDefinition` gains `definitionRef` + `searchScope`), extended by a
three-pass registry validator in `SportAttributeSchemaValidator`, a record-cascade addition to the
shared `SportAttributeValues`, and a `DEFINITION_LIST`-aware dispatch in `ProfileAttributeFilter`. No
migration, no entity change, no controller change — confirmed at design time that
`objectMapper.convertValue` already round-trips the whole DTO tree through `Sport.attributesSchema`'s
untyped `Map`, so new fields ride along for free.

### `version` was added, then removed entirely — record of both halves

Item 6's validator-additions list initially omitted a rule item 10 of this same ticket file already
stated: *"a document using any v2-only feature must declare `version: 2`."* Caught while writing the
DTO Javadoc for `SportAttributeSchema.version` — the field comment about to be written claimed a
guarantee the code didn't yet enforce. Implemented: `validate()` gained `usesV2Features` tracking (set
when the registry is non-empty, or any attribute is `DEFINITION`/`DEFINITION_LIST`) and a check after
the group/attribute pass, before the size check. Covered by three Spock cases at the time.

**Then removed entirely, on user review, same session.** The question that undid it: nothing in the
codebase reads `version` to decide anything — A9's own DTO comment already said as much — so the gate
was pure friction, rejecting an otherwise-valid document over a labeling mismatch that changed no
behavior. Product decision: there is no concrete plan to version the schema syntax, so speculative
version machinery is exactly what this codebase's "don't design for hypothetical future requirements"
rule argues against. `SportAttributeSchema.version` and every validator/test reference to it were
deleted (not merely relaxed): the DTO field, the `usesV2Features` check, the three tests that proved
it, plus every `.version(...)` builder call across `SportAttributeSchemaValidatorSpec`,
`ProfileAttributeFilterSpec`, `UserSportProfileServiceImplSpec`, `SportServiceImplSpec`, and
`SportAttributeSchemaIntegrationTest` — nine call sites in a pre-existing A9-era spec
(`SportServiceImplSpec`) alone, found only by a repo-wide grep after the obvious files were already
fixed, since a per-file review would have missed them.

**A real property of the format surfaced while doing this cleanup, checked live rather than assumed.**
The stored-document `Map → SportAttributeSchema` conversion
(`objectMapper.convertValue`, used by `getAttributeSchema`/`getAttributeSchemaForAdmin` on **read**)
has `FAIL_ON_UNKNOWN_PROPERTIES` enabled — a stray `version` key left in a Spock fixture threw
`UnrecognizedPropertyException`. The **write** path (`@RequestBody` JSON binding on the `PUT`
endpoint) is a different code path and is lenient: verified against a running server, `PUT` with a
body of `{"version":1,"groups":[]}` — the client's already-shipped `ADMIN-2` empty-prefill literal —
returned `200` with `version` silently dropped, never persisted. So the already-shipped client is
**not** broken by this removal, and the read-side strictness can only ever matter for a document
nobody could have produced through the app's own write path. Recorded in design doc §11/§14 for
whoever next removes or renames a schema-level field.

### A design correction caught before any code was written

While designing `SportAttributeValues`, tracing through what "the filter keeps a nested record's
surviving fields" actually requires surfaced a bug the Phase 3 plan would have shipped: routing a
`DEFINITION`-typed field through a boolean-only `isValid` (mirroring the primitive types) would check
whether a nested record is valid *at all*, then store the **raw, unfiltered** nested map on success —
silently keeping any junk field inside it that the record-level "drop undeclared keys" rule was
supposed to remove. Fixed by having `SportAttributeValues.filterScalarOrRecord` return the *filtered*
value (recursively, via `isValidRecord`) rather than a boolean, so `isValidRecord`'s per-field loop
stores what actually survived, not what was submitted. `isValid` itself stayed exactly as A9 shipped
it — 3-arg, primitives only — and gained a `DEFINITION`/`DEFINITION_LIST` switch arm that throws
`IllegalStateException` rather than silently mishandling a case it was never meant to receive; every
real call site for a record type goes through `filterScalarOrRecord`/`isValidRecord` instead.

### Key decisions (all recorded as Javadoc at the point they matter, not just here)

- **`type: "DEFINITION"` + `definitionRef`, never a sigil in `type` itself** — keeps
  `SportAttributeType` a plain closed enum, so both the validator's and (eventually) the client's
  exhaustive switches keep working.
- **`LIST` was not overloaded.** `DEFINITION_LIST` is a fifth, separate member; `LIST`'s existing
  validation path (`SportAttributeSchemaValidatorSpec`'s pre-existing cases) is untouched.
- **No cycle detection was written**, per the ticket's explicit instruction. The depth rule —
  "a definition referenced by another definition's field may only hold primitive fields" — makes a
  cycle a direct contradiction on the inner definition, caught by one pass with no traversal. Proven
  by three specs: a direct self-reference, a two-node cycle, and (as a control) a definition that
  legitimately holds a `DEFINITION` field *because it is never itself referenced by another
  definition* (only by a top-level attribute).
- **`DEFINITION_LIST`'s "keep good elements, drop bad ones" stayed in `ProfileAttributeFilter`**,
  not `SportAttributeValues` — it's a list-level policy (this filter's own concern per its class
  Javadoc), not a per-value validity question, so `filterScalarOrRecord` deliberately throws if
  handed `DEFINITION_LIST` directly; the filter unwraps the list itself and calls it once per element
  with `DEFINITION`.
- **A record's undeclared keys are dropped by construction, not by an explicit check** —
  `isValidRecord` only ever reads `record.get(field.getKey())` for fields the definition declares, so
  a submitted key with no declaration is simply never looked at. Verified by a dedicated Spock case
  rather than left implicit.

### Tests

- `SportAttributeSchemaValidatorSpec`: **50 cases** (up from 13; peaked at 53 with the version-gate
  trio, net −3 after removal). Every remaining rejection rule keeps its own case per the file's
  existing no-bundling convention, including the depth/cycle/outer-position trio.
- `ProfileAttributeFilterSpec`: extended with 13 new cases covering the full §6 cascade table
  (required-missing, optional-invalid, nested-optional-invalid, undeclared-key-dropped,
  not-a-Map/not-a-List type mismatches, per-element `DEFINITION_LIST` drop, and the empty-list clear
  path), plus a `schemaWithDefinitions()` builder alongside the existing scalar-only `schema()`. All
  passing.
- `SportAttributeSchemaIntegrationTest`: two new cases — a full `definitions` + `DEFINITION_LIST` +
  `DEFINITION` round trip through the real JSON column, and an unresolved-`definitionRef` atomic
  rejection (mirroring the existing duplicate-leaf-key case's pattern). No new authorization boundary,
  so no new IT class, per an explicit scope decision confirmed before Phase 2.
- `UserSportProfileServiceImplSpec` and `SportServiceImplSpec` (both pre-existing, A9-era): no new
  cases, but every `.version(...)` builder call and raw `[version: N, ...]` map fixture removed to
  match the DTO. `SportServiceImplSpec` needed the raw-map fixtures fixed too, not just the builder
  calls — those go through the same strict `convertValue` path and threw
  `UnrecognizedPropertyException` at runtime once `version` was gone from the DTO, a failure mode the
  compiler couldn't catch since Groovy `Map` literals aren't typed against the DTO at compile time.
- **Live verification against a running server and real Postgres**, twice — once for the original
  v2 core, once again after the `version` removal (because a stale server process on port 8080 needed
  replacing anyway, and the removal touched a code path — request-body binding — nothing else had
  exercised live). First pass: registered a real admin, `PUT` a v2 document and confirmed it in
  `jsonb_pretty(attributes_schema)`, proved atomic rejection live, then created a real profile whose
  submitted `attributes` exercised every branch of the cascade at once — the stored result matched the
  unit specs exactly. Second pass: `PUT` `ADMIN-2`'s exact shipped empty-prefill literal
  (`{"version":1,"groups":[]}`) and confirmed `200`, `version` silently dropped, never persisted. All
  test data removed afterward both times.
- `:modules:sport:sport-impl:test` and `:server:test` (**118/118**, 11/11 real IT classes, 0
  failures) both green, re-run after the `version` removal.

### A third addition, same session: a default 10-item cap on `LIST`/`DEFINITION_LIST`

Requested after the `version` removal, still on this same open branch. `SportAttributeValues` gained
`MAX_LIST_ITEMS = 10`, enforced in `isValid`'s `LIST` arm (`list.size() <= MAX_LIST_ITEMS`) and, since
`DEFINITION_LIST` never routes through `isValid`, as an explicit check in
`ProfileAttributeFilter.filterValue` on the **submitted** list length before any per-element
filtering runs. Over the cap invalidates the whole value — no truncation to 10, consistent with every
other invalid-value case in this class. A hardcoded default rather than a new admin-configurable
schema field, on the same "don't design for hypothetical future requirements" reasoning as everything
else deferred in this ticket (§3 of the design doc, now also §9.2) — there is no real profile anywhere
near the size cap this would protect (§13.2 measured 17.5% at a realistic maximum), so the cap bounds
unbounded growth in principle, not a size problem that exists in practice.

**One deliberate design choice worth flagging:** the cap gates on the *submitted* count, not the
*surviving* count. Checking after per-element filtering would let a flood of hundreds of malformed
`DEFINITION_LIST` elements slip past the cap as long as few enough of them happened to be valid —
proven with a dedicated Spock case (`the cap gates on the SUBMITTED count...`) submitting 100 junk
elements and confirming the whole value is still dropped, not reduced to whatever survived.

Also bounds an admin's `defaultValue` on a `LIST` attribute for free, via the same shared `isValid`
call `validateDefaultValue` already used — covered by a new data-table row plus a boundary-pass case.

**Live-verified a third time**, on the same restarted server: a schema `PUT` that had returned 500
turned out to be a stale-classloader artifact from repeated recompiles against a JVM that had been
running since before several rebuilds — not a real defect, resolved by killing and restarting
`bootRun` clean. After that, live-tested the actual boundary against a real profile: 10 rackets
submitted → all 10 kept; then 11 submitted as an update → the whole write dropped and the **original**
10 survived completely unchanged (A3's merge-keeps-prior-value semantics, confirmed live rather than
only in Spock). Test data removed afterward.

Tests: `SportAttributeSchemaValidatorSpec` +2 (11-item `defaultValue` rejected; exactly-10 accepted),
`ProfileAttributeFilterSpec` +6 (`LIST` at cap kept; `LIST` over cap dropped whole; `DEFINITION_LIST`
at cap kept; over cap dropped whole; the submitted-vs-surviving-count case above) — **155/155** total
in `sport-impl`, `:server:test` unchanged at **118/118** (no new authorization boundary, so no new IT
case, same call as the rest of this ticket).

**Client impact, filed here rather than as a separate ticket** since this ticket is still open:
`SPORT-2` (item 5 added to its rescope note) and `SPORT-6` (new "10-item cap" section) both now
require mirroring `10` as a hardcoded client-side constant and blocking further additions in the UI —
same strict-client/lenient-server split as `isRequired`, and arguably higher-stakes to get right: an
over-cap `LIST`/`DEFINITION_LIST` write doesn't just drop the new item, it drops the *entire*
submitted value and silently reverts to whatever was stored before, including any edits to the items
that were individually fine.

### Non-obvious constraints for whoever touches this next

- **Field primitives are `STRING`/`ENUM`/`LIST` only for now**, matching top-level attribute types
  minus the two record kinds — confirmed explicitly at Phase 1 pickup rather than assumed. `NUMBER`/
  `BOOLEAN` land with `A16`, which will need to extend both this validator's field-type switch and
  `SportAttributeSchemaValidator`'s attribute-type switch in the same change (both are exhaustive
  Java switches, so the compiler forces it).
- **`isValidRecord`/`filterScalarOrRecord` trust the schema was already validated.** They do not
  re-check the depth-2 rule at runtime — a document that somehow bypassed the validator (there is no
  such path today) could recurse arbitrarily. This mirrors A9's existing posture (the filter never
  re-validates key patterns either) and is why the two are always constructed real, never mocked, in
  every spec that exercises them.
- **A10 gets sharper, not smaller.** `DEFINITION_LIST` can now be cleared with an empty list —
  `STRING`/`ENUM`/`DEFINITION` still cannot be cleared at all, which is a more visible inconsistency
  now that both shapes exist side by side on the same sport.
- **There is no `SportAttributeSchema.version` field.** It shipped mid-ticket, then was deleted the
  same session (see above) — don't reintroduce it without a real, current reason; "for future readers"
  was tried and explicitly rejected. If a genuine need for schema-syntax versioning shows up later, it
  gets designed against that actual need, not resurrected from here.
- **`objectMapper.convertValue` is strict; `@RequestBody` binding is not.** The stored-document read
  path throws `UnrecognizedPropertyException` on any key the current DTOs don't declare; the `PUT`
  endpoint's JSON binding silently drops one instead. Both use Jackson, both target the same DTO, and
  they still disagree — confirmed live, not assumed (see above). Keep this in mind before adding or
  removing any `SportAttributeSchema`-tree field: the write side will forgive a stray old field from a
  client that hasn't redeployed yet, but a stored document carrying one (there are none today) would
  fail to load on read.
- **Client `ADMIN-2`'s own implementation doc** (`client/docs/MVP/ADMIN-2_SPORT_ADMIN_MASTER_DETAIL_PAGE.md`)
  cites the removed `"Attribute schema must declare a version"` message as proof its
  `{version:1,groups:[]}` empty-prefill literal was "necessary, not decorative." That claim is now
  stale — verified live here that the same literal still `200`s, `version` just gets silently
  dropped — but it's not a functional break (an inert field, not a rejected one), so left as-is rather
  than filing client follow-up work this ticket didn't ask for. Not edited: it's ADMIN-2's own
  historical verification record of what was true when it shipped, same as A9's docs weren't rewritten
  when A11 later found gaps in them.
