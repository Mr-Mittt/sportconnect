# A23 · Repoint sport + session onto `common.attributes`; delete the clone

**Status:** `TODO`
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
