# Session Attribute Schema — Design (A17)

**Ticket:** `modules/sport/sport-impl` A17
**Status:** design locked & implemented 2026-09-06
**Builds on:** [`SPORT_ATTRIBUTE_SCHEMA_DESIGN.md`](SPORT_ATTRIBUTE_SCHEMA_DESIGN.md) (v1, A9),
[`SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md`](SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md) (A12/A13 — `definitions`
registry, record types, localized labels),
[`SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md`](SPORT_ATTRIBUTE_SCHEMA_V3_DESIGN.md) (A19 — nested groups,
sibling-scoped keys, `/`-path addressing, `SchemaPaths`)
**Related:** SESSION-23 (session-domain storage + write filter — consumes this),
`NOTIFICATION_USE_CASES.md` NOTIF-6 (candidate "session matches my profile attributes" trigger — not
scoped here)

---

## 1. What it is

A **second** admin-managed attribute schema per sport, stored in a new nullable
`sports.session_attributes_schema JSONB` column (V062, mirrors `attributes_schema` / V059). Where
the profile schema (A9) describes the attributes on a user's **sport profile**, this describes the
attributes a **session** (event) of that sport may carry — "Balls provided?", "Competitive /
casual", plus fields mirrored from the profile schema so the session-create form can pre-fill them
from the creator's own profile.

`NULL` means "this sport's sessions offer no attributes". Deliberately unseeded — an admin fills it
in through client ADMIN-5.

## 2. Two node kinds

A session group's `attributes[]` holds `SessionAttributeNode`s, each one of:

| Kind | JSON | Meaning |
|---|---|---|
| **`#ref`** | `{ "#ref": "gear/rackets/tension", "label"?: {locale→str} }` | A pointer at a profile-schema attribute by its full v3 `/`-path. `type`, `options`, `definitionRef` (and the record shape it names, from the **profile** `definitions` registry) are all inherited. Only `label` may be overridden. Pre-fillable. |
| **own** | a full `SportAttributeDefinition` minus `searchScope` | A self-contained event-only attribute with no profile counterpart. Its `definitionRef` (if any) resolves against the **session-local** `definitions` registry. Not pre-fillable (`defaultValue` only). |

`#ref` is the only polymorphic node shape anywhere in the schema machinery. The profile schema has
none.

### Key of a `#ref` node

A `#ref` node carries no `key`. Its key in the session tree is the **last `/`-segment** of the
referenced path (`gear/rackets/tension` → `tension`). That segment is itself a profile attribute
key, so it already satisfies the `^[a-z][a-zA-Z0-9_]*$` pattern. The full path is retained
separately as the resolved node's `prefillKey`.

This reinterprets A17's original (pre-v3) delta wording "`#ref` effective key is the full referenced
path" — pre-v3 a bare `profileAttributeKey` was unique sport-wide and doubled as the key; post-v3
the last segment plays that role in the session tree, and the full path lives in `prefillKey`.

## 3. Resolved decisions (this ticket's Phase 0 + pickup)

### 3.1 `definitions` — session-local, self-contained

The session schema doc carries its **own** top-level `definitions` array, validated by exactly the
same three-pass rule as the profile registry (`SchemaChecks.validateDefinitions`). An **own** node's
`definitionRef` resolves against this registry only.

A **`#ref`** node that points at a profile `DEFINITION`/`DEFINITION_LIST` attribute inherits that
attribute's `definitionRef`, which names a **profile** definition. The `#ref`-expanded raw doc (§4)
therefore merges the session-local registry with every profile definition (and its reachable
closure) a `#ref` pulls in.

**Collision rule:** a session-local definition name must not equal a definition name a `#ref` pulls
in from the profile schema — rejected at `PUT` (400). Keeps the merged registry unambiguous. (An
own attribute is event-only and must not be coupled to profile-schema definitions that can change
under it — hence not "reuse the profile registry".)

### 3.2 `order` — dropped

A19 removed `Integer order` from every schema DTO. A `#ref` may override only `label`; own nodes
have no `order`. Array position is the order (client SPORT-7).

### 3.3 Stale references at read time — lenient skip

A `#ref` that passed `PUT` validation but whose target profile attribute has since been retired
(`isAvailable:false`, removed, or an ancestor group disabled — the profile schema is edited
afterward) is **dropped** from both the resolved member view and the `#ref`-expanded raw doc. No
error. Same for an own `DEFINITION`/`DEFINITION_LIST` node whose session-local `definitionRef` has
gone. Mirrors A9/A10's lenient profile-write posture; strict 400 only at `PUT`.

A post-hoc profile/session **definition-name** clash (profile adds a `Shoe` after the session schema
already declared one) resolves to the **session-local** definition in the merged registry — the
`PUT` validator prevents the clash at write time, so this only matters for a schema that was valid
when stored.

### 3.4 Endpoints — mirror the profile-schema precedent (A9/A11)

| Method | Path | Auth | Body |
|---|---|---|---|
| `PUT` | `/api/sports/{sportId}/session-attribute-schema` | `hasRole('ADMIN')` | raw `SessionAttributeSchema`, replace-wholesale, validated; `null` clears |
| `GET` | `/api/sports/all/{sportId}/session-attribute-schema` | `hasRole('ADMIN')` | raw `SessionAttributeSchema` (every locale, `#ref`s un-expanded), inactive sport OK |
| `GET` | `/api/sports/{sportId}/session-attribute-schema` | `isAuthenticated()` | resolved `ResolvedSportAttributeSchema`, `#ref`s expanded + marked, active-only (404 for a deactivated sport, `data:null` when unset) |

