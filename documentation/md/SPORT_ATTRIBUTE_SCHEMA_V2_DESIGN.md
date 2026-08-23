# Sport Attribute Schema — v2 Design

**Status:** Design approved, not implemented
**Date:** 2026-08-24
**Extends:** `SPORT_ATTRIBUTE_SCHEMA_DESIGN.md` (v1, 2026-08-20), which stays the record of *why the
schema is server-side at all*. Read v1 first; this document does not re-argue its decisions.
**Implemented by:** backend `A12`, `A13`, `A14`, `A15`, `A16` (`modules/sport/sport-impl`);
client `SPORT-2` (rescoped), `SPORT-6`
**Origin:** a hand-written Badminton schema drafted by the user (IntelliJ scratch, 2026-08-23) that
v1's format could not express. The gap between that draft and what shipped is this document.

---

## 1. Where v1 landed

A9 (`DONE`) shipped a per-sport attribute schema as one JSONB document on `sports.attributes_schema`:

- a two-level tree — level-1 **group**, level-2 **attribute**
- a **closed** `type` set: `STRING`, `ENUM`, `LIST`
- `label` as a plain `String`
- leaf keys unique across the whole sport, which keeps `UserSportProfile.attributes` a **flat**
  `Map<String, Object>`
- strict, atomic validation on the admin `PUT`; lenient, never-throwing filtering on profile writes

It shipped **unseeded**. All 12 sports carry `NULL`. That fact does a lot of work in §11.

## 2. What v1 cannot express

The Badminton draft needs four things v1 has no room for:

| Need | v1 |
|---|---|
| A shoe has a *name* and a *size*, and a size has a *system* and a *value* | Values are `String` or `List<String>`. A record is unrepresentable. |
| A player owns several rackets, each a structured item | `LIST` is multi-select over a closed option set, not a repeating record |
| Labels in English and Vietnamese | `label` is one `String` |
| "Link this racket to a known item if we have one; otherwise keep what they typed" | No notion of an entity reference |

None of these is hypothetical. They are what a real sport's attribute set looks like once someone
sits down to write one.

## 3. What v2 adds

| Addition | Changes the stored profile value? | Section |
|---|---|---|
| `DEFINITION` / `DEFINITION_LIST` type kinds + a `definitions` registry | Yes — the value under a key becomes an object, or a list of objects | §5 |
| `isRequired` on definition fields, with a drop-the-record cascade | No | §6 |
| Localized `label` maps + `defaultLocale` | No — display only | §7 |
| `Reference` convention + `searchScope` for entity linking | No beyond §5 | §8 |

**The key invariant survives intact.** Attribute keys stay unique across the whole sport and stay
flat in `UserSportProfile.attributes`. Only the *value* under a key gains structure, and that map is
already declared `Map<String, Object>` — values were always untyped. So A3's entity, its `V025`
migration, the 4KB cap and merge-by-top-level-key are **untouched by v2**, exactly as v1 §2.1 kept
them untouched. That is the property to protect when reviewing any change here.

## 4. Document shape

