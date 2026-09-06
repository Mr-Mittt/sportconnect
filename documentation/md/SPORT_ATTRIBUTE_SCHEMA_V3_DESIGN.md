# Sport Attribute Schema — v3 Design

**Ticket:** `modules/sport/sport-impl` A19
**Status:** design locked 2026-09-06, implemented in the same ticket
**Builds on:** [`SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`](SPORT_ATTRIBUTE_SCHEMA_DESIGN.md) (v1, A9),
[`SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md`](SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md) (A12/A13 — the
`definitions` registry, record types, localized labels)

---

## 1. What v2 cannot express

A `group` in v1/v2 is a single, flat, presentation-only bucket: it holds exactly one level of
`attributes[]` and cannot contain another group. "Gear → Rackets → (tension, weight, balance)" has
to be flattened to `gear.{racketTension, racketWeight, racketBalance}` with the structure living
only in the key-naming discipline of whoever authored the schema.

A structured *value* (a shoe that has a name and a size) is already well served by the `definitions`
registry (v2 §5) and stays exactly as it is. This document is only about letting the **display
tree** nest, and the key / reference model that necessarily follows once it does.

## 2. What v3 adds

- **Sub-group nesting.** `SportAttributeGroup` gains an optional self-referential `groups` list.
  Depth is arbitrary; groups nest by containment, so no cycle is possible and no depth counter is
  needed.
- **Mixed children.** A group may hold `groups` and `attributes` together — `gear` can carry a
  `rackets` sub-group and a loose `shoeSize` attribute at the same level.
- **Sibling-scoped keys.** Node keys (`^[a-z][a-zA-Z0-9_]*$`, unchanged) are unique **only among
  their siblings**, not across the whole sport. Within one parent, child sub-group keys and child
  attribute keys share **one** namespace.
- **Path-qualified addressing.** A node is addressed by its full path from the schema root:
  `gear/rackets/tension`. Group nodes keep their `key` for this reason.
- **Path-keyed profile storage.** `UserSportProfile.attributes` is keyed by the full path of the
  attribute, not the bare leaf key.
