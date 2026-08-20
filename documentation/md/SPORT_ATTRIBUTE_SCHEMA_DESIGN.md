# Sport Attribute Schema — Design

**Status:** Approved design, not yet implemented
**Date:** 2026-08-20
**Scope:** `modules/sport/sport-impl` (storage, validation, endpoints) + `client` (new `/admin`
area, schema editor). Cross-cutting, so it lives in `documentation/md/` rather than a single
module's `docs/` folder.
**Tickets:** `A9` (backend, `modules/sport/sport-impl`), `ADMIN-1` + `ADMIN-2` (client)
**Rescopes:** client `SPORT-2` (from a static config to rendering this schema) — see §8

---

## 1. Problem

`UserSportProfile.attributes` is a schema-less JSONB `Map<String, Object>` (shipped by **A3**,
`DONE` 2026-07-03). A3 deliberately did **no** per-key validation — only a 4KB total-size cap — and
assigned "which keys make sense for which sport" to the frontend as a static config object,
explicitly rejecting a `sport_attribute_definitions` table as over-engineering at the time.

Three real consequences of that:

1. **No server-side key validation.** A typo'd key from any client persists silently, forever.
2. **No delete-a-key path.** `updateProfile()` merges rather than replaces, so a client can
   overwrite a key's value but cannot remove it — setting it to `null` stores a JSON null rather
   than dropping the key. The server can't safely offer replace semantics because it doesn't know
   the legitimate key set.
3. **Adding a sport requires a client deploy** before that sport has any attributes at all, since
   the key list lives in client TypeScript.

The catalog is also no longer static in the way A3 assumed: **SPORT-3** made `SportKey` a live
`string` derived from `GET /api/sports` rather than a closed union, and **A6** re-scoped the MVP
catalog to Badminton + Pickleball. A hardcoded client-side map is increasingly out of step with a
backend-driven, admin-managed catalog.

## 2. Decision

Each sport owns an **attribute schema** — a tree of attribute definitions — stored server-side,
readable by the client, and editable by an admin.

Reversing A3's "no schema storage" call is deliberate and is recorded here rather than slipped in.
What changed since July is not the cost of the machinery but the requirements around it: attributes
must now be **admin-manageable at runtime**, individually **soft-deletable**, and **grouped for
display**. None of those were on the table when A3 chose a static frontend config.

### 2.1 The schema is a tree; the stored data stays flat

Attributes are organised hierarchically — a level-1 **group** node holds level-2 **attribute**
nodes. For Badminton, a `Gear` group holds `racket`, `shuttlecock`, `shoes`.

**This nesting is presentation and organisation only.** `UserSportProfile.attributes` remains the
flat `Map<String, Object>` A3 already ships; leaf keys are unique per sport, so a profile's stored
value never needs to mirror the tree. A3's entity, its `V025` migration, and its merge semantics
are untouched by this design — that is a property worth protecting, not an accident.

### 2.2 Storage: one JSONB document per sport

`sports.attributes_schema JSONB` — 1-1 with the sport row, holding the whole tree.

The alternative considered and rejected was a relational `sport_attribute_definitions` table (one
row per attribute, adjacency-list `parent_id` for the tree). It was in fact the leading candidate
until two requirements landed:

| | JSONB document | Definitions table |
|---|---|---|
| **Tree** | Native — the document *is* a tree; depth changes are free | Adjacency list + assembly on every read; depth changes become migrations |
| **Admin editing** | Whole-document replace, which is exactly the paste-the-schema workflow | Row-level CRUD screens — strictly more UI work for an admin-only surface |
| **Adding config later** | No DB migration at all; unknown-to-old-code keys default | Every new property = Liquibase + entity + DTO change |
| **Read cost** | Rides the existing `SportLookupCache` for free | New query + its own cache + eviction wiring |
| **Key uniqueness** | Enforced in the write validator (§4) | Enforced by a DB `UNIQUE` constraint |
| **Concurrent admin edits** | Last write wins on the whole document | Naturally row-scoped |

