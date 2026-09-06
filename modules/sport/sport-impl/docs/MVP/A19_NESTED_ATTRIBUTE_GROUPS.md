# A19 · Nested attribute groups + sibling-scoped keys (schema v3)

**Status:** `IN PROGRESS`
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

---

## Implementation (2026-09-06)

### Approved design (restated)

Full design + rationale: `documentation/md/SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md`. The six Phase-0
decisions:

1. **Storage** — `UserSportProfile.attributes` stays a flat `Map<String, Object>`; keys become full
   `/`-separated paths (`gear/rackets/tension`). Chosen over a nested object because it keeps
   `mergeAttributes` / `ProfileAttributeFilter.filter` / `.retainDefined` byte-for-byte unchanged
   (they iterate `entrySet()` and never inspect key shape).
2. **`order`** — removed from `SportAttributeGroup` / `SportAttributeDefinition` /
   `SportAttributeField` and the three `Resolved*` twins. v3 children are a strict ordered array;
   nothing in the backend ever sorted by `order`.
3. **Path grammar** — `/` separator, full path only, no bare-key shorthand. The `^[a-z][a-zA-Z0-9_]*$`
   key pattern can't contain `/`, so no escaping anywhere.
4. **Sibling namespace** — one per parent, shared by child sub-group keys and child attribute keys.
5. **A17** — carries the `#ref` reference-field change (path-qualified) and its dangling-path → 400
   validation; A19 ships no schema field holding a path. Delta filed on A17.
6. **Caps** — neither `MAX_SCHEMA_BYTES` (16KB) nor `MAX_ATTRIBUTES_BYTES` (4KB) moves. Path-keying
   adds ~36 B to a maximal Badminton profile's top-level keys, against measured 715 B / 4096.

### What was built

**`sport-api` DTOs**
- `SportAttributeGroup`: `+ List<SportAttributeGroup> groups` (optional, self-referential);
  `- Integer order`. Javadoc rewritten — groups namespace children by path; `key` **and tree
  position** immutable-by-policy.
- `SportAttributeDefinition`, `SportAttributeField`: `- Integer order`.
- `ResolvedSportAttributeGroup`: `+ List<ResolvedSportAttributeGroup> groups`; `- Integer order`.
- `ResolvedSportAttributeDefinition`, `ResolvedSportAttributeField`: `- Integer order`.

**`sport-impl`**
- **New `SchemaPaths`** (package-private) — the one place the `/`-separated path is built.
  `definedByPath(schema)` → `Map<path, DefinedAttribute>` (every declared leaf, `live` = own ∧ all
  ancestors `isAvailable != false`); `availableByPath(schema)` → the `live` subset. Depth-first,
  declaration order, full-depth `isAvailable` cascade (parent wins). Absorbs the two private
  flat-tree builders that lived in `ProfileAttributeFilter`.
- `ProfileAttributeFilter` — `filter` and `retainDefined` now call `SchemaPaths.availableByPath` /
  `.definedByPath`; the `DefinedAttribute` record moved to `SchemaPaths`. Everything else
  (`filterValue`, `definitionsByName`, `allowedValues`, the merge contract) unchanged.
- `SportAttributeSchemaValidator` — `validate` walks the group tree recursively
  (`validateGroupNode`). Each parent owns one `Set<String>` sibling namespace covering its
  sub-groups **and** attributes; collision → `BadRequestException("Duplicate node key among
  siblings: …")`. The sport-wide `groupKeys` / `attributeKeys` accumulators and the "must not be
  relaxed" comment are gone. `validateAttribute` lost its `seenKeys` parameter.
- `SportAttributeSchemaLabelResolver` — `resolveGroup` recurses into `group.getGroups()`; the three
  `.order(...)` builder calls removed.
- No change to `SportServiceImpl`, `SportController`, `SecurityConfig`,
  `UserSportProfileServiceImpl`, or `SportAttributeValues`.

**Migration** — `V061__sport_schema_v3_nested_groups.sql` (registered after V060). Scoped to
`sports.name = 'Badminton'`, both statements idempotent:
1. `UPDATE sports SET attributes_schema = '<v3 JSON>'` — the A15 document with every `order` key
   removed (authoritative copy: `A19_BADMINTON_SCHEMA_V3.json` beside this ticket).
2. `UPDATE user_sport_profiles … jsonb_object_agg(CASE key …)` — rekeys Badminton profile
   attributes from bare leaf key to full path (`handedness → general/handedness`, etc.); skipped
   for any row already holding a `/`-bearing key. ~0 rows pre-launch.

### Divergence from the plan

None functional. Removing the `@Builder` `order` field forced a mechanical sweep of every
`.order(...)` call in the sport Spock specs and two server ITs (expected — the plan called these
"reworked"). Two negative tests whose premise was "duplicate leaf key across groups" (now a
**valid** v3 document) were rewritten to "duplicate key among siblings in one group"
(`SportServiceImplSpec`, `SportAttributeSchemaIntegrationTest`).

### Tests

- `SportAttributeSchemaValidatorSpec` — same key legal under two different groups; same key legal at
  different depths; same key illegal among siblings; duplicate top-level group keys still rejected;
  sub-group key vs sibling attribute key collision rejected; group with sub-groups + attributes
  together passes; arbitrary-depth tree passes.
- `ProfileAttributeFilterSpec` — reworked onto path keys via a `g()` helper (prefixes `gear/`); new
  cases: value at a nested path survives; unavailable ancestor group (grandparent or parent) hides
  a depth-3 leaf marked available; a bare pre-v3 key no longer resolves under a nested schema;
  `retainDefined` keeps a nested-path value under an `isAvailable:false` ancestor verbatim and
  prunes an undefined nested path.
- `SportAttributeSchemaLabelResolverSpec` — resolution recurses through nested sub-groups
  (group + sub-group + leaf labels all resolved for `vi`).
- `SportProfileAttributeWriteIntegrationTest` (`:server:test`) — existing null-delete / empty-string
  / prune cases repointed to `gear/…` paths; new: write + re-read a value at `gear/rackets/tension`,
  unknown sibling path dropped.
- `SportAttributeSchemaIntegrationTest` (`:server:test`) — sibling-duplicate `PUT` rejected
  atomically; new: nested-group `PUT` round-trips the JSONB column and a member `GET` with
  `Accept-Language: vi` resolves the nested `groups` tree (labels + `min`).
- `SportProfileResumeAndVisibilityIntegrationTest` (`:server:test`) — attribute assertions
  repointed to `gear/…` paths.
