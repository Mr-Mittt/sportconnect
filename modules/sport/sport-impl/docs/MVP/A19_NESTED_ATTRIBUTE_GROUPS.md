# A19 · Nested attribute groups + sibling-scoped keys (schema v3)

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Depends on:** none hard (extends the A9/A12/A13 profile-schema machinery, all `DONE`). **Must be
sequenced before A17**, or A17 absorbs this ticket's path-reference change — A17's `#ref` grammar is
a bare `{ "#ref": "<profileAttributeKey>" }` that assumes sport-wide key uniqueness, which this
ticket removes.
**Filed:** 2026-09-03 — from a scoping pass after A16. The current schema can't express a nested
group: a `group` holds exactly one level of `attributes[]` and is presentation-only. A one-off
structured *value* is already well served by the `definitions[]` registry, so that stays out — this
ticket is purely about letting the display tree nest, and the key / reference model that follows.

## Phase 0 (before code)

Write `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md` (or a v3 section appended to the v2
design doc) + a `PROGRESS.md` summary. It must resolve, with rationale:

- **Stored profile value shape.** Sibling-scoped leaf keys break the flat `Map<String, Object>` (two
  attributes may now both be `tension` under different groups). Decide: full-path string keys
  (`attributes["gear/rackets/tension"] = 27`) vs. a nested object mirroring the tree. Either way
  `V025`'s merge-by-top-level-key semantics and `ProfileAttributeFilter`'s tree-flatten are reworked
  against the choice.
- **`order` field.** Whether to drop `order` on every node (`SportAttributeGroup`,
  `SportAttributeDefinition`, `SportAttributeField`, `SportAttributeOption`) in favour of array
  position, now that children are a strict ordered tree. Raised during scoping; not pre-decided.
- **Path grammar** — separator, escaping, and whether a bare leaf key is still accepted as shorthand
  anywhere or references are always full-path.
- **Sibling namespace** — confirm that within one group the child sub-group keys and child attribute
  keys share a single namespace (so `#gear/rackets` is unambiguous).
- **A17 reconciliation** — the exact `#ref` grammar change and which ticket carries it.
- **Caps** — whether `MAX_SCHEMA_BYTES` (16KB) and `MAX_ATTRIBUTES_BYTES` (4KB) need revisiting for
  path-keyed storage.

Any notification trigger that surfaces goes in `documentation/md/NOTIFICATION_USE_CASES.md`, not here.

## What ships

- **Sub-group nesting.** `SportAttributeGroup` gains an optional self-referential `groups` list.
  **Arbitrary depth** — groups nest by containment, not by name reference, so no cycle is possible
  and no depth counter is needed.
- **A group may hold sub-groups and attributes together.** `gear` can carry a `rackets` sub-group
  and a loose `shoeSize` attribute; both `#gear/shoeSize` and `#gear/rackets/tension` are valid
  paths. No mixed-children restriction.
- **All node keys unique among siblings only** — relaxed from today's sport-wide uniqueness for both
  group keys (v1 §4) and leaf attribute keys (v1 §2.1). The `^[a-z][a-zA-Z0-9_]*$` pattern is
  unchanged; only the uniqueness scope changes.
- **Path-qualified references.** A node is addressed by its full path from the schema root —
  `#gear/rackets/tension`. Group nodes keep their `key` for this reason.
- **Stored profile value reworked** per the Phase 0 decision — `UserSportProfile.attributes` can no
  longer be keyed by bare attribute key. `ProfileAttributeFilter` (today flattens the tree to bare
  keys, merges by top-level key) is reworked against the new shape.
- **Immutable-key policy extended.** Today only a leaf `key` is immutable-by-policy (a rename orphans
  stored values). Now a group's `key` *and its position in the tree* are also immutable-by-policy,
  since both are part of every descendant's storage path. Retiring a group = add the replacement
  subtree + set the old group `isAvailable: false`, never rename / move in place.
- **`isAvailable` cascade runs full-depth.** A disabled group hides its entire subtree at every
  level; parent-wins; no per-descendant override. (v2's rule, made recursive.)
- **`SportAttributeSchemaLabelResolver` recurses** through nested groups; the
  `ResolvedSportAttributeSchema` DTO tree gains the nested `groups` list.
- **Migration.** Rewrite the one seeded schema (Badminton, A15) into the v3 shape, and migrate any
  stored `UserSportProfile.attributes` rows for Badminton profiles to the new storage-key shape.
  Idempotent; pre-launch so row volume is ~zero, but it must exist and be tested.

## Explicitly unchanged

`DEFINITION` / `DEFINITION_LIST` and the sport-local `definitions[]` registry — untouched. A
structured *value* still goes through a named registry entry; this ticket adds no inline / anonymous
record shape. A `DEFINITION` attribute is still a leaf that happens to sit in a (possibly nested)
group.

## Cross-domain

None. "group" here is a schema-internal display node — unrelated to the social `Group` domain
(`modules/social/group-impl`). Stated because the word collision is easy to trip on.

## Account lifecycle

No new authenticated endpoint, background job, or cross-domain call. The admin schema `PUT` and the
profile write path already gate `isActive` (A7). Nothing new to check.

## Client-visible

`GET /api/sports/{sportId}/attribute-schema` returns a `ResolvedSportAttributeSchema` with a nested
`groups` tree — the client hand-mirrors this type in `client/src/shared/types/sport.ts` and renders
it in `SportAttributesFields`, both of which must handle recursion. A client ticket is filed
alongside (name at pickup — `SPORT-7` "group-level layout" is the likely home, or a new `SPORT-*`).
If Phase 0 puts storage on full-path keys, every client that reads or writes
`UserSportProfile.attributes` (PROFILE-4's editor at least) is affected — call this out once the
storage shape is decided.

## Out of scope

- Inline / anonymous record shapes (the registry covers reuse).
- A cross-sport definition or enum registry (still deferred, v2 §5.4).
- Client rendering of nested groups (the alongside client ticket).
- Discovery / ranking on nested paths.

## Tests

- Spock `SportAttributeSchemaValidatorSpec` — the same key legal under two different parents, illegal
  among siblings; a group with both sub-groups and attributes passes; the shared
  sub-group/attribute sibling namespace is enforced; an arbitrary-depth document passes; the
  full-depth `isAvailable` cascade; path-reference resolution and a dangling path → 400.
- `ProfileAttributeFilterSpec` — reworked against the Phase 0 storage shape.
- `SportAttributeSchemaLabelResolverSpec` — resolution recurses through nested groups.
- IT in `server/src/test/java/com/sportconnect/integration/` — a v3 document round-trips the JSONB
  column; a nested-group `PUT` then member `GET` resolves; a migration smoke check that Badminton's
  stored schema and any profile rows are in the new shape.
