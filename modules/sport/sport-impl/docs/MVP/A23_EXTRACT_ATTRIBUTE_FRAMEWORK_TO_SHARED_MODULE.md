# A23 · Repoint sport + session onto `common.attributes`; delete the clone

**Status:** `DONE` (2026-09-08)
**Type:** Refactor / architecture
**Plan:** `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md` — the master doc. §7 is the
class-move inventory, §8 the spec-parity matrix, **§9 is this ticket's consumer-repoint
checklist**. Read it first.
**Depends on:** **common `C9`** (hard) — which depends on `C5`→`C8`. The whole neutral framework
(`com.sportconnect.common.attributes`: DTO tree + validator + paths/filter + resolver + base×derived
pair, with the new `#ref` `key`+`cardinality` semantics) must be built and green before A23 starts.
**Filed:** 2026-09-07, from SESSION-23 pickup — that ticket needed
`ProfileAttributeFilter` / `SchemaPaths` / `SportAttributeValues` (all package-private in
`com.sportconnect.sport.service`) and the `sport-api` attribute DTO tree from `session-impl`, and
there was no shared home. SESSION-23 **cloned** the minimal value-validation logic into
`session-impl` as a deliberate, deletable bridge. This ticket removes that duplication.
**Rescoped:** 2026-09-08 — the original C5/A23 pair was split into common `C5`–`C9` + this ticket
+ client `CLIENT-SESSION-17`. A23 is now purely the *consumer* side: `common.attributes` is built
by C5–C9; A23 switches `sport-*` + `session-*` over to it and deletes the old code.

## Why

The per-sport attribute schema (A9/A12/A13/A16/A17/A19) is turning into a platform primitive:
define a typed, localized, admin-managed schema tree; validate submitted values against it with
lenient drop-invalid semantics; resolve it for display. Sport profiles use it (`A9`), sessions now
use it (`SESSION-23`), and more domains (groups, facilities, equipment) are expected to. Today the
DTOs live in `sport-api` and the logic lives package-private in `sport-impl`, so every new consumer
either clones (drift risk) or forces `sport-api` public surface it does not own.

## What ships

1. **Repoint `sport-impl`** onto `com.sportconnect.common.attributes`:
   `SportAttributeSchemaValidator` → `AttributeSchemaValidator`; `ProfileAttributeFilter` →
   `AttributeValueFilter`; `SessionAttributeSchema{Validator,Expander,Resolver}` → the `pair/`
   classes; `SportAttributeSchemaLabelResolver` → `AttributeSchemaResolver`;
   `UserSportProfileServiceImpl` (profile write filter + `retainDefined` + size);
   `SportLookupCache` (caches the raw schema); `SportServiceImpl` (schema get/put/raw/resolved).
   Every `def.getType()` / `def.getMin()` / `def.getOptions()` read becomes a **pattern switch**
   over the sealed `AttributeNode` hierarchy — this is the bulk of the work (plan doc §9).
2. **Repoint `sport-api`** method signatures naming a moved type — `getAttributeSchema`,
   `getAttributeSchemaForAdmin`, `replaceAttributeSchema`, `getSessionAttributeSchemaForAdmin`,
   `replaceSessionAttributeSchema`, `getSessionAttributeSchemaRaw`, `getResolvedSessionAttributeSchema`.
3. **Repoint `session-impl`** onto `common.attributes` and **delete the SESSION-23 clone**
   (`SessionAttributeFilter`, `SessionAttributeValues`, `SessionSchemaPaths` +
   `SessionAttributeFilterSpec`).
   - *C9 note (2026-09-08):* the `SessionAttributeFilterSpec` (243 ln) coverage check the plan
     doc §8 asks for is **done** — every case is covered by C7's
     `AttributeValueFilterSpec`; the one assertion that was unique to it (surviving-entry
     iteration order follows the request) was added to `AttributeValueFilterSpec` in C9. Nothing
     unique is lost on deletion.
4. **Delete the old framework** from `sport-api` (the whole DTO tree) and `sport-impl`
   (`SchemaChecks`, `SchemaPaths`, `SportAttributeValues`, `ProfileAttributeFilter`,
   `SportAttributeSchemaValidator`, `SportAttributeSchemaLabelResolver`,
   `SessionAttributeSchema{Validator,Expander,Resolver}`, `SessionAttributeNodes`).
5. **Rewrite the seeded Badminton *session* schema** so every `#ref` node carries `key` +
   `cardinality` (plan doc D9 — breaking). Migration, or a documented admin re-PUT like `A15`. The
   profile schema is unaffected (no `#ref`).