`isAuthenticated()` not `hasRole('USER')` on the member GET — same reason as the profile schema: an
admin-only account may not also hold USER, and ADMIN-5 reads this. **No `SecurityConfig` change** —
`/api/sports/**` is blanket `permitAll`; the `@PreAuthorize` is what enforces.

The `PUT` sits at `/{sportId}/…` (no `/all/` prefix) — a PUT has no member twin to disambiguate
from, exactly as `PUT /api/sports/{sportId}/attribute-schema`.

### 3.5 `SportService` (`-api`) — 4 new methods

- `getSessionAttributeSchemaForAdmin(sportId)` → raw, repository read (inactive OK).
- `replaceSessionAttributeSchema(sportId, schema)` → validate (needs the sport's profile schema for
  `#ref` resolution, read off the same `Sport` row) → store → `sportLookupCache.evictAll()`.
- `getSessionAttributeSchemaRaw(sportId)` → **`#ref`-expanded** `SportAttributeSchema` (no `#ref`
  nodes; merged `definitions`; labels still locale maps). For SESSION-23's write-time filter, a
  near-clone of `ProfileAttributeFilter` that must never touch the profile schema itself.
- `getResolvedSessionAttributeSchema(sportId, Locale)` → `ResolvedSportAttributeSchema` with
  `prefillable`/`prefillKey` markers, locale-resolved. For the member GET.

`Locale` appears in this one interface method (the profile schema resolves in the controller
instead) — justified: the member GET is the only caller and there is no hot write path to keep
locale-free, unlike `getAttributeSchema` which the profile write path hits on every save.

### 3.6 16KB cap — unchanged, on the stored doc

`SchemaChecks.MAX_SCHEMA_BYTES` (16384) applies to the **stored** session doc, checked by the
validator. The `#ref`-expanded doc from `getSessionAttributeSchemaRaw` inlines each `#ref` (a
~20-char path) into a full definition and can therefore exceed 16KB — that is fine: the expanded
form is a non-persisted read model for SESSION-23, never validated or capped. Do not assert
`getSessionAttributeSchemaRaw` output is ≤16KB.

## 4. Implementation shape

| Piece | File | Role |
|---|---|---|
| `SessionAttributeSchema` / `SessionAttributeGroup` / `SessionAttributeNode` | `sport-api/dto` | the raw doc; `SessionAttributeNode.@JsonProperty("#ref") ref` distinguishes the two kinds |
| `ResolvedSportAttributeDefinition` `+ prefillable, + prefillKey` | `sport-api/dto` | additive, `null` for every profile-schema resolution |
| `SchemaChecks` (**new**) | `sport-impl/service` | the per-node + per-`definitions` rules, extracted from `SportAttributeSchemaValidator` and shared verbatim with the session validator |
| `SportAttributeSchemaValidator` (**slimmed**) | `sport-impl/service` | now just the profile group-tree walk + sibling namespace; delegates the rest to `SchemaChecks`. Behaviour byte-identical (its Spock spec unchanged & green). |
| `SessionAttributeSchemaValidator` (**new**) | `sport-impl/service` | session group-tree walk; `#ref` resolution via `SchemaPaths.availableByPath(profileSchema)`; own nodes → `SchemaChecks.validateAttribute` against the session-local registry; the `#ref`-path-uniqueness and definition-name-collision rules |
| `SessionAttributeNodes` (**new**) | `sport-impl/service` | `refKey(path)` (last segment) + `ownNodeAsDefinition(node)` |
| `SessionAttributeSchemaExpander` (**new**) | `sport-impl/service` | the one `#ref`-inlining site: lenient-skip, merge `definitions` (+ reachable closure), emit `SportAttributeSchema` + `Map<sessionPath, profilePath>` |
| `SessionAttributeSchemaResolver` (**new**) | `sport-impl/service` | expander + the **existing** `SportAttributeSchemaLabelResolver` (reused unchanged) + a marker pass stamping `prefillable`/`prefillKey` |
| `SportServiceImpl` | `sport-impl/service` | the 4 methods; `toSessionAttributeSchema(Map)`; member reads via `sportLookupCache` (both schemas off one cached `Sport`, no extra query) |
| `SportController` | `sport-impl/controller` | the 3 endpoints |
| `V062__add_session_attributes_schema_to_sports.sql` | `server/.../changes` | `ALTER TABLE sports ADD COLUMN IF NOT EXISTS session_attributes_schema JSONB` |

No `SecurityConfig`, `SportAttributeValues`, `ProfileAttributeFilter`, `UserSportProfileServiceImpl`
change.

## 5. Account lifecycle

Admin-only writes (`hasRole('ADMIN')`); the member GET is a plain read carrying the same accepted
access-token-window risk every authenticated GET does (CLAUDE.md / U12). No new `isActive` check.

## 6. Client impact (not built here)

`ResolvedSportAttributeDefinition` gains optional `prefillable`/`prefillKey` — client mirror in
**CLIENT-SESSION-14** (hook + types), editor in **ADMIN-5**, rendering/pre-fill in
CLIENT-SESSION-15/16. All already filed. `SportAttributeType` is unchanged — no client-enum gap.

## 7. Out of scope

Session-side storage + write validation (SESSION-23). All client rendering. Discovery/ranking on
session attributes (SESSION-8). NOTIF-6.

## 8. Notification triggers

NOTIF-6 ("notify users whose sport profile attributes match a newly created session") was logged at
filing time in `NOTIFICATION_USE_CASES.md`; not re-litigated here.