The last row is the only genuine loss, and it is theoretical here: with a copy-paste workflow,
whole-document replace is the *intended* semantic, not a hazard, and admin writes are rare and
effectively single-user. If it ever matters, an optimistic check against `sports.updated_at` closes
it without changing the storage shape.

**"Adding config later" is the criterion that actually decides it.** The requirement is explicitly
"we can add more properties later"; JSONB makes that free and a table makes it a migration every
time.

### 2.3 Not JSON Schema

The document is a **constrained field-descriptor tree**, not draft-07 JSON Schema. JSON Schema
describes data validity, not UI: it carries no label, no ordering, no widget type, so it would need
an `x-ui` hints layer bolted alongside it — the worst of both. It would also pull a validator
dependency onto both sides (a Java validator, plus `ajv` on the client) to express constraints that
a few dozen lines of hand-rolled validation cover.

`type` is a **closed** set, not free-form. This is a trust boundary as much as a simplicity choice:
admin-authored data drives client rendering, so the renderer must only ever accept node types it
already knows how to draw.

## 3. Document shape

```jsonc
// sports.attributes_schema
{
  "version": 1,                    // document format version, for future readers
  "groups": [
    {
      "key": "gear",
      "label": "Gear",
      "isAvailable": true,
      "order": 1,
      "attributes": [
        {
          "key": "racket",         // unique across the WHOLE sport, not just this group
          "label": "Racket",
          "type": "STRING",
          "isAvailable": true,
          "order": 1,
          "defaultValue": null
        },
        {
          "key": "shuttlecock",
          "label": "Shuttlecock",
          "type": "ENUM",
          "options": [
            { "value": "feather", "label": "Feather" },
            { "value": "nylon",   "label": "Nylon" }
          ],
          "isAvailable": true,
          "order": 2,
          "defaultValue": "nylon"
        }
      ]
    }
  ]
}
```

**Node types** (`type`), starting deliberately small — extend only when a real attribute needs it,
per this codebase's standing "don't design for hypothetical future requirements" rule:

| `type` | Stored value in `UserSportProfile.attributes` | Notes |
|---|---|---|
| `STRING` | `String` | Free text |
| `ENUM` | `String` | Must be one of `options[].value` |
| `LIST` | `List<String>` | Each element must be one of `options[].value` (multi-select) |

`NUMBER` and `BOOLEAN` are the obvious next additions; they are not in scope until something needs
them.

A sport with no schema at all (`NULL` column) behaves exactly as today: no attributes offered, and
`attributes` accepts nothing. This is the correct default for every existing row, so the migration
needs no backfill.

## 4. Write-side validation (server)

The whole document is validated on write and **rejected atomically** — a bad paste must never
half-apply. Hand-rolled in Java, no JSON Schema library:

- `type` is one of the known values.
- **Leaf keys are unique across the entire sport**, not per group. This is what keeps the stored
  profile map flat (§2.1); it is the single most important invariant here.
- Group keys are unique among groups.
- `ENUM`/`LIST` nodes carry a non-empty `options` array with unique `value`s.
- `defaultValue`, when present, is valid for its own node's `type` (and for `ENUM`/`LIST`, is one of
  its own options).
- Keys match a conservative pattern (`^[a-z][a-zA-Z0-9_]*$`) so they are safe as JSON object keys
  and as client form field names.
- The serialized document respects a size cap, mirroring A3's existing `MAX_ATTRIBUTES_BYTES`
  approach on the profile side.

## 5. `isAvailable` — soft delete

Every node, group and attribute alike, carries `isAvailable`. Nodes are **never deleted** from the
document by normal admin editing; they are switched off.

- **A soft-deleted group hides its whole subtree.** Children do not need to be individually
  deactivated, and a child's own `isAvailable: true` does not resurrect it under an unavailable
  parent. Parent state wins.
- **Unavailable attributes are not offered** on profile create/update — the server rejects a write
  targeting one — **but existing stored values remain readable and are still returned** by
  `UserSportProfileResponse.attributes`. Nothing a user already saved is destroyed by an admin
  toggling a field off.

### 5.1 Schema evolution policy