6. **Rewrite the Spock/IT specs** that build `…Definition.builder().type(NUMBER).min(0)` to the
   new subtype builders, and the `server` ITs (`SessionAttributeSchemaIntegrationTest`,
   `SessionAttributesIntegrationTest`, `SportAttributeSchemaIntegrationTest`).

## Consumer census

**Do it against plan doc §9 at pickup** — that checklist is seeded from the 2026-09-08 census.
List each consumer as compatible / updated-here / deferred (never "probably fine"). Includes the
**client** — but client rendering is already filed as **`CLIENT-SESSION-17`** (hard-blocked on this
ticket), so the client entry is "deferred → CLIENT-SESSION-17" unless A23 finds something that
ticket doesn't cover.

## Behaviour parity

Single-schema (profile) path: **byte-identical** — every profile-side outcome unchanged, specs
green with subtype-builder + import changes only. Derived (session) path: changes **by design**
for `#ref` (plan doc D9) — `key` + `cardinality` now required; the seeded schema and the session
specs move to the new contract. Nothing else about the session path changes.

## Out of scope

Any new attribute *capability* beyond D9's `#ref` change. Building `common.attributes` itself
(C5–C9). Client rendering (`CLIENT-SESSION-17`).

---

## Implementation summary (2026-09-08)

### Approved design (restated)

Pure consumer-side switch of `sport-*` + `session-*` onto `com.sportconnect.common.attributes`
(built by C5–C9). No new `common` code. Backend-only — **zero client changes** (the `sport.ts`
mirror + renderers + fixtures are `CLIENT-SESSION-17`, already filed, hard-blocked on this). The
seeded Badminton **session** schema is **not** in any migration (V062 only adds the nullable
column), so the D9 `#ref` rewrite is a **documented dev admin re-PUT**, not a data migration —
pre-launch, no prod.

### What was built

**`sport-api`**
- `SportService`: the 7 attribute methods keep their names; return/param types swapped
  `SportAttributeSchema`/`SessionAttributeSchema` → `com.sportconnect.common.attributes.AttributeSchema`,
  `ResolvedSportAttributeSchema` → `…resolved.ResolvedAttributeSchema`. Javadoc refreshed.
- **Deleted** the 16-file DTO tree (`SportAttribute*`, `SessionAttribute*`, `ResolvedSport*`,
  `SportAttributeType`).

**`sport-impl`**
- `SportServiceImpl`: dropped the 4 injected schema beans **and** the injected `ObjectMapper`.
  Stored-JSONB (de)serialisation now routes through `AttributeJson.mapper()` (the framework's
  strict mapper — extraction plan D7/D8) via a single private `parseStoredSchema` / `toStored`
  pair serving both columns. `AttributeSchemaValidator.validate` /
  `DerivedSchemaValidator.validate(base, derived)` / `DerivedSchemaExpander.expand(base, derived)`
  / `DerivedSchemaResolver.resolve(base, derived, locale)` — all static.
- `SportController`: dropped the `SportAttributeSchemaLabelResolver` field; the profile-schema
  member GET resolves inline via static `AttributeSchemaResolver.resolve(schema, locale)` (C8).
  Endpoint paths / methods / status codes / `@PreAuthorize` **unchanged**; response & request
  bodies are the new types, wire-compatible (C5 parity).
- `UserSportProfileServiceImpl`: dropped the `ProfileAttributeFilter` bean → static
  `AttributeValueFilter.filter` / `.retainDefined`. `validateAttributesSize` untouched (it
  serialises the *value* map, not the schema).
- `SportLookupCache`: **unchanged** — it caches the `Sport` entity's raw `Map` columns; parsing
  happens in `SportServiceImpl`.
- **Deleted** 9 logic classes (`SchemaChecks`, `SchemaPaths`, `SportAttributeValues`,
  `ProfileAttributeFilter`, `SportAttributeSchemaValidator`, `SportAttributeSchemaLabelResolver`,
  `SessionAttributeSchema{Validator,Expander,Resolver}`, `SessionAttributeNodes`) + 5 ported specs
  (`SportAttributeSchemaValidatorSpec`, `ProfileAttributeFilterSpec`,
  `SportAttributeSchemaLabelResolverSpec`, `SessionAttributeSchema{Validator,Resolver}Spec` — their
  cases live in common C6/C7/C8/C9).
- `SportServiceImplSpec` / `UserSportProfileServiceImplSpec`: constructors trimmed; schema-builder
  helpers migrated to the sealed subtypes; the two now-structural cases stay covered by C6/C9. The
  session `#ref` fixtures gained explicit `key` + `cardinality`.

