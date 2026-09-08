# Common Module — Feature Backlog

**Version:** MVP v1
**Module:** `modules/common`
**Last updated:** 2026-09-08 (C7 done; C8 next in the attribute-framework split)

---

## How to use this file

- Pick the first `TODO` ticket in the implementation order
- Mark it `IN PROGRESS` at the start of the session
- Mark it `DONE` when implementation + tests are complete
- Use `/workon common mvp` to resume

---

## Open (TODO / IN PROGRESS)

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [C8](MVP/C8_ATTRIBUTE_SCHEMA_RESOLVER.md) | Attribute framework — **locale resolver** (`resolve/`): per-type `NodeResolver` + `AttributeSchemaResolver` (exact→language→`defaultLocale` fallback), flat `ResolvedAttributeSchema` output. Ports `SportAttributeSchemaLabelResolverSpec` (196). Depends on C5 | `TODO` |
| 2 | [C9](MVP/C9_ATTRIBUTE_BASE_DERIVED_PAIR.md) | Attribute framework — **base×derived pair** (`pair/`) + the `#ref` semantics change: `RefAttribute` validation (required `key` + `cardinality`, `#ref` → base `availableByPath`, dangling strict-reject), `DerivedSchemaExpander` (inline `#ref` as data source, lenient-drop stale, merge `definitions`, carry `cardinality`), `DerivedSchemaResolver` (stamp `prefillable`/`prefillKey`/`cardinality`). Ports `SessionAttributeSchemaValidatorSpec` (292) + `SessionAttributeSchemaResolverSpec` (231) + new cardinality cases. Depends on C6, C7, C8. **→ unblocks sport `A23`** | `TODO` |

---

## Done

| # | Ticket | Title | Status |
|---|---|---|---|
| 1 | [C7](MVP/C7_ATTRIBUTE_PATHS_AND_VALUE_FILTER.md) | Attribute framework — paths + value filter (2026-09-08) — `com.sportconnect.common.attributes`: `path/AttributePaths` (flatten + full-depth `isAvailable` cascade; `definedByPath`/`availableByPath`), `value/AttributeValues` += `isValidRecord`/`filterScalarOrRecord`/`asRecord`, `value/AttributeValueFilter` (`filter` + generalized `retainDefined` + `DEFINITION_LIST` iteration, never throws), plus `AttributeNodes` root helper (`isAvailable`/`typeOf` — the facts the sealed interface omits). Ported `ProfileAttributeFilterSpec` verbatim. Green: `:modules:common:test` 237 (+89) · `:server:test` 179 (9 RabbitMQ parallel-load flakes, pass isolated — same as C5) | `DONE` (2026-09-08) |
| 2 | [C6](MVP/C6_ATTRIBUTE_SINGLE_SCHEMA_VALIDATOR.md) | Attribute framework — single-schema validator (2026-09-08) — `com.sportconnect.common.attributes.validate`: `AttributeSchemaValidator` (public static, Spring-free) + pkg-private `LeafChecks` / `NodeValidators` / `FieldValidators` / `DefinitionRegistryValidator` (exhaustive `switch` over the sealed sets, not a class registry) + `value/AttributeValues.isValid` primitive core. Ported `SportAttributeSchemaValidatorSpec` — ~40 rule cases + a 14-case "structurally rejected at parse" `@Unroll` for the misplacements the sealed model + C5 D8 now catch at parse. C5 `defaultValue` reverted to `Object` (Jackson coercion diverged from `isValid`). Green: `:modules:common:test` 148 (+122) · `:server:test` 179 (C5's 9 RabbitMQ flakes did not recur) | `DONE` (2026-09-08) |
| 3 | [C5](MVP/C5_SHARED_ATTRIBUTE_FRAMEWORK_HOME.md) | Attribute framework — ADR + neutral DTO tree (2026-09-08) — `documentation/md/adr/ATTRIBUTE_FRAMEWORK_EXTRACTION_ADR.md` (home = `common`, "shape not logic" overridden narrowly; D1–D11) + `com.sportconnect.common.attributes`: `AttributeType`/`Cardinality` enums, `AttributeSchema`/`Group`/`DefinitionType`/`Option`, sealed `AttributeNode` (8 subtypes incl. `RefAttribute`) + sealed `AttributeField` (6), flat `ResolvedAttribute*`, `AttributeJson` (strict `ObjectMapper`, `@JsonTypeInfo(As.PROPERTY,"type")`). No business logic (C6–C9). 6 round-trip parity specs — real Badminton v3 schema + all-kinds fixture + `#ref` fixture round-trip lossless; misplaced field → parse failure (D8). Split from the original all-in-one C5; master plan `documentation/md/ATTRIBUTE_FRAMEWORK_EXTRACTION_PLAN.md`. Green: `:modules:common:test` (26); `:server:test` 170 pass / 9 pre-existing RabbitMQ parallel-load flakes (pass isolated); `assemble` all modules | `DONE` (2026-09-08) |
| 4 | [C4](MVP/C4_NO_RESOURCE_FOUND_MAPS_TO_404.md) | Map swallowed Spring MVC exceptions to their real HTTP status (2026-09-03) — `GlobalExceptionHandler extends ResponseEntityExceptionHandler`: no-route → **404**, wrong method → **405**, wrong/absent `Content-Type` → **415**, unacceptable `Accept` → **406**, unreadable body → **400**, path-var type mismatch → **400** (all were **500** via the `Exception` catch-all); one `handleExceptionInternal` override re-envelopes as `ApiResponse`, the two field-specific handlers become `@Override`s to dodge "Ambiguous @ExceptionHandler". Widened at pickup from "404 only". Surfaced by sport A22's smoke test. Green: `:modules:common:test`, full `:server:test`, live smoke | `DONE` |
| 5 | [C3](MVP/C3_TRANSACTIONAL_OUTBOX.md) | Generic transactional-outbox mechanism | `DONE` |
| 6 | [C2](MVP/C2_RESOURCE_GATE.md) | `ResourceGate<T>` — shared availability/visibility check shape | `DONE` |
| 7 | [C1](MVP/C1_GLOBAL_EXCEPTION_HANDLER.md) | Global exception handler for common exception types | `DONE` |
