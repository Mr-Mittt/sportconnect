# A18 · Remove `user_sport_profiles.preferred_position`

**Status:** `DONE` (2026-09-07)
**Type:** Enhancement (Architecture)
**Depends on:** none. Coordinate with client **SPORT-8** (removes the field from the profile editor).
**Filed:** 2026-09-02 — user decision: the fixed `preferred_position` column was a mistake. "Position"
is sport-specific (it means something for football, nothing for running, singles/doubles for
badminton), so it belongs in the per-sport attribute schema (A9), not as a flat column sitting
next to `skill_level`/`years_of_experience`.

## What ships

- Liquibase migration dropping `user_sport_profiles.preferred_position` (V003 added it).
- Remove `preferredPosition` from the `UserSportProfile` entity, `CreateUserSportProfileRequest`
  (and its `@Size(max = 100)`), and `UserSportProfileResponse`.
- Remove every `get/setPreferredPosition` in `UserSportProfileServiceImpl` (create, reactivation,
  update null-check block, `toUserSportProfileResponse`).
- Update `server/src/test/resources/schema.sql` if it mirrors the column; fix Spock specs.

No data migration — Badminton/Pickleball schemas don't use it, the column is nullable free text,
and the app is pre-launch. Verify no real rows depend on it at pickup.

## Client-visible

`UserSportProfileResponse` loses a field — a breaking DTO change. Client cleanup is **SPORT-8**,
filed alongside; sequence SPORT-8 first (client stops reading/sending the field) or land them
together, but don't drop the column while the client still references it.

## Out of scope

Adding a "position" attribute to any sport's A9 schema — that's per-sport product content an admin
can add later via ADMIN-2, not this ticket.

## Tests

Existing `UserSportProfileServiceImplSpec` / IT updated to drop the field; a migration smoke check
that the column is gone.

---

## Implementation (2026-09-07)

Straight execution of the plan — no divergence.

### What was built

- **`V063__drop_preferred_position_from_user_sport_profiles.sql`** — `ALTER TABLE
  user_sport_profiles DROP COLUMN IF EXISTS preferred_position;`, registered after V062. No data
  migration (nullable free text, pre-launch; dev DB had 47 profile rows, 1 non-null — test data).
- **`UserSportProfile` entity** — removed the `@Column(name = "preferred_position", length = 100)`
  field.
- **`sport-api` DTOs** — removed `preferredPosition` (+ its `@Size(max = 100)`) from
  `CreateUserSportProfileRequest` and removed the field from `UserSportProfileResponse`. Scrubbed the
  term from the `isResume` Javadoc's scalar-column list.
- **`UserSportProfileServiceImpl`** — removed all 5 sites: the reactivation-as-create setter, the
  create builder, the `update` null-check block (`if (request.getPreferredPosition() != null) …`
  gone entirely), the response builder, and the A20 pure-reactivation Javadoc's scalar list.
- **`server/src/test/resources/schema.sql`** — dropped the `preferred_position VARCHAR(100)` column
  from the H2 `user_sport_profiles` mirror.
- **Tests** — `UserSportProfileServiceImplSpec` (create / stale-inheritance / A20 resume /
  update-all-fields), `UserSportProfileSpec` (entity), and
  `SportProfileResumeAndVisibilityIntegrationTest` had `preferredPosition` builder calls and
  assertions removed; each test still proves its point via the remaining scalars (`skillLevel`,
  `bio`, `yearsOfExperience`).

`V003` is left untouched (historical migration). No `SecurityConfig`, `common`, controller, or
endpoint change — a stale client still sending `preferredPosition` in a create/update body gets a
harmless no-op (Jackson ignores unknown fields).

### Client / cross-module

- **Client:** none — SPORT-8 (merged PR #223, 2026-09-04) already removed every read/write of the
  field from `client/src` and the MSW mocks. A18 completes the pair; the `UserSportProfileResponse`
  DTO-shrink has no remaining consumer.
- **Consumer census:** grep of all backend `modules` main source found `preferredPosition` only in
  `sport-api` / `sport-impl` (all updated here); no repository `@Query` / JPQL / native SQL named the
  column; no other domain reads it.
- **Stale doc note:** A20's and A21's summaries list `preferredPosition` among the profile "scalar
  columns" — accurate when written, now stale. A20 carries a Delta pointing here; A21/A3 are left as
  historical record.

### Tests run

Green: `:modules:sport:sport-impl:test` (280), `:server:test` (175). `V063` applied cleanly against
dev Postgres via `:server:bootRun` and the column verified gone from `information_schema`; Hibernate
`ddl-auto: validate` passed against the updated entity.