```jsonc
// sports.attributes_schema, version 2
{
  "version": 2,
  "defaultLocale": "en",

  // §5.4 — sport-local type registry
  "definitions": [
    { "name": "Reference", "fields": [
        { "key": "id",    "label": { "en": "Item", "vi": "Sản phẩm" }, "type": "STRING", "isRequired": false, "order": 1 },
        { "key": "value", "label": { "en": "Name", "vi": "Tên" },      "type": "STRING", "isRequired": true,  "order": 2 }
    ] },
    { "name": "ShoeSize", "fields": [
        { "key": "system", "label": { "en": "System", "vi": "Hệ" }, "type": "ENUM", "isRequired": true, "order": 1,
          "options": [ { "value": "US", "label": { "en": "US", "vi": "US" } },
                       { "value": "UK", "label": { "en": "UK", "vi": "UK" } },
                       { "value": "EU", "label": { "en": "EU", "vi": "EU" } },
                       { "value": "JP", "label": { "en": "JP", "vi": "JP" } } ] },
        { "key": "value",  "label": { "en": "Size", "vi": "Cỡ" }, "type": "STRING", "isRequired": true, "order": 2 }
    ] },
    { "name": "Shoe", "fields": [
        { "key": "shoe", "label": { "en": "Shoe", "vi": "Giày" }, "type": "DEFINITION",
          "definitionRef": "Reference", "isRequired": true,  "order": 1 },
        { "key": "size", "label": { "en": "Size", "vi": "Cỡ" },  "type": "DEFINITION",
          "definitionRef": "ShoeSize",  "isRequired": false, "order": 2 }
    ] }
  ],

  "groups": [
    { "key": "general", "label": { "en": "General", "vi": "Thông tin chung" },
      "isAvailable": true, "order": 1,
      "attributes": [
        { "key": "handedness", "label": { "en": "Hand", "vi": "Tay thuận" },
          "type": "ENUM", "isAvailable": true, "order": 1,
          "options": [ { "value": "LEFT",  "label": { "en": "Left hand",  "vi": "Tay trái" } },
                       { "value": "RIGHT", "label": { "en": "Right hand", "vi": "Tay phải" } } ] },
        { "key": "playstyle", "label": { "en": "Playstyle", "vi": "Lối chơi" },
          "type": "ENUM", "isAvailable": true, "order": 2, "defaultValue": "BALANCE",
          "options": [ { "value": "ATTACK",  "label": { "en": "Attack",  "vi": "Tấn công" } },
                       { "value": "BALANCE", "label": { "en": "Balance", "vi": "Cân bằng" } },
                       { "value": "DEFENSE", "label": { "en": "Defense", "vi": "Phòng thủ" } } ] }
      ] },

    { "key": "gear", "label": { "en": "Gear", "vi": "Trang bị" },
      "isAvailable": true, "order": 2,
      "attributes": [
        { "key": "rackets",      "label": { "en": "Rackets", "vi": "Vợt" },
          "type": "DEFINITION_LIST", "definitionRef": "Reference",
          "searchScope": "equipment.racket.badminton", "isAvailable": true, "order": 1 },
        { "key": "racketString", "label": { "en": "String", "vi": "Dây vợt" },
          "type": "DEFINITION_LIST", "definitionRef": "Reference",
          "searchScope": "equipment.string.badminton", "isAvailable": true, "order": 2 },
        { "key": "shuttlecocks", "label": { "en": "Shuttlecocks", "vi": "Quả cầu" },
          "type": "DEFINITION_LIST", "definitionRef": "Reference",
          "searchScope": "equipment.shuttlecock", "isAvailable": true, "order": 3 },
        { "key": "footwear",     "label": { "en": "Footwear", "vi": "Giày" },
          "type": "DEFINITION_LIST", "definitionRef": "Shoe",
          "searchScope": "equipment.shoe.court", "isAvailable": true, "order": 4 }
      ] }
  ]
}
```

A profile storing against it:

```jsonc
// user_sport_profiles.attributes — still a FLAT map of unique keys
{
  "handedness": "RIGHT",
  "playstyle": "ATTACK",
  "rackets": [ { "id": null, "value": "Yonex Astrox 88D Pro" } ],
  "footwear": [ { "shoe": { "id": null, "value": "Yonex Aerus Z2" },
                  "size": { "system": "US", "value": "9" } } ]
}
```

## 5. Definition types

### 5.1 Two kinds, not a parametrized type

`SportAttributeType` gains exactly two members: `DEFINITION` (one record) and `DEFINITION_LIST` (a
list of records). It stays a **closed enum**, now of five.

`LIST` is deliberately **not** overloaded. In v1 `LIST` means "multi-select over `options`" and the
validator hard-requires non-empty `options` for it. A repeating record is a different feature with
different validation and a completely different form control. Extending `LIST` would mean
conditionally relaxing a rule that already ships and is already tested; a second member leaves every
existing `LIST` code path literally unchanged. The cost is one slightly redundant-looking enum
member, which is the cheaper side of that trade.

### 5.2 The reference is a field, not syntax inside `type`