**`session-impl`**
- `SessionServiceImpl`: dropped the `SessionAttributeFilter` bean → static
  `AttributeValueFilter.filter`; `SportAttributeSchema` → `AttributeSchema`.
- **Deleted** the SESSION-23 clone (`SessionAttributeFilter`, `SessionAttributeValues`,
  `SessionSchemaPaths`, `SessionAttributeFilterSpec`).
- `SessionServiceImplSpec`: constructor trimmed; `sessionSchema()` helper migrated.

**`session-api`**: `SessionService` Javadoc prose left as-is — it names
`SportService.getSessionAttributeSchemaRaw` (still valid, no type in the prose).

**`server` ITs**: `SportAttributeSchemaIntegrationTest` (19), `SessionAttributeSchemaIntegrationTest`
(9), `SessionAttributesIntegrationTest` (4) migrated to the sealed builders. The session `#ref`
request payloads now carry `key` + `cardinality`; one assertion flipped from
`type.doesNotExist()` to `type == "REF"` + `cardinality == "SINGLE"` (the raw `#ref` node now
carries its wire discriminator and cardinality).

**`Sport` entity**: Javadoc prose refreshed to name the common `AttributeSchema`.

### Divergence from the approved design

None structural. One assertion-level change surfaced during implementation and is called out
above: `SessionAttributeSchemaIntegrationTest.adminGetAll_returnsTheRawUnexpandedDocument` — the
raw `#ref` node now serialises `"type":"REF"` (the `@JsonTypeInfo` discriminator, C5) and
`"cardinality"`, where the old flat `SessionAttributeNode` emitted neither on a `#ref`. The node is
still unexpanded (no inherited type, no `min`); the test asserts that explicitly.

### D9 breaking change — the dev session-schema re-PUT

The stale dev Badminton **session** schema (one `#ref` → `gear/shuttlecocks`, pre-D9 shape with a
`null` `type`) no longer deserialises through the strict `AttributeJson` mapper, so
`GET /api/sports/1/session-attribute-schema` returns **500** until it is re-PUT. This is the D9
breaking change working as designed. Fix — `PUT /api/sports/1/session-attribute-schema` (admin) with:

```json
{
  "defaultLocale": "en",
  "groups": [
    {
      "key": "gear",
      "label": { "en": "Gear", "vi": "Trang bị" },
      "isAvailable": true,
      "attributes": [
        { "type": "REF", "key": "shuttlecocks", "#ref": "gear/shuttlecocks", "cardinality": "SINGLE" }
      ]
    }
  ]
}
```

`cardinality` is `SINGLE` here (one shuttlecock type per session, chosen from the creator's
`gear/shuttlecocks` `DEFINITION_LIST`); an admin re-authoring via ADMIN-5 can pick `LIST` instead
if the product intent is "several". No migration — pre-launch, no prod DB. Directly rewriting the
dev row was attempted during the live smoke but blocked by the environment's write classifier; it
is a manual dev step.

### Verification

- `:modules:sport:sport-impl:test` — **91 pass**, 0 failures.
- `:modules:session:session-impl:test` — **136 pass**, 0 failures.
- `:modules:common:test` — **293 pass** (untouched by A23).
- `:server:test` — **173 pass / 6 fail**; all 6 are `SessionEventsConsumerIntegrationTest`
  (`AmqpIOException` RabbitMQ parallel-load flake — **BUILD SUCCESSFUL in isolation**; the same
  documented flake C5–C9 recorded). All **32** attribute-schema IT cases pass
  (`SportAttributeSchemaIntegrationTest` 19 · `SessionAttributeSchemaIntegrationTest` 9 ·
  `SessionAttributesIntegrationTest` 4).
- `./gradlew assemble` — green, all modules.
- **Live smoke** (real dev Postgres via `bootRun`): `GET /api/sports/1/attribute-schema` returns
  the full seeded Badminton v3 **profile** schema, round-tripped losslessly through
  `AttributeJson.mapper()` from the real JSONB column, labels resolved, flat `ResolvedAttribute*`
  shape — **confirmed**. `GET …/session-attribute-schema` → 500 (the D9 stale-doc case above).
- **N+1:** none — static pure-function calls replaced injected beans; no new repository/service
  calls or per-item loops.

### Consumer census result

Every consumer from plan §9 is **updated in this change** except: `SportLookupCache` (compatible
as-is), `session-api` Javadoc (prose only), `common/attributes/AttributeType` Javadoc (already
worded for the move), and the **client** (deferred → `CLIENT-SESSION-17`). No backend consumer was
left on a stale contract; `grep` across all modules for the deleted type names and
`SportAttributeType.` usages is clean.
