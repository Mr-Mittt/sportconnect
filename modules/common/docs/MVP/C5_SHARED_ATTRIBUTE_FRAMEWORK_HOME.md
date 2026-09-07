# C5 · A shared home for the attribute-schema framework

**Status:** `TODO`
**Type:** Refactor / architecture
**Depends on:** nothing hard. **Paired with sport `A23`** — same body of work seen from the two
ends: `A23` removes the framework from `sport-*` and repoints sport/session consumers; this ticket
decides the shared home, writes the ADR, and stands up the neutral module/package. Do them together
(one PR) or C5 first.
**Filed:** 2026-09-07, from SESSION-23 pickup. SESSION-23 needed the attribute value-validation
logic (`ProfileAttributeFilter` / `SchemaPaths` / `SportAttributeValues`, all package-private in
`com.sportconnect.sport.service`) plus the `sport-api` attribute DTO tree from `session-impl`, and
there was no shared home — so it **cloned** the minimal logic as a deliberate, deletable bridge.
Sessions are the second consumer; groups / facilities / equipment are expected next.

## The decision this ticket owns

Write **`documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md`** choosing the home:

1. **`modules/common`** — a new `com.sportconnect.common.attributes` package holding the neutral
   DTO tree + the pure validation/filter logic. **Tension to resolve in the ADR:** CLAUDE.md and
   the `ResourceGate` ADR (`C2`) state that `common` carries shared *shape*, not shared *logic*.
   The attribute framework is real logic (type validation, the required-field cascade, bounds,
   path flattening). Overriding that principle is exactly an ADR-level call — make it explicitly or
   reject this option explicitly.
2. **A new `modules/attributes`** (`attributes-api` + `attributes-impl`) — a domain-neutral module,
   depended on by `sport-impl`, `session-impl`, and future consumers. Keeps `common` pure; costs a
   new module in the build graph.
3. **Keep it in `sport-*`, make the classes public** — smallest diff, but bakes "attributes are a
   sport concept" into every future consumer's imports. (SESSION-23 rejected this at pickup.)

The ADR also records: the rename map (`SportAttributeSchema` → neutral name, `SportAttributeType`,
`SportAttributeField`, `SportAttributeDefinitionType`, `SportAttributeOption`,
`ResolvedSportAttributeSchema` + resolved sub-DTOs, `SessionAttributeSchema/Group/Node`), whether
the `#ref`/`prefill` session-schema concepts fold into the neutral tree, and whether the client's
hand-mirrored types change (they mirror this tree for `SPORT-2` / `CLIENT-SESSION-14`).

## What ships (once the ADR lands)

- The chosen module/package, with the neutral DTO tree + `SportAttributeValues` (→ neutral name),
  `SchemaPaths`, `SchemaChecks`, and the drop-invalid value **filter** core. Behaviour
  byte-identical — this is a move + rename + de-dupe, not a redesign.
- `A23` does the sport/session repoint and deletes the SESSION-23 clone.

## Consumer census (at pickup, before moving anything)

Every moved type is a shared-DTO change. Enumerate first: all backend modules (`grep` the type
names — `sport-impl`, `sport-api`, `session-impl`, `session-api`, `server` ITs), the **client**
(`client/src` + `client/e2e/mocks` + `*.test.tsx` — it hand-mirrors the tree, nothing links them),
and every `-api` method signature that names a moved type (`SportService.getSessionAttributeSchemaRaw`
and siblings). List each as compatible / updated-here / deferred.

## Out of scope

Any new attribute capability. `A14`'s value-suggestions/`searchScope` work. Client rendering
(`CLIENT-SESSION-*`).
