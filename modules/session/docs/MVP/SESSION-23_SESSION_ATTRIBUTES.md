# SESSION-23 · Session attributes

**Status:** `DONE` (2026-09-07)
**Type:** New Feature
**Depends on:** **A17** (`modules/sport/sport-impl`) — needs
`SportService.getSessionAttributeSchemaRaw`.
**Filed:** 2026-09-02, same design session as A17 — the session-domain half.

## What ships

- Liquibase migration: `sessions.attributes JSONB` (nullable).
- `SessionAttributeFilter` — a near-clone of `sport-impl`'s `ProfileAttributeFilter` but with
  **replace semantics** (the submitted map is the whole truth — no merge, so no A10-style
  "can't delete a key" gap). Lenient: unknown keys, wrong-shaped values, and writes to an
  `isAvailable: false` node are dropped silently. 4KB serialized cap fails loudly (same rule as
  profile attributes).
- Resolve each submitted key's type/options via `SportService.getSessionAttributeSchemaRaw(sportId)`
  (ref-expanded by A17). Reuse `SportAttributeValues`.
- Wire into `createSession` and `updateSession` (attributes editable post-creation, replace
  semantics).
- `attributes` on `CreateSessionRequest` / the update request; `attributes` on `SessionResponse`
  + mapper.

## Edge cases

- Sport has no session schema (`null`) -> every submitted attribute dropped, session still created.
- Deactivated sport -> session create/update already gated upstream; no new path.
- Deactivated caller — session create/update are existing authenticated write paths; this ticket
  adds a field, not a new endpoint, so it inherits the same accepted access-token-window risk
  (CLAUDE.md / U12), no new surface.

## Cross-domain

Uses the existing `session-impl -> sport-api` dependency; A17 adds the method, no new module edge.

## Client-visible

`SessionResponse` gains `attributes`. Client consumers: CLIENT-SESSION-14/15/16.

## Tests

Spock `SessionAttributeFilterSpec` (replace vs merge, drop invalid, drop `isAvailable:false`,
oversize -> 400). IT: create a session with attributes end-to-end, and a write to a switched-off
node is dropped through the real pipeline.

## Out of scope

The session attribute *schema* itself (A17). Rendering (CLIENT-SESSION-*). Discovery filtering on
attributes (SESSION-8).

---

## Implementation (2026-09-07)

### Approved design (Phase 3)

Clone, not reuse. `ProfileAttributeFilter` / `SchemaPaths` / `SportAttributeValues` are
package-private in `com.sportconnect.sport.service` and unreachable from `session-impl`; the ticket's
"reuse `SportAttributeValues`" and "near-clone of `ProfileAttributeFilter`" lines conflict. Resolved
at pickup by **cloning** the value-validation logic into `session-impl` — consistent with the
`SessionGate`/`PostGate` "same shape, no shared logic" precedent — and filing the eventual
de-duplication as **sport `A23`** + **common `C5`** (paired: `C5` owns the ADR on the shared home,
`A23` the sport/session repoint + deletion of this clone).

1. **Migration** — `V064__add_attributes_to_sessions.sql`: `ALTER TABLE sessions ADD COLUMN IF NOT
   EXISTS attributes JSONB` (nullable, no default, no backfill). Registered after V063. H2
   `schema.sql` `sessions` gains `attributes JSON`.
2. **Entity** — `Session.attributes` : `Map<String,Object>`, `@JdbcTypeCode(SqlTypes.JSON)`,
   `columnDefinition = "jsonb"`, plain nullable field (`null` = none, `{}` = cleared).
3. **Filter** — package-private in `com.sportconnect.session.service`:
   - `SessionAttributeFilter` (`@Component`) — `filter(Map, SportAttributeSchema)`, byte-for-byte
     the logic of `ProfileAttributeFilter.filter()`; replace semantics live in the *caller*.
   - `SessionAttributeValues` — faithful clone of `sport-impl`'s `SportAttributeValues`
     (`filterScalarOrRecord` / `isValid` / `isValidRecord` / bounds / `MAX_LIST_ITEMS`).
   - `SessionSchemaPaths` — trimmed clone of `SchemaPaths` (only `availableByPath`; the write-only
     session side needs no `retainDefined`/"defined-but-off" view).
4. **DTOs** — `attributes : Map<String,Object>` on `CreateSessionRequest`, `UpdateSessionRequest`
   (replace semantics: null = untouched, `{}` = clear), `SessionResponse`.
5. **`SessionServiceImpl`** — `+ SessionAttributeFilter`, `+ ObjectMapper`, `MAX_ATTRIBUTES_BYTES =
   4096`. `resolveAttributes(requested, sportId)`: null request → null (schema never fetched); else
   `getSessionAttributeSchemaRaw(sportId)` → `filter` → `validateAttributesSize` (4KB → 400).
   `createSession` sets it on the builder; `updateSession` only calls it when `request.attributes
   != null`. `mapToResponses` adds `.attributes(session.getAttributes())` — column on the loaded
   entity, no query, no N+1.
6. **No controller / `SecurityConfig` / `common` change. No new endpoint.**

### Deactivated-sport edge (deliberate)

`getSessionAttributeSchemaRaw` is active-only (throws `ResourceNotFoundException` → 404). Because
`resolveAttributes` is reached only when the caller *supplies* `attributes`:
- create/update with **no** `attributes` → schema never fetched → still works for a session whose
  sport was later deactivated;
- create/update **with** `attributes` on an inactive sport → 404 propagates. Left intentional —
  submitting structured attributes against a dead sport's schema is meaningless, and it matches
  `createSession` already rejecting a caller-supplied inactive `sportId`.

### Divergence from the approved plan

None functional. The `updateSession` IT drives `PUT` (not `POST`): replace semantics make it the
fuller end-to-end test and it needs no `locationId`. The session-schema fixture is persisted
straight onto the `Sport` row rather than via the admin `PUT` endpoint — a MockMvc call in
`@BeforeEach` fixes the test method's authenticated identity (BaseIT's "first request wins"), and
the test must act as the session creator. `schema.sql` gained a `locations` table (first IT to
return a `SessionResponse`, whose mapper does a real `LocationService.getLocationsByIds` query —
the earlier session ITs only hit void/comment endpoints).

### Tests

- **`SessionAttributeFilterSpec`** (23) — per-type valid/invalid drop, unknown-path drop,
  `isAvailable:false` attribute and ancestor-group drop, `ENUM`/`NUMBER` bounds, `DEFINITION`
  record cascade, `DEFINITION_LIST` element filtering + 10-item cap, explicit replace-semantics
  case, iteration order, nested-path cascade.
- **`SessionServiceImplSpec`** (+6, 107 total) — create filters + persists; create without
  attributes never fetches the schema and stores null; create oversize → 400; update replaces
  wholesale; update null leaves stored untouched + no schema fetch; update `{}` clears.
- **`SessionAttributesIntegrationTest`** (4, `:server:test`) — real `PUT /api/sessions/{id}` →
  real `SportService` ref-expansion → filter → `jsonb` round trip: drop of a switched-off + an
  unknown key; wholesale replace on a second write; explicit `{}` clears; an edit omitting
  `attributes` leaves them intact.

Green: `:modules:session:session-impl:test`; full `:server:test --rerun-tasks` (179, 0 failures);
`V064` applied cleanly against dev Postgres via `:server:bootRun` (`sessions.attributes jsonb`,
nullable; app boots `UP`).

### Follow-ups filed

- sport **A23** — extract the attribute framework out of `sport-*`, delete this clone.
- common **C5** — ADR + shared home for the attribute framework (paired with A23).