Rejected: `"type": "#Shoe"` and `"type": "LIST:#Shoe"` (the draft's shape). Adopted:

```jsonc
{ "type": "DEFINITION",      "definitionRef": "Shoe" }
{ "type": "DEFINITION_LIST", "definitionRef": "Shoe" }
```

Three reasons, in order of weight:

1. **`type` stays a Jackson-deserializable enum.** A sigil syntax makes it a free-form `String`
   needing a custom deserializer on the server and a parser on the client.
2. **Both switch statements stay exhaustive.** `SportAttributeSchemaValidator` and the client
   renderer both `switch` on `type`; a compiler-checked exhaustive switch is what turns "we forgot to
   handle a case" into a build failure instead of a blank form field.
3. **v1 §2.3's trust boundary survives.** The *kinds* remain closed even though the *shapes* are
   admin-authored, so the renderer still only ever draws node types it already knows.

### 5.3 Depth 2, and why cycle detection is unnecessary

One rule:

> A definition referenced **by another definition** may contain only primitive fields
> (`STRING`, `ENUM`, `LIST`).

Consequences worth stating explicitly:

- `Shoe` (outer) may hold `#Reference` and `#ShoeSize`; those hold only primitives. The draft's
  intended shape is expressible.
- **Cycles are structurally unrepresentable, so no visited-set, no depth counter, and no traversal is
  needed.** A cycle `A → B → A` requires `B` to reference `A`, but `B` sits in inner position and may
  hold only primitives. A self-reference `A → A` puts `A` in both positions, same contradiction. This
  is not a runtime check that happens to pass — it is a property of the rule.
- A definition field may **not** be `DEFINITION_LIST`. This bounds a stored value at three levels of
  JSON nesting (attribute list → record → nested record → primitive) and keeps the client's nested
  form rendering finite.
- A definition may appear in **both** positions, as `Reference` does — legal precisely because it is
  primitives-only.

The rejected alternative was arbitrary depth with a cap plus cycle detection. It buys nesting nobody
has asked to render, and pays for it with a traversal and a class of admin-authored input that hangs
the validator.

### 5.4 The registry is sport-local

`definitions` sits beside `groups` in the same document, as an **array with an explicit `name`** —
matching how `groups`, `attributes` and `options` already work, so the validator checks name
uniqueness exactly the way it checks group keys today. A name-keyed map would prevent duplicates
structurally, but inconsistency *within one document* is the worse trade.

Badminton and tennis therefore each declare their own `ShoeSize`. That duplication is accepted:

- every document stays **self-contained and pasteable**, which is `ADMIN-2`'s entire workflow
- editing one sport's schema has **zero blast radius** on any other sport
- it needs no new table, no new cache, and no new eviction wiring

A cross-sport registry is a separate, later problem — the same call v1 §2.2 made about the schema
itself, for the same reasons.

### 5.5 `defaultValue` is not supported on definition types

The validator rejects `defaultValue` on `DEFINITION` and `DEFINITION_LIST`. A prefilled record reads
as the user's own data rather than a placeholder, and supporting it doubles the validator's
default-checking surface for no requested benefit. Easy to relax later; hard to un-ship.

## 6. Required and optional fields

Every definition field carries `isRequired: boolean` (default `false`). One rule:

> **A record is valid iff every required field is present and valid.** An invalid *optional* field is
> dropped on its own and the record survives. A missing or invalid *required* field invalidates the
> whole record.

| Submitted | Result |
|---|---|
| `Shoe { size: {...} }` — `shoe` required, absent | whole `Shoe` dropped |
| `Shoe { shoe: {...}, size: <garbage> }` | `size` dropped, `Shoe` kept |
| `ShoeSize { system: "US" }` — `value` required, absent | whole `ShoeSize` dropped |
| `Shoe { shoe: {...}, size: { system: "US" } }` | `ShoeSize` invalid → dropped; `size` optional in `Shoe` → `Shoe` kept |

The cascade propagates upward exactly one level, and §5.3's depth-2 rule means it can never propagate
further. Had `size` been `isRequired: true`, dropping `ShoeSize` would have dropped `Shoe` too — that
chain is the rule working, not a defect.

### 6.1 `isRequired` is scoped to records only

It does **not** apply to top-level attributes. "You must set handedness before you can save" is a
different feature that would change A9's shipped contract, under which a profile write never fails on
`attributes` content — only on size. Keep that contract; if per-attribute requiredness is ever
wanted, it needs its own ticket and its own decision about what a failed profile save looks like.

### 6.2 The client is strict, the server is lenient — deliberately

The same `isRequired` flag drives two different behaviours:

| | On a violation |
|---|---|
| **Client** (form validation on save) | blocks the save, shows an error, keeps the user's input |
| **Server** (`ProfileAttributeFilter`) | silently drops, and the rest of the write proceeds |

This asymmetry is intended, and it has two corollaries that must be honoured on both sides:

- The **server must never assume the client enforced anything.** A `curl` caller exists.
- The **client must not read a `200` as "everything I sent was stored."** It was not necessarily.

## 7. Localization

### 7.1 Why the labels live in the schema

Attribute labels are **admin-authored, dynamic content**. They cannot live in a client translation
bundle, because the client does not know which attributes exist until it fetches the schema. Unlike
static app strings, there is no other correct home for them.

The scheduling argument that i18n "isn't shipped yet" is a separate question from placement, and it
does not survive contact with the authoring window: whoever configures Badminton is bilingual
*today*. If the format holds one string, those translations are discarded and someone must
reconstruct them later, for content authored by a person who may no longer be around.

### 7.2 Shape

```jsonc
{ "version": 2, "defaultLocale": "en", ... }
{ "key": "handedness", "label": { "en": "Hand", "vi": "Tay thuận" } }
```

`label` becomes a `Map<String, String>` on **every** labeled node: `SportAttributeGroup`,
`SportAttributeDefinition`, `SportAttributeOption`, and the new definition-field node. Localizing
group headers but not option values would render a Vietnamese heading over an English dropdown, which
is worse than no localization at all.

Locale codes are **BCP 47** (`en`, `vi`, `en-US`, `vi-VN`) so they match what browsers actually send
in `Accept-Language`. Not `vn` — that is the ISO 3166 country code and matches nothing.

### 7.3 Resolution

Order: **exact locale → language-only (`vi-VN` → `vi`) → `defaultLocale`**.

The validator enforces the rule that makes this total: **every labeled node must carry an entry for
the document's `defaultLocale`.** A missing label is then caught at `PUT` time by the admin who can
fix it, never at render time by a user staring at a blank field.

### 7.4 Who resolves — and where

The split maps onto endpoints A11 already built:

| Endpoint | Labels |
|---|---|
| `GET /api/sports/{sportId}/attribute-schema` (authenticated) | **resolved** — one string per node |
| `GET /api/sports/all/{sportId}/attribute-schema` (admin) | **raw maps** — the editor must see every locale |

No new endpoints. The split localization needs is the split A11 already had to build for a different
reason.

**Resolution belongs in `SportController`, not in `SportService.getAttributeSchema`.** That service
method is also called by `UserSportProfileServiceImpl` on *every* profile create and update
(`:79`, `:237`) to filter submitted attributes — a path that never touches labels. Resolving inside
it would do per-locale work on every profile write for nothing. Resolve **after** the cache read, on
the way out of the `GET` only, so `SportLookupCache` keeps caching one locale-independent document.

Cost of server-side resolution: switching language requires a refetch. Accepted.

### 7.5 Where the locale comes from

`Accept-Language`, today. It is standard, already on every request, and needs no new field in any
domain. A `User.preferredLocale` may override it later when a settings screen exists. This is
precisely why §7.1's placement argument holds without waiting on any i18n infrastructure — and the
client currently has none (no i18n library in `client/package.json`).

## 8. Entity references

### 8.1 The pattern

`Reference` is an **entity link with a free-text fallback**, not a value type:

```jsonc
{ "name": "Reference", "fields": [
    { "key": "id",    "type": "STRING", "isRequired": false },   // set iff linked to a known item
    { "key": "value", "type": "STRING", "isRequired": true  } ]  // display text
}
```

The user types a racket; the client searches; they either pick a known item (`id` set) or keep their
own text (`id` null).

**`id` is declared now even though nothing populates it.** That makes "unlinked" a first-class state
from day one rather than a legacy artifact — which means that when an Equipment domain ships there is
**no migration and no backfill**, only a field that starts getting populated. Adding `id` afterwards
would instead leave every existing `{ value }` as a distinct legacy shape to detect and reconcile.

`value` is required because a reference with an id and no text is unrenderable without a
cross-domain call on a read path.

### 8.2 No `url` field

Considered and rejected. When linked, the catalogue owns the canonical URL and copying it onto the
profile is denormalization that goes stale on the first catalogue edit. When unlinked, the only
source is a user pasting one — and a pasted URL cannot be filtered on, cannot be deduplicated (one
racket has ten shop URLs), and contributes nothing to §8.4's suggestion corpus, which aggregates over
`value` alone.

The stronger reason is that it would ship a field whose whole purpose is holding user-supplied links
rendered on a public profile: scheme allowlisting, `rel="noopener noreferrer"`, and a standing
spam/phishing vector, permanently. Omitting the field deletes all of it.

Precisely: the hazard was never *storing* a URL — it is *rendering* one as a link. Users will paste
URLs into `value` regardless, and that is fine, because `value` renders as text.

Re-adding `url` later is one optional field in a JSONB document — no migration. The asymmetry is on
the other side: user-pasted links cannot be un-spilled once profiles carry them.

### 8.3 `searchScope` belongs on the attribute

```jsonc
{ "key": "rackets",  "type": "DEFINITION_LIST", "definitionRef": "Reference", "searchScope": "equipment.racket.badminton" }
{ "key": "footwear", "type": "DEFINITION_LIST", "definitionRef": "Shoe",      "searchScope": "equipment.shoe.court" }
```

Optional. Absent ⇒ plain free text, no typeahead.

It cannot live on the *definition*, because one `Reference` type serves many pools. And it cannot be
*derived*, because the granularity is product knowledge the server has no way to infer:

- **Rackets do not pool.** Badminton, tennis and squash rackets share a word and nothing else.
- **Court shoes do pool.** Badminton, squash and indoor tennis players buy substantially the same
  shoes.
- **Running shoes would not** belong in that same pool.

The rule: **a scope should be exactly as wide as the set of items that are genuinely
interchangeable.** Two attributes in the same sport may share a scope, which confirms it is a pool
name rather than an attribute identity.

The alternative — the client hardcoding "if `definitionRef === "Reference"`, render a search box" —
works, but puts a magic type name in the renderer and quietly ends the property that the schema is
fully data-driven.

### 8.4 Suggestions before any catalogue exists

There is no Equipment domain yet, so "known items" are bootstrapped from **what users have already
typed**: distinct `value`s stored across profiles for a given `searchScope`, ranked by frequency.

Nothing in that list is verified and **nothing in it carries an `id`**:

| Action | `value` | `id` |
|---|---|---|
| Picks a suggestion | the suggested string | `null` |
| Picks a catalogue item (later) | the item's name | set |
| Types something new | their text | `null` |

It is **spelling convergence, not linking**. The UI must not present suggestions as verified, or the
link-rate figure in §8.6 will measure something that does not exist.

The search response carries an optional `id` from day one:

```jsonc
[ { "id": null,     "value": "Yonex Astrox 88D Pro" },
  { "id": "eq_123", "value": "Yonex Astrox 99 Pro"   } ]
```

Today every result has `id: null`; when Equipment ships, the same endpoint starts returning some that
do and **the client does not change**. The response shape mirrors the storage shape, and both treat
unlinked as normal rather than as a missing case.

Once both sources exist they must be **deduplicated on the normalized value, preferring the catalogue
entry** — otherwise the same racket appears twice, once linkable and once not, and users pick the
wrong one about half the time.

**A frequency floor of N distinct users** gates promotion into the list. Distinct users, not
occurrences, or one person re-editing their profile promotes their own string. That single threshold
does two jobs: one-off typos never become suggestions, and nothing a single user typed is ever shown
to anyone else — which is what makes surfacing raw user text acceptable at all.

Aggregation must not run per keystroke. It extracts distinct values out of JSONB across all profiles,
so it wants a cached or periodically-refreshed aggregate.

**It is self-reinforcing, including its mistakes.** If enough people misspell the same way, the
misspelling becomes a suggestion and gets reinforced. That is acceptable, and the reason is worth
stating: convergence on a *wrong* string is still convergence. It is corrected once, when the
catalogue is seeded, instead of reconciled 400 times.

**Start it with the attribute, not later.** The value of aggregation compounds only while there is no
catalogue. Free text running unaided for a year yields a mess to aggregate; running with suggestions
from day one yields a corpus that has been quietly converging the whole time.

### 8.5 Resolving to real entities, later

When an Equipment domain ships:

1. **Seed the catalogue from the aggregate.** The top-N aggregated strings *are* the initial
   catalogue content. Resolution for those rows is then exact-match by construction rather than a
   guess — this inverts the problem and is the single highest-leverage step.
2. **Exact match after normalization** (lowercase, trim, collapse whitespace, strip punctuation) —
   safe to auto-apply in a batch job.
3. **Fuzzy match** (`pg_trgm`, a standard contrib extension needing a `CREATE EXTENSION` migration,
   as PostGIS already does) — only above a high threshold, and better routed through step 4 than
   auto-applied. A wrong link silently misrepresents what someone owns.
4. **User-confirmed linking for the ambiguous middle** — on the next profile edit the client offers
   *"we found a match for 'astrox 88d pro' — link it?"* Confirmed by the person who owns the racket,
   which beats any similarity threshold and needs no risky bulk write.
5. **No confident match ⇒ leave `id` null.** Not a failure state, per §8.1.

**The backfill must be non-destructive: it sets `id` and never rewrites `value`.** A wrong match is
then revertible with `SET id = null` rather than a restore from backup, and the user never sees a
racket they did not type. Read-time resolution may *prefer* the catalogue name for display when `id`
is set; that gets the benefit without destroying the source. Provenance belongs in the job's own
audit log, not in a schema field — `DEFINITION_LIST`'s whole-list-replace semantics would wipe such a
field on the user's next edit anyway.

Expect a residue that never resolves and should not: `"Yonex"` alone is a brand, not a model. A
backfill that resolves most rows and honestly leaves the rest unlinked is a good outcome; one that
resolves everything guessed.

Cross-domain rules apply in full. Storing an id in JSONB is fine (it is an ID, not a JPA relation),
but any read-time resolution goes through an `-api` interface with a **batch** method
(`getItemsByIds(List<UUID>) → Map<UUID, Item>`), collecting ids across a whole page first. Per-item
resolution inside a `.map()` over a page is exactly the N+1 pattern the root `CLAUDE.md` forbids.

### 8.6 Why this is worth building properly

`PROGRESS.md` lists equipment as a **partner-matching filter**. Filtering, faceting and counting all
work on `id` and none of them work on free text. The **link rate** — the share of stored references
carrying a non-null `id` — is therefore the number that decides whether that roadmap feature is
buildable at all. That reframes the typeahead from a UX nicety into the mechanism that keeps a
planned feature possible.

## 9. Profile write path

`ProfileAttributeFilter` v2. It **never throws**; every failure is a drop. Size remains the only loud
rejection.

**Top level** — for each submitted `(key, value)`:

1. Key not in the sport's schema → **drop**
2. Its **group** has `isAvailable: false` → **drop** (parent wins, unchanged from v1)
3. The attribute itself has `isAvailable: false` → **drop**
4. `value == null` → **drop** (not a delete marker; that is still `A10`)
5. Validate by `type`:
   - `STRING` — is a `String`
   - `ENUM` — is a `String` ∈ `options[].value`
   - `LIST` — is a `List`, every element a `String` ∈ options; **empty list valid and stored**
   - `DEFINITION` — is a `Map`; run *validateRecord*; invalid → drop the key
   - `DEFINITION_LIST` — is a `List`; run *validateRecord* per element; **drop failing elements, keep
     the rest**; empty list valid and stored
6. Survivors **merge** over the stored map — top-level keys only, unchanged from A3
7. The 4KB `MAX_ATTRIBUTES_BYTES` check runs **last**, on the merged map

**validateRecord(map, definition):**

1. Drop field keys the definition does not declare — **before** the required check, so junk cannot
   satisfy a requirement
2. For each declared field present: validate against its type (primitive, or one nested definition).
   Invalid + optional → drop the field. Invalid + required → **record invalid**
3. Declared required field absent → **record invalid**
4. Otherwise return the surviving fields

### 9.1 Consequences

- **`DEFINITION_LIST` writes replace the whole list.** There is no element identity, and inventing one
  would be worse than the alternative. Decided explicitly.
- **`DEFINITION_LIST` therefore gets a working clear-the-value path for free** — `footwear: []` really
  erases it. `STRING`/`ENUM`/`DEFINITION` still cannot be cleared until `A10`. That inconsistency
  becomes user-visible, which makes `A10` more worth doing, not less.
- **Dropping a bad element from a list is silent data loss under replace semantics.** Submit three
  shoes with one malformed, get two back and no error. That is A9's shipped posture, so it stays —
  but it is sharper here than for a scalar, and §6.2's strict client is what actually protects the
  user.

## 10. Write-side validation

Everything v1 §4 already enforces, unchanged, plus:

**Document**
- `version` is 1 or 2. A document using any v2-only feature **must** declare `2`
- `defaultLocale` present and BCP 47 when the document is v2

**Labels**
- every labeled node carries an entry for `defaultLocale` (§7.3)
- locale keys are BCP 47

**Registry**
- definition `name` unique within the document; pattern `^[A-Z][a-zA-Z0-9]*$` (PascalCase — a type
  namespace, never stored in a profile, and visually distinct from a data key at a glance)
- field `key` unique within its definition; pattern `^[a-z][a-zA-Z0-9_]*$`, same as every other key
- every `definitionRef` resolves → **unresolved is a hard reject**
- a definition in inner position holds only primitives (§5.3)
- a definition field is never `DEFINITION_LIST` (§5.3)
- `ENUM`/`LIST` fields carry non-empty, unique options — same rule as attributes
- declared-but-unreferenced definitions are **allowed**; forbidding them makes incremental editing in
  a textarea miserable

**Attributes**
- `definitionRef` required for `DEFINITION`/`DEFINITION_LIST`, absent otherwise
- `options` absent for `DEFINITION`/`DEFINITION_LIST`
- `defaultValue` absent for `DEFINITION`/`DEFINITION_LIST` (§5.5)
- `searchScope`, if present, only on `DEFINITION`/`DEFINITION_LIST`

Rejection stays **atomic** — a bad paste never half-applies.

## 11. Versioning, and the window that is currently open

A v1 document is a strict subset of v2 — no `definitions`, no new type kinds — so v1 documents keep
parsing and the version gate in §10 is the only branch needed.

**Except for `label`.** Changing it from `String` to `Map<String, String>` is a genuine breaking
change to the DTOs in `sport-api`.

**A9 shipped unseeded. All 12 sports carry `NULL`. There are currently zero schema documents in
existence**, so that break costs nothing — no migration, no backfill, no dual-shape parsing.

**That window closes the moment the first sport is seeded.** Which means an earlier plan to seed
Badminton in v1 format is withdrawn: seeding v1 would manufacture a migration for no reason. Seed
once, in v2, after `A12` and `A13` land — that is what `A15` is for.

If a v1 document ever does get written before then, `label` needs a Jackson deserializer accepting
both a string and a map, coercing the string to `{ defaultLocale: value }`. Avoidable, so avoid it.

## 12. Caching

Unchanged from A9, and deliberately so. The registry, the labels and the new type kinds all live in
the same column on `sports`, so they ride `SportLookupCache` with **zero new wiring**:

- `getAttributeSchema` reads the active-only cache; `replaceAttributeSchema` resolves via `findById`
  and evicts. Both unchanged.
- `getAttributeSchemaForAdmin` (A11) unchanged.
- `Sport.attributesSchema` **stays an untyped `Map<String, Object>`.** This matters more under v2, not
  less: a richer document has more ways to stop deserializing, and the entity is loaded on the hot
  catalogue path. Keeping it untyped contains that blast radius to the one method that parses it.

§8.4's suggestion aggregate is the only genuinely new cache, and it is a separate one with its own
refresh policy — not part of the schema cache.

## 13. Size budget

Both caps were **measured against the real Badminton document** (`A15_BADMINTON_SCHEMA_V2.json`) on
2026-08-24, rather than left as a worry. Both fit with large margins.

### 13.1 Schema document — `MAX_SCHEMA_BYTES`, 16KB

| | Bytes | % of cap |
|---|---|---|
| Badminton v2, minified | **2,501** | **15.3%** |
| (pretty-printed, for reference) | 4,152 | — |

Labels dominate a schema document and two locales roughly double that term, so the useful reading is:
a sport of this shape has room for roughly a dozen locales, or several times the attribute count,
before 16KB binds. Re-measure if a document grows materially.

### 13.2 Profile values — `MAX_ATTRIBUTES_BYTES`, 4KB

Measured on compact JSON of the **merged** map, which is what
`UserSportProfileServiceImpl.validateAttributesSize` actually checks
(`objectMapper.writeValueAsBytes`, `:292`).

Per-item cost: **unlinked reference 32 B · linked reference 76 B · linked shoe 130 B.**

| Profile | Today (unlinked) | After Equipment (every ref carries a UUID) |
|---|---|---|
| Typical — 1 racket, 1 string, 1 shuttle, 1 shoe | 285 B (7.0%) | 461 B (11.3%) |
| Enthusiast — 3 / 2 / 2 / 2 | 499 B (12.2%) | 895 B (21.9%) |
| Maximal realistic — 5 / 3 / 3 / 3 | 715 B (17.5%) | 1,331 B (32.5%) |

Headroom probe: **~50 linked rackets** in a single profile before the cap binds. Records cost more
than scalars, as §3 warned — but not nearly enough to matter at realistic gear counts, and linking
(which adds a 36-char UUID per reference) is the larger multiplier, not nesting.

**Conclusion: neither cap needs raising for v2.** If one ever does, raise it against a fresh
measurement — never after a rejected `PUT` in production.

### 13.3 `id: null` is not stored

A consequence of §9's algorithm worth stating, because it is easy to get wrong on the client: the
filter drops an **optional field whose value is `null`**. So a client sending
`{ "id": null, "value": "Yonex Astrox 88D Pro" }` gets `{ "value": "Yonex Astrox 88D Pro" }` stored.

Two implications:

- It is where the 32 B vs 43 B per-reference saving in §13.2's "today" column comes from.
- **The client must not assume `id` is present as a key** — read it as "absent or null ⇒ unlinked",
  never `"id" in ref`. `SPORT-6` carries this.

## 14. What v2 does not change

Worth listing, because the review question for any patch here is "did this stay true?":

- `UserSportProfile.attributes` is still a **flat** `Map<String, Object>` keyed by globally-unique
  attribute keys. A3's entity and `V025` are untouched.
- Merge is still by **top-level key**. An absent key keeps its stored value.
- Profile writes still never fail on `attributes` **content** — only on size.
- Reads stay **permissive**: stored keys with no current definition pass through untouched (v1 §5.1).
- `isAvailable` soft-delete semantics, including parent-wins, are unchanged.
- Keys remain **immutable by policy** — a rename orphans stored values, so a rename is add-new +
  retire-old.
- The schema stays out of `SportResponse`.
- **No new migration.** `sports.attributes_schema` is already JSONB and holds any of this.

## 15. Deliberately not in v2

- **`isAvailable` on definitions or their fields.** Soft delete exists at group and attribute level
  only. Retiring one field of a record has no mechanism. Revisit when something needs it.
- **A cross-sport definition or enum registry** (§5.4).
- **Per-attribute requiredness** (§6.1).
- **Optimistic locking on concurrent admin edits** — unchanged from v1 §2.2.
- **`url` on `Reference`** (§8.2).
- **A delete-a-key path** — still `A10`, and §9.1 sharpens rather than closes it.
- **Caller `isActive` enforcement** — unchanged from A7/A9, closes with `U12`.

## 16. Open questions

- **Should `searchScope` be a closed, validated set?** Same trust-boundary argument as `type`: the
  client turns it into an endpoint call, so a free-form typo silently creates a *new empty pool* that
  then accumulates its own users' entries in isolation. Nothing errors; suggestions for one sport just
  stay mysteriously thin. Starting free-form is defensible while there is one real scope, but the
  admin UI should surface scopes already in use so it is pick-not-type. Revisit when there is more
  than one.
- **What is N in the frequency floor** (§8.4), and where does the aggregate refresh from? `A14`
  decides both, with a number and a rationale.
- **Does `SPORT-2` render a nested record inline or in a sub-modal?** A `DEFINITION_LIST` of `Shoe`,
  each holding two nested records, is a real layout problem and the answer is not obvious from here.

## 17. Ticket breakdown

| Ticket | Scope | Depends on |
|---|---|---|
| `A12` | v2 core — `definitions` registry, `DEFINITION`/`DEFINITION_LIST`, `isRequired` cascade, validator + filter | — |
| `A13` | Localized labels — `label` maps, `defaultLocale`, `Accept-Language` resolution, admin-raw vs user-resolved | — |
| `A14` | Entity references — `searchScope`, the suggestion aggregate, the search endpoint | `A12` |
| `A15` | Seed Badminton (and Pickleball) in v2 | `A12`, `A13` |
| `A16` | `NUMBER` and `BOOLEAN` type kinds | — |
| `SPORT-2` | Renderer — **rescoped** onto v2 | `A12`, `A13` |
| `SPORT-6` | Reference field widget — search, link, free-text fallback | `A14`, `SPORT-2` |

`A12` and `A13` are independent of each other and both block `A15`. Landing them close together is
preferable: both change the document format, and while there is nothing seeded there is nothing to
migrate between them.

**`ADMIN-2` needs no ticket.** It shipped as a JSON textarea over the raw document (its own explicit
choice), so it keeps working against v2 unchanged — the admin simply pastes a richer document. The
`searchScope` picker in §16 would be an `ADMIN-3`-class enhancement, and `ADMIN-3` is already
deferred to V1.
