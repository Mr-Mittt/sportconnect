# A23 · Extract the attribute-schema framework into a shared home

**Status:** `TODO`
**Type:** Refactor / architecture
**Depends on:** nothing hard. Best done before a third domain grows its own attribute surface.
**Paired with common `C5`** — same body of work from the other end: `C5` owns the ADR (which shared
home) + standing up the neutral module/package; this ticket removes the framework from `sport-*`,
repoints sport/session consumers, and deletes the SESSION-23 clone. Do them together (one PR) or
`C5` first.
**Filed:** 2026-09-07, from SESSION-23 pickup — that ticket needed
`ProfileAttributeFilter` / `SchemaPaths` / `SportAttributeValues` (all package-private in
`com.sportconnect.sport.service`) and the `sport-api` attribute DTO tree from `session-impl`, and
there was no shared home. SESSION-23 **cloned** the minimal value-validation logic into
`session-impl` as a deliberate, deletable bridge (matching the `SessionGate`/`PostGate`
"same shape, no shared logic" precedent). This ticket removes that duplication.

## Why

The per-sport attribute schema (A9/A12/A13/A16/A17/A19) is turning into a platform primitive:
define a typed, localized, admin-managed schema tree; validate submitted values against it with
lenient drop-invalid semantics; resolve it for display. Sport profiles use it (`A9`), sessions now
use it (`SESSION-23`), and more domains (groups, facilities, equipment) are expected to. Today the
DTOs live in `sport-api` and the logic lives package-private in `sport-impl`, so every new consumer
either clones (drift risk) or forces `sport-api` public surface it does not own.

## What ships

1. **An ADR** — `documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md` — deciding the shared
   home and the naming. Candidates weighed at filing:
   - a new `modules/attributes` (`attributes-api` + `attributes-impl`) domain-neutral module, **or**
   - `modules/common` (rejected lean at filing: CLAUDE.md / the ResourceGate ADR say `common`
     holds shared *shape*, not shared *logic* — overriding that is itself an ADR-level call), **or**
   - keep it in `sport-*` but make the needed classes public (smallest, but bakes "attributes are a
     sport concept" into every future consumer).
   The ADR also records the rename map (`SportAttributeSchema` → neutral name, etc.) and whether
   the client's mirrored types change.
2. **Move the neutral DTO tree** out of `sport-api`: `SportAttributeSchema`, `SportAttributeGroup`,
   `SportAttributeDefinition`, `SportAttributeDefinitionType`, `SportAttributeField`,
   `SportAttributeType`, `SportAttributeOption`, `ResolvedSportAttributeSchema` (+ the resolved
   sub-DTOs), `SessionAttributeSchema`/`Group`/`Node` (or fold these into the neutral tree).
3. **Move the shared logic**: `SportAttributeValues` (type/record/bounds validation),
   `SchemaPaths` (path flattening + `isAvailable` cascade), `SchemaChecks` (per-node/per-definition
   rules), and the drop-invalid value **filter** (`ProfileAttributeFilter.filter`'s core, minus the
   A10 `retainDefined` profile-only half — decide whether that generalizes too).
4. **Repoint consumers**: `sport-impl` (`SportAttributeSchemaValidator`, session-schema
   validator/expander/resolver, `ProfileAttributeFilter`, `UserSportProfileServiceImpl`),
   `session-impl` (delete the SESSION-23 clone, use the shared filter), and any `-api` method
   signatures that name a moved type (`SportService.getSessionAttributeSchemaRaw` etc.).

## Consumer census (do this properly at pickup)

Every moved type is a shared-DTO change. Enumerate before moving: all backend modules (`grep` the
type names), the **client** (`client/src` hand-mirrors this tree for SPORT-2 / CLIENT-SESSION-14 —
nothing links them), and any `-api` interface method that returns/accepts one. List each as
compatible / updated-here / deferred.

## Out of scope

Any new attribute *capability*. This is a move + rename + de-dupe only — behaviour byte-identical,
every existing Spock/IT spec green with only import/name changes.