- **Full-depth `isAvailable` cascade.** A disabled group hides its entire subtree at every level;
  parent-wins; no per-descendant override. (v2's rule, made recursive.)
- **`order` removed.** See §4.

## 3. Resolved decisions (this ticket's Phase 0)

### 3.1 Stored profile value shape — full-path string keys

`UserSportProfile.attributes` stays a flat `Map<String, Object>`; the keys become full paths:

```json
{
  "general/handedness": "RIGHT",
  "gear/rackets": [ { "value": "Astrox 99" } ],
  "gear/premium/racketTension": 27
}
```

**Rejected:** a nested object mirroring the schema tree (`{ gear: { rackets: [...] } }`). It reads
nicely but every merge in `UserSportProfileServiceImpl.mergeAttributes` — retain-then-overlay,
`null`-as-delete-marker, `DEFINITION_LIST` whole-value replace — is currently a flat
top-level-key operation. A nested store turns each of those into a recursive walk with its own
edge cases (does `null` at `gear/rackets` delete the leaf or the whole `gear` subtree?), for no
functional gain: the schema is what carries structure, the stored map only carries values. Flat
path keys keep `mergeAttributes`, `ProfileAttributeFilter.filter` and `.retainDefined` **byte-for-
byte unchanged** — they iterate `entrySet()` and never look at the key's shape.

Only the two lookup maps `ProfileAttributeFilter` builds from the schema
(`availableAttributesByKey`, `definedAttributesByKey`) change: from a one-level loop to a recursive
walk that accumulates the path prefix. That walk is extracted into a small shared `SchemaPaths`
helper so both maps (and, later, A17) build paths one way.

### 3.2 `order` — dropped in favour of array position

`order` (an `Integer` on `SportAttributeGroup`, `SportAttributeDefinition`, `SportAttributeField`,
and their three `Resolved*` twins) is removed.

- Children are already a strict ordered tree in v3 — the array **is** the order.
- Nothing in the backend has ever sorted by `order`: `SportAttributeSchemaLabelResolver` copies it
  through and no comparator anywhere reads it. The client ticket that was going to honour it
  (`SPORT-7`) now honours array position instead.
- Keeping a redundant field that the two orderings could disagree on is a bug surface with no
  upside.

The seeded Badminton document carries `order` on every node today; the v3 migration (§5) rewrites
it without them.

### 3.3 Path grammar — `/` separator, full-path only

- **Separator: `/`.** The key pattern `^[a-z][a-zA-Z0-9_]*$` cannot contain `/`, so a path splits
  unambiguously on `/` with **no escaping rules** at any layer.
- **No shorthand.** A reference is always the complete path from the schema root
  (`gear/rackets/tension`). A bare leaf key (`tension`) is **not** accepted anywhere — accepting it
  would require "unique sport-wide, or else ambiguous" resolution, i.e. exactly the sport-wide
  uniqueness this ticket removes, reintroduced as a soft rule.
- A path never has a leading or trailing `/` and never an empty segment.

### 3.4 Sibling namespace — one per parent, shared by sub-groups and attributes

Within a single parent group, the set of child sub-group keys and the set of child attribute keys
are validated as **one** namespace: `gear` may not have both a sub-group `rackets` and an attribute
`rackets`. This is what makes `gear/rackets` unambiguous without needing to know whether the last
segment is a group or a leaf. At the schema root there are only groups, so root siblings are the
top-level group keys.

### 3.5 A17 reconciliation — A19 owns the grammar, A17 owns the reference field

A19 introduces **no schema field that holds a node path.** `definitionRef` is a registry name, not
a path; nothing in v2 references one node from another. The only A19 consumer of the path grammar
is the storage key.

A17 (session attribute schema) is where a node *reference* first appears — its `#ref` node kind
points a session attribute at a profile-schema node. A19 must land first because A17's originally
filed grammar, `{ "#ref": "<bare profileAttributeKey>" }`, assumes the sport-wide key uniqueness
A19 removes. Post-A19 that becomes `{ "#ref": "<full/path>" }`, resolved with the same
`SchemaPaths` helper, and A17 carries the dangling-path → `400` validation for it. A Delta to that
effect is filed on the A17 ticket.

### 3.6 Caps — neither changes

`MAX_SCHEMA_BYTES` (16KB) and `MAX_ATTRIBUTES_BYTES` (4KB) are unchanged.

Path-keyed storage lengthens **only the top-level keys** of `UserSportProfile.attributes`, and only
by each key's group-path prefix — the nested record fields (`id`, `value`, `system`, …) live inside
the values and are untouched. A maximal realistic Badminton profile has 6 top-level keys; the v3
prefixes (`general/` ×2, `gear/` ×4) add **≈ 36 bytes**. Against the A15 measurement of that same
profile — 715 B today, 1,331 B once Equipment linking adds a UUID per reference, versus the 4096 B
cap — that is noise. Deeper nesting is additive per key, never multiplicative, and only for the
handful of keys a profile actually stores. Per the v2 §13 rule, a cap is raised against a
measurement, not a hypothetical; there is no measurement here that asks for one.

## 4. Document shape (v3)

```jsonc
{
  "defaultLocale": "en",
  "definitions": [ /* unchanged from v2 (§5) */ ],
  "groups": [
    {
      "key": "gear",
      "label": { "en": "Gear" },
      "isAvailable": true,
      "attributes": [
        { "key": "shoeSize", "label": { "en": "Shoe size" }, "type": "STRING" }
      ],
      "groups": [
        {
          "key": "rackets",
          "label": { "en": "Rackets" },
          "isAvailable": true,
          "attributes": [
            { "key": "tension", "label": { "en": "Tension" }, "type": "NUMBER", "min": 15, "max": 35 }
          ]
        }
      ]
    }
  ]
}
```

Valid paths above: `gear/shoeSize`, `gear/rackets/tension`. A v2 document (flat groups, no nested
`groups`, `order` present) remains structurally valid as v3 — a flat group list is just the
zero-nesting case, and a stray `order` key deserialises away. The v3 migration still rewrites the
one seeded document into clean v3 form (§5).

## 5. Migration — `V061__sport_schema_v3_nested_groups.sql`

Registered in `db.changelog-master.xml` after V060. Both statements idempotent, scoped to
`sports.name = 'Badminton'` (the only sport with a seeded schema — A15; Pickleball is still
unseeded).

1. **Schema document.** `UPDATE sports SET attributes_schema = '<full v3 Badminton JSON>'::jsonb` —
   the A15 document with every `order` key removed, structure otherwise identical (Badminton has no
   nesting to introduce). Written literally into the migration for reproducibility; the authoritative
   copy is [`A19_BADMINTON_SCHEMA_V3.json`](../../modules/sport/sport-impl/docs/MVP/A19_BADMINTON_SCHEMA_V3.json)
   beside the ticket, and an IT re-`PUT`s it through `SportAttributeSchemaValidator` to prove it is
   valid under v3 rules.
2. **Profile rows.** For Badminton `user_sport_profiles`, remap the top-level `attributes` keys:
   `handedness → general/handedness`, `playstyle → general/playstyle`, `rackets → gear/rackets`,
   `racketString → gear/racketString`, `shuttlecocks → gear/shuttlecocks`,
   `footwear → gear/footwear`. Skipped for any row that already has a `/`-bearing key, so a re-run is
   a no-op. Row volume is ~zero pre-launch, but the statement exists and is covered.

`:server:test` runs against a hand-maintained H2 `schema.sql`, not the Liquibase changelog, so V061
itself is exercised by `:server:bootRun` against the dev Postgres plus a row check — the ITs cover
the v3 *shape* round-tripping the JSONB column, not the migration mechanism.

## 6. Code touch-list

| File | Change |
|---|---|
| `SportAttributeGroup` (api) | `+ List<SportAttributeGroup> groups`; `- Integer order`; javadoc: groups namespace children by path, `key` **and tree position** immutable-by-policy |
| `SportAttributeDefinition` (api) | `- Integer order`; javadoc: key is sibling-unique, stored under its full path |
| `SportAttributeField` (api) | `- Integer order` |
| `ResolvedSportAttributeGroup` (api) | `+ List<ResolvedSportAttributeGroup> groups`; `- Integer order` |
| `ResolvedSportAttributeDefinition`, `ResolvedSportAttributeField` (api) | `- Integer order` |
| `SchemaPaths` (impl, **new**) | recursive walk of `groups` → `Map<path, DefinedAttribute>`; an available-view that omits any leaf under an `isAvailable:false` ancestor at any depth |
| `ProfileAttributeFilter` (impl) | its two schema-lookup maps delegate to `SchemaPaths`; `filter`/`retainDefined`/`filterValue` bodies unchanged |
| `SportAttributeSchemaValidator` (impl) | `validate` recurses the group tree; per-parent single sibling namespace (sub-groups ∪ attributes); sport-wide accumulator sets deleted |
| `SportAttributeSchemaLabelResolver` (impl) | `resolveGroup` recurses into `groups`; `.order(...)` calls removed |
| `V061__sport_schema_v3_nested_groups.sql` + master changelog | §5 |

No controller, `SecurityConfig`, `SportServiceImpl`, `UserSportProfileServiceImpl`, or
`SportAttributeValues` change. `GET`/`PUT /api/sports/{sportId}/attribute-schema` keep their paths,
methods, and auth — only the response/request body nests.

## 7. Client impact

`GET /api/sports/{sportId}/attribute-schema` now returns `ResolvedSportAttributeSchema` with a
nested `groups` tree, and `UserSportProfileResponse.attributes` is path-keyed. The client
hand-mirrors both in `client/src/shared/types/sport.ts` and consumes them in `SportAttributesFields`
and the PROFILE-4 sport-profile editor. Folded into client **SPORT-7** (scope amended 2026-09-06):
v3 nested-`groups` recursion, the v3 type mirror, and path-keyed `attributes` read/write; SPORT-7's
"honor `order`" becomes "honor array position".

## 8. Out of scope

Inline / anonymous record shapes (the registry covers reuse); a cross-sport definition/enum
registry (still deferred, v2 §15); client rendering of nested groups (client SPORT-7);
discovery / ranking on nested paths; the `#ref` reference field and its validation (A17).

## 9. Notification triggers

None surfaced during scoping.
