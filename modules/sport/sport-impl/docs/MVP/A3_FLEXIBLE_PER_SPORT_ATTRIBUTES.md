# A3 · Flexible per-sport attributes (JSONB)

**Status:** DONE
**Module:** `modules/sport/sport-impl`
**Date:** 2026-07-03

## Design

Plan as approved before implementation:

1. **Liquibase migration**: `ALTER TABLE user_sport_profiles ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;`
2. **Entity** (`UserSportProfile.java`): new field using Hibernate 6's native JSON mapping:
   ```java
   @JdbcTypeCode(SqlTypes.JSON)
   @Column(columnDefinition = "jsonb")
   @Builder.Default
   private Map<String, Object> attributes = new HashMap<>();
   ```
3. **DTOs** (`sport-api`): add `attributes: Map<String, Object>` (optional) to
   `CreateUserSportProfileRequest` and `UserSportProfileResponse`.
4. **`UserSportProfileServiceImpl`**: inject `ObjectMapper`; new private helper
   `validateAttributesSize(Map<String, Object>)` — serializes via `ObjectMapper`, throws
   `BadRequestException` if over ~4KB; `createProfile()` sets `attributes` from the request
   (defaulting to empty), validates size; `updateProfile()` **merges** rather than replaces, then
   validates the merged map's size; `toUserSportProfileResponse()` includes
   `.attributes(profile.getAttributes())`.
5. **Tests**: create profile with attributes persists them; update merges new keys without
   dropping existing ones; oversized payload rejected with `BadRequestException`.

