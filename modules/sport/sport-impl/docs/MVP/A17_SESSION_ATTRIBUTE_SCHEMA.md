# A17 · Session attribute schema

**Status:** `DONE` (2026-09-06)
**Type:** New Feature
**Depends on:** **A19 (`DONE` 2026-09-06) — hard.** A19 introduced schema v3: profile-schema keys
are unique among siblings only, nodes address by full `/`-separated path
(`gear/rackets/tension`), and a reusable `SchemaPaths` resolver was added. Everything in this
ticket that says "profile attribute **key**" now means "profile attribute **path**".
**Filed:** 2026-09-02, from a design session on letting sessions carry sport-specific structured
attributes and pre-filling them from the creator's sport profile.

## Delta 2026-09-06 (from A19 pickup) — `#ref` grammar is path-qualified

A17 was filed against pre-v3 profile schemas, where a bare `profileAttributeKey` was unique
sport-wide. A19 removed that. Reconcile at pickup:

- **`#ref` value is a full path**: `{ "#ref": "gear/rackets/tension", ... }`, not a bare key.
  Resolve it against the profile schema with `SchemaPaths` (the helper A19 added for exactly this),
  not a flat key lookup.
- **`#ref` "effective key" for the session-schema uniqueness rule** is the full referenced path.
- **own-node key collision** is checked against the set of referenced profile **paths** plus the
  session schema's own sibling namespace (own nodes follow v3's sibling-scoped key rule too).
- **The dangling-`#ref` → 400 validation is this ticket's to build** — A19 deliberately shipped no
  schema field that holds a node path, so `SchemaPaths`-based path-reference validation lands here.
- A19's `SchemaPaths` also produces the available-view (full-depth `isAvailable` cascade); a `#ref`
  must resolve to a node that view still contains.

## Delta 2026-09-06 (from A17 pickup) — decisions locked at pickup

Resolves the ticket's "Open question" and the two implicit ones the A19 delta left. All folded
into the Phase 0 design doc.

- **Own `DEFINITION`/`DEFINITION_LIST` nodes carry a session-schema-local `definitions` registry**
  — the session schema doc has its own top-level `definitions` array, self-contained, validated by
  the same rules as `SportAttributeSchemaValidator.validateDefinitions` (PascalCase names, no
  duplicates, inner-position primitive-only, no cycles). An own node's `definitionRef` resolves
  against *this* registry, never the profile schema's. (Reverses an earlier lean toward reusing the
  profile registry — an own attribute is event-only and must not be coupled to profile-schema
  definitions that can change under it.)
- **A `#ref` to a profile `DEFINITION`/`DEFINITION_LIST` node** still inherits that node's
  `definitionRef`, which names a *profile-schema* definition. The ref-expanded raw doc and the
  resolver carry that profile-schema definition through alongside the session-local ones.
- **Definition-name collision rule:** a session-local definition name must not equal any
  profile-schema definition name reachable through a `#ref` in the same session schema — rejected at
  `PUT` (400). Keeps the merged registry in the ref-expanded raw doc unambiguous. Same spirit as the
  own-node-key-vs-profile-path collision rule.
- **`order` is dropped** from both node kinds (`#ref` may override only `label`; own nodes have no
  `order`). A19 removed `Integer order` from every schema DTO; array position is the order.
- **Stale `#ref` at resolve time** (target profile node disabled/removed after a valid `PUT`) —
  **lenient skip**: dropped from the resolved output and the ref-expanded raw doc, no error. Strict
  400 only at `PUT`. Same treatment for an own node whose local `definitionRef` somehow fails to
  resolve at read time. Mirrors A9/A10's lenient profile-write posture.
- **Endpoint paths mirror the profile-schema precedent** (A9/A11), not this ticket's original text:
  - `PUT  /api/sports/{sportId}/session-attribute-schema` — `@PreAuthorize(ROLE_ADMIN)`, replace-wholesale, validated
  - `GET  /api/sports/all/{sportId}/session-attribute-schema` — ROLE_ADMIN, raw
  - `GET  /api/sports/{sportId}/session-attribute-schema` — member, resolved, active-only (404 for a deactivated sport, `data: null` when unset)

## Phase 0 (before code)