The hard question this design has to answer up front is what happens to profile rows already
holding a key whose definition later changes. The policy:

- **Deactivate, don't delete.** Turning `isAvailable` off is the supported way to retire an
  attribute; it is non-destructive by construction (above).
- **Options are additive.** Adding an `ENUM`/`LIST` option is always safe. Removing one that
  profiles may already hold is not, and is handled the same way — leave the option in place and
  retire the whole attribute if it is genuinely dead.
- **Keys are immutable.** Renaming a key orphans every stored value silently. To "rename", add a
  new attribute and deactivate the old one.
- **Stale keys are tolerated on read**, never silently dropped. A profile may hold keys with no
  current definition (retired attributes, or data written before this feature). Reads pass them
  through; only *writes* are validated against the live schema.

This makes migration of existing rows a non-problem rather than a recurring chore, and it is far
easier to relax later than to retrofit.

## 6. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/sports/{sportId}/attribute-schema` | authenticated | The sport's schema for client rendering |
| `PUT /api/sports/{sportId}/attribute-schema` | `hasRole('ADMIN')` | Replace the whole document |

`@PreAuthorize("hasRole('ADMIN')")` matches the pattern `SportController` already uses for sport
create/update/delete.

**The schema is deliberately NOT added to `SportResponse`.** `GET /api/sports` returns the entire
catalog; serialising every sport's full tree into it would inflate every catalog fetch in the app
for data that only two screens need. A dedicated per-sport endpoint keeps the catalog lean.

### 6.1 Caching

The column sits on `sports`, so it rides `SportLookupCache` — which already caches whole `Sport`
entities via `getAllSportsById()` and already calls `evictAll()` after every admin write. Admin
schema edits therefore invalidate correctly with **zero new cache wiring**.

This matters more than it first appears: profile create/update must validate against the schema on
*every* write, and this makes that lookup an in-memory hit rather than a new query per write.

## 7. Profile write path (the payoff)

With a known key set, `UserSportProfileServiceImpl` can finally validate `attributes` on
`createProfile()`/`updateProfile()`: unknown key → reject; value not valid for its node's `type` →
reject; write targeting an unavailable attribute → reject.

Consequence: A3's merge-only semantics can safely become "replace within the schema", which closes
the **no delete-a-key** gap from §1. Whether to make that change in `A9` or defer it is left to the
ticket — it is a behaviour change to an existing shipped endpoint and deserves its own decision.

## 8. Relationship to client `SPORT-2`

`SPORT-2` originally built a **static** `sportAttributeConfig.ts` holding the per-sport attribute
key list — the frontend-owned config this design replaces with a server-driven one.

It was briefly closed as superseded on 2026-08-20 and **reinstated the same day (user decision)**,
because A9 and ADMIN-2 cover storing and admin-editing the schema but neither renders it to a
normal user on their own sport profile. That is what `SPORT-2` is for, and it is still wanted.

`SPORT-2` is therefore **rescoped, not closed**: same component, same purpose, but driven by a
schema fetched from §6 instead of a hardcoded map. The rescope was mandatory rather than cosmetic
— its original spec was keyed on `football`/`basketball`/`tennis` (deactivated by **A6**) and
assumed `SportKey` was a closed union (**SPORT-3** made it a live-derived `string`), so it could
not have been built as written regardless of this design.

The two client tickets are siblings over the same schema: **ADMIN-2 edits it, SPORT-2 renders it.**

## 9. Out of scope

- **The user-facing profile *page*.** `SPORT-2` builds the field-rendering component, but noted at
  filing that no page hosts per-sport attribute
  fields: `AddSportModal` deferred `bio`/`preferredPosition` to "a future profile-editing screen"
  that still isn't filed. This design makes that screen buildable; it does not build it.
- **A rich admin schema builder.** `ADMIN-2` is a JSON textarea by explicit choice (§ADMIN-2).
  Drag-to-reorder, per-field forms, and live preview are later enhancements.
- **`NUMBER`/`BOOLEAN` node types**, per §3.
- **Optimistic locking on concurrent admin edits**, per §2.2.