**Verified before implementing (the ticket's own explicit open question):** confirmed via
`./gradlew :modules:sport:sport-impl:dependencies` that the actually-resolved `hibernate-core` is
**6.3.1.Final** (managed by Spring Boot 3.2.0's BOM) — not 6.4 as an earlier pass at this doc
mis-stated by conflating it with `hibernate-spatial:6.4.0.Final` (a separately-pinned artifact used
elsewhere for PostGIS; its version doesn't determine `hibernate-core`'s). Confirmed Hibernate 6.x's
native JSON mapping is genuinely available and not deprecated in this exact version by extracting
`JdbcTypeCode.class`/`SqlTypes.class` from the real resolved jar and inspecting the bytecode with
`javap -v`: `SqlTypes.JSON` exists (`= 3001`) with no `Deprecated` attribute, and `JdbcTypeCode` is a
plain, non-deprecated annotation. No extra library needed, unlike the older Hibernate 5
`hibernate-types` approach. Compiling this project's code (successfully) further confirmed the
classes resolve correctly on the classpath.

No divergence — implementation matched the plan exactly.

## What was built

- **`V025__add_attributes_to_user_sport_profiles.sql`** — new nullable-with-default JSONB column,
  registered in `db.changelog-master.xml`.
- **`UserSportProfile.attributes`** — `Map<String, Object>`, `@Builder.Default`-initialized to an
  empty map (never null for a newly built entity, matching the DB column's default).
- **`CreateUserSportProfileRequest.attributes`** / **`UserSportProfileResponse.attributes`** — both
  optional, no per-key validation (frontend owns which keys make sense per sport, per the ticket).
- **`UserSportProfileServiceImpl`**:
  - `createProfile()` — attributes default to an empty map if not provided, validated before save.
  - `updateProfile()` — attributes, if provided, are merged into the existing map
    (`new HashMap<>(profile.getAttributes()); merged.putAll(request.getAttributes())`) rather than
    replacing it, then the merged result is size-validated before save.
  - New `MAX_ATTRIBUTES_BYTES = 4096` constant and `validateAttributesSize()` helper using the
    injected `ObjectMapper` (same DI pattern already used in `PostServiceImpl`/`CommentServiceImpl`
    for JSON serialization elsewhere in the codebase).

## Key decisions

- **Merge, not replace, on update** — a sport-specific frontend form only sends the keys it cares
  about (e.g. just `dominantHand` for badminton); replacing wholesale would silently wipe out
  attributes set by a different flow (e.g. a previous session's `strokeStyle` for swimming).
- **No per-key schema validation** — deliberate MVP scope per the ticket; a future
  `sport_attribute_definitions` table is a reasonable upgrade only if sports are added often enough
  to justify it, explicitly called out as over-engineering for now.
- **Frontend rendering not built here** — documented in the ticket as a future client-backlog item
  (static per-sport attribute form config), intentionally out of scope for this backend ticket.

## Non-obvious constraints

- **This is the first JSONB column in the codebase** — no existing pattern to copy from (unlike
  every other ticket in this session, which reused an established pattern). The Hibernate 6 native
  JSON approach was verified against the project's actual dependency versions before implementing,
  not assumed.
- `attributes` defaults to `{}` at both the DB level (migration `DEFAULT '{}'::jsonb`) and the
  entity level (`@Builder.Default = new HashMap<>()`) — a profile's attributes are never `null` in
  practice, simplifying the merge logic (no null-check needed before `new HashMap<>(profile.getAttributes())`).

## Tests

Updated `UserSportProfileServiceImplSpec.groovy`:
- Constructor call updated for the new `ObjectMapper` dependency (a real `new ObjectMapper()`
  instance, not a mock, since size-validation tests need genuine serialization behavior).
- `"createProfile should create new profile successfully"` extended to include and assert
  `attributes`.
- 2 new tests: `"createProfile should reject oversized attributes payload"`,
  `"updateProfile should reject oversized attributes payload"` — both build a ~5KB single-value
  payload (`"x" * 5000`) and assert `BadRequestException` + `0 * profileRepository.save(_)`.
- 1 new test: `"updateProfile should merge new attribute keys without dropping existing ones"` —
  profile starts with `dominantHand`, update sends only `strokeStyle`, asserts the saved/returned
  attributes contain both keys.

Run: `./gradlew :modules:sport:sport-impl:test` — all pass (4 new/changed tests in this area).
`./gradlew :modules:sport:sport-impl:compileJava` succeeds — this also confirms
`@JdbcTypeCode(SqlTypes.JSON)`/`org.hibernate.type.SqlTypes` resolve correctly against the actual
Hibernate version on this project's classpath, the main technical risk this ticket flagged.

**Verification gap, disclosed — larger than usual for this ticket:** `:server:bootRun` reaches the
expected local-Postgres connection failure (no local Postgres running in this sandbox) *before*
Liquibase would even attempt to run `V025`, so the actual `jsonb` column creation and Hibernate's
JSON (de)serialization against a live PostgreSQL instance could **not** be verified here at all —
unlike every other ticket in this session's audit, where the new SQL/JPQL at least matched an
already-proven pattern elsewhere in the codebase. This is genuinely new territory (first JSONB
column, first `@JdbcTypeCode` usage). Strongly recommend running this against a real Postgres
instance (or CI) before merging — specifically: create a profile with `attributes`, restart/reload
it, and confirm the JSON round-trips correctly.

---

**Status:** `DONE`
**Type:** New Feature
**Entities:** `UserSportProfile` (existing entity, add 1 JSONB column)

Split out of a discussion originally framed around the user module's U3 (UserPreference) ticket.
`UserSportProfile` already has fixed columns for generic per-sport data (`skillLevel`,
`yearsOfExperience`, `preferredPosition`, `bio`), but sport-*specific* attributes — e.g. dominant hand
for badminton/tennis, stroke style for swimming — genuinely vary per sport and can't be covered by a
fixed schema without a migration per new attribute per new sport. This ticket's sibling, **U7** in
`modules/user/user-impl/docs/BACKLOG_MVP.md`, covers sport-*agnostic* physical stats (height/weight/
shoe size) instead — deliberately kept as fixed columns there since that set doesn't vary by context.

**Liquibase migration:**
```sql
ALTER TABLE user_sport_profiles ADD COLUMN attributes JSONB DEFAULT '{}'::jsonb;
```

**Entity (`UserSportProfile.java`):** add an `attributes` field mapped to JSONB.

**Open question for implementer:** confirm the exact Hibernate 6.4 + PostgreSQL JSONB mapping approach
(e.g. `@JdbcTypeCode(SqlTypes.JSON)` on a `Map<String, Object>` field) — this is the **first JSONB
column in the codebase**, so there is no existing pattern here to copy; verify library/version support
during Phase 2 explore rather than assuming it "just works" the same as a plain column.

**DTOs (`sport-api`):** add `attributes: Map<String, Object>` (optional) to
`CreateUserSportProfileRequest` and `UserSportProfileResponse`.

**Service impl (`UserSportProfileServiceImpl`):** `updateProfile()` should **merge** new keys into the
existing `attributes` map rather than replacing it wholesale — a sport-specific frontend form only
sends the keys it cares about (e.g. just `dominantHand`) and shouldn't wipe out attributes set by a
different flow.

**Validation:** cap total serialized JSON size (e.g. reject over ~4KB) to prevent abuse; no per-key
schema validation in MVP — the frontend owns which keys make sense for which sport.

**Frontend rendering (documented here, not built in this ticket):** since `attributes` is schema-less
on the backend, the frontend needs its own mapping of `sportId`/category → which attribute keys to
render (e.g. badminton → "Dominant Hand", swimming → "Stroke Style"). Decided: a **static
frontend-side config object**, not a backend-driven `sport_attribute_definitions` schema table — the
latter is a reasonable future upgrade if sports get added often enough to make hardcoding painful, but
is over-engineering for now. A future client-backlog ticket ("static per-sport attribute form config")
should pick this up once this backend ticket lands.

**Tests:** create profile with `attributes` persists them; update merges new keys without dropping
existing ones; oversized payload rejected with `BadRequestException`.

---