Write `documentation/md/SESSION_ATTRIBUTE_SCHEMA_DESIGN.md` + a `PROGRESS.md` summary. The candidate
notification trigger this surfaced ("notify users whose sport profile attributes match a newly
created session") is logged in `documentation/md/NOTIFICATION_USE_CASES.md` as NOTIF-6 at filing
time — the design doc should reference it, not re-litigate it.

## What ships

A second admin-managed schema per sport, stored in a new nullable `sports.session_attributes_schema
JSONB` column (mirrors `attributes_schema`, V059) — NULL means "this sport's sessions offer no
attributes". Two node kinds per group:

- **`#ref`** — `{ "#ref": "<profileAttributeKey>", "label"?: {locale->str}, "order"? }`. Type,
  options, `definitionRef` resolve from the referenced profile attribute; only `label`/`order` may
  be overridden. Pre-fillable client-side from the user's profile.
- **own** — a full self-contained `SportAttributeDefinition` (key/label/type/options/definitionRef/
  defaultValue/isAvailable/order), for event-only attributes ("Balls provided?", "Competitive /
  casual") with no profile counterpart. Not pre-fillable (`defaultValue` only).

**`SessionAttributeSchemaValidator`** (strict, all-or-nothing — mirrors
`SportAttributeSchemaValidator`): sport-wide key uniqueness across the session schema, where a
`#ref`'s effective key is the referenced profile key; every `#ref` resolves to a live, available,
renderable profile attribute; an own node's `key` must not collide with **any** profile attribute
key (referenced or not); own-node rules identical to the profile validator; 16KB cap; dangling
`#ref` -> 400.

**`SessionAttributeSchemaResolver`**: `(session schema + profile schema + Accept-Language) ->
ResolvedSportAttributeSchema` — the exact shape the client renderer already consumes. Adds a
`prefillable`/`prefillKey` marker on `#ref`-derived nodes so the client knows which to seed. Own
`DEFINITION`/`DEFINITION_LIST` `definitions` are carried through.

**Endpoints:**
- `GET /api/sports/all/{sportId}/session-attribute-schema` — ROLE_ADMIN, raw
- `PUT /api/sports/all/{sportId}/session-attribute-schema` — ROLE_ADMIN, replace-wholesale, validated
- `GET /api/sports/{sportId}/session-attribute-schema` — member, resolved, active-only (404 for a
  deactivated sport, `data: null` when unset)

**`SportService` (`sport-api`):** `getSessionAttributeSchemaRaw(sportId)` returning a **ref-expanded**
raw doc (each `#ref` inlined to a full definition, labels still locale maps) so SESSION-23's filter
stays a near-clone of `ProfileAttributeFilter`; plus a resolved variant for the member controller.

Reuse `SportAttributeValues` unchanged.

## Open question (resolve at pickup)

Do own `DEFINITION`/`DEFINITION_LIST` nodes carry their **own** `definitions` registry in the
session schema (self-contained, v2 §5.4), or reuse the sport's profile-schema `definitions`?

## Cross-domain

`session-impl` already depends on `sport-api` (`requireActiveSportById` in the create path) — the two
new `SportService` methods add no new module edge.

## Account lifecycle

Admin-only writes; the member GET is a plain read. A deactivated caller reaching the member GET is
the same accepted access-token-window risk every other authenticated GET carries (CLAUDE.md / U12) —
no new surface.

## Client-visible

`GET /api/sports/{sportId}/session-attribute-schema` returns the same `ResolvedSportAttributeSchema`
DTO tree the client already mirrors for SPORT-2, plus the additive `prefillable`/`prefillKey`
marker. Client consumers filed alongside: CLIENT-SESSION-14 (hook), ADMIN-5 (editor).

## Tests

Spock: `SessionAttributeSchemaValidatorSpec` (ref resolution, dangling ref -> 400, own/ref key
collision, own-node rules), `SessionAttributeSchemaResolverSpec` (label override precedence,
prefill marker, ref type inheritance). IT in `server/src/test/java/.../integration/` for admin-role
gating on both admin endpoints and the active-only 404 on the member GET.

## Out of scope

Session-side storage and write validation (SESSION-23). Any client rendering (CLIENT-SESSION-*).
Discovery/ranking on session attributes (SESSION-8 territory).

---

## Implementation (2026-09-06)

Full design + rationale: `documentation/md/SESSION_ATTRIBUTE_SCHEMA_DESIGN.md`. The two open
questions resolved at pickup:

1. **`definitions` registry — session-local, self-contained** (not "reuse the profile registry").
   An own node's `definitionRef` resolves against the session schema's own `definitions` array;
   a `#ref` node inherits its profile attribute's `definitionRef`, which names a profile definition,
   and the `#ref`-expanded doc merges both registries. New `PUT` rule: a session-local definition
   name colliding with one a `#ref` pulls in from the profile schema → 400.
2. **`#ref` node key = last `/`-segment of the referenced path** (`gear/rackets/tension` →
   `tension`); the full path is the resolved node's `prefillKey`. Reinterprets the pre-v3 delta
   wording "effective key is the full path".

Plus: **`order` dropped** from both node kinds (A19 removed it schema-wide); **stale `#ref` at read
time → lenient skip** (strict 400 only at `PUT`); **endpoints mirror A9/A11** — `PUT
/api/sports/{sportId}/session-attribute-schema`, admin `GET /all/{sportId}/…`, member `GET
/{sportId}/…` (`isAuthenticated()`, active-only).

### What was built

**`sport-api`**
- `SessionAttributeSchema`, `SessionAttributeGroup`, `SessionAttributeNode` (new). The node's
  `@JsonProperty("#ref") String ref` distinguishes a `#ref` node (only `label` allowed alongside)
  from an own node (the full `SportAttributeDefinition` field set minus `searchScope`).
- `ResolvedSportAttributeDefinition`: `+ Boolean prefillable`, `+ String prefillKey` — additive,
  `null` for every profile-schema resolution and every session own node.
- `SportService`: `+ getSessionAttributeSchemaForAdmin`, `+ replaceSessionAttributeSchema`,
  `+ getSessionAttributeSchemaRaw` (`#ref`-expanded, for SESSION-23), `+ getResolvedSessionAttributeSchema(Locale)`.

**`sport-impl`**
- **`SchemaChecks` (new)** — the per-node and per-`definitions` rules, extracted verbatim from
  `SportAttributeSchemaValidator` so the two validators share them. `SportAttributeSchemaValidator`
  is slimmed to just the profile group-tree walk + sibling namespace; **behaviour byte-identical**
  (its Spock spec is unchanged and green).
- **`SessionAttributeSchemaValidator` (new)** — session group-tree walk; `#ref` resolved against
  `SchemaPaths.availableByPath(profileSchema)` (live+available view, full-depth `isAvailable`
  cascade); dangling/unavailable `#ref` → 400; a `#ref` carrying any field but `label` → 400; each
  `#ref` path globally unique across the session schema; own nodes → `SchemaChecks.validateAttribute`
  against the session-local registry; the definition-name-collision rule; 16KB cap.
- **`SessionAttributeNodes` (new)** — `refKey(path)` (last segment) + `ownNodeAsDefinition(node)`.
- **`SessionAttributeSchemaExpander` (new)** — the one `#ref`-inlining site: lenient-skips a stale
  `#ref` or a dead own `definitionRef`, merges `definitions` plus the reachable closure of any
  profile definition a `#ref` pulls in, returns `SportAttributeSchema` + `Map<sessionPath, profilePath>`.
- **`SessionAttributeSchemaResolver` (new)** — expander + the **existing**
  `SportAttributeSchemaLabelResolver` (reused unchanged) + a marker pass stamping
  `prefillable`/`prefillKey`.
- `SportServiceImpl` — the 4 methods; `toSessionAttributeSchema(Map)`; member reads take both
  schemas off one cached `Sport` (no extra query); `replaceSessionAttributeSchema` validates against
  the profile schema and `evictAll()`s.
- `SportController` — the 3 endpoints, `@PreAuthorize` mirroring the profile trio. **No
  `SecurityConfig` change.**
- `V062__add_session_attributes_schema_to_sports.sql` + `db.changelog-master.xml`; H2
  `schema.sql` gains a `session_attributes_schema JSON` column.

### Divergence from the plan

None functional. The Phase-3 plan floated a `SessionAttributeSchemaResolver` "mirroring"
`SportAttributeSchemaLabelResolver`; the implementation instead **reuses that resolver unchanged** on
the expander's output and adds only a marker pass — less duplicated recursion. The plan's shared-check
extraction (`SchemaChecks`) was done as designed.

### Tests

- `SessionAttributeSchemaValidatorSpec` (18 cases) — null schema; own + `#ref` passes; dangling
  `#ref` → 400; `#ref` to an unavailable attr / under an unavailable group → 400; `#ref` against a
  null profile schema → 400; `#ref` carrying a non-`label` field → 400; duplicate `#ref` path → 400;
  `#ref` last-segment vs sibling own key → 400; own no-type → 400; own `DEFINITION` unknown ref →
  400; own `DEFINITION` resolving in the session registry passes; session-def-name vs `#ref`-imported-def-name
  collision → 400; missing `defaultLocale` → 400; per-parent sibling namespace; nested groups.
- `SessionAttributeSchemaResolverSpec` (12 cases) — `#ref` inherits type/options/definitionRef;
  label-override precedence; own nodes not marked prefillable; stale `#ref` (removed or disabled)
  dropped; nested groups recurse with the deep `#ref`'s profile path in `prefillKey`; expander
  merges registries and emits zero `#ref` nodes; dead own `definitionRef` dropped; null → null;
  locale resolution.
- `SportServiceImplSpec` (+8) — `replaceSessionAttributeSchema` validate+store+evict; dangling `#ref`
  rejected atomically; `null` clears; admin GET for a deactivated sport; `getSessionAttributeSchemaRaw`
  expands + 404s inactive; `getResolvedSessionAttributeSchema` marks prefillable / returns null.
- `SessionAttributeSchemaIntegrationTest` (9 cases, `:server:test`) — admin-role gating on all 3
  endpoints (403 non-admin, 403 anonymous); admin `PUT` → member `GET` round-trips the JSONB column
  and resolves a `#ref` (type inherited, `prefillKey`, `Accept-Language: vi`); admin raw GET keeps
  `#ref` un-expanded; dangling `#ref` rejected atomically; member GET 404 for a deactivated sport;
  `data:null` when unset. H2 `schema.sql` column added.

Green: `:modules:sport:sport-impl:test` (280), `:server:test` (175), full backend `build`, and V062
applied cleanly against dev Postgres via `:server:bootRun`.
