# SESSION-11 · Drop DB-level FKs on session tables' cross-domain columns

**Status:** DONE (2026-08-10)
**Type:** Enhancement (Architecture)
**Migration:** `V046__drop_session_tables_cross_domain_fks.sql`

## Context

Filed 2026-08-10 in a repo-wide sweep for cross-domain DB-level FKs (see `aac6e6b`), following
the precedent set by `post-impl`'s A13 (`posts.sport_id`). Four `session-impl`-owned columns
carried a real Postgres FK across into `user-impl`'s `users` or `location-impl`'s `locations` — a
hard schema coupling that works against "monolith-first, microservice-ready." Unlike A13/A6/A8/
A15/B17 (this repo's other FK-drop tickets), this isn't a "predates the rule" story:
`V031__create_sessions_table.sql` and `V032__create_session_participants_table.sql` were both
first committed 2026-07-30, nearly a month after root `CLAUDE.md`'s "cross-domain references use
IDs only" rule (2026-07-07) — and the same migration's `sessions.sport_id` column already gets it
right (plain unenforced `BIGINT`, no FK). `created_by`/`cancelled_by`/`location_id` were missed in
the same file despite that, and despite `groups.sport_id` and `locations.sport_id` having already
established the FK-free pattern by the time this module was built.

## What was verified before implementing

1. **Constraint names**, via `\d <table>` against the live `sportconnect_dev` database:
   - `sessions_created_by_fkey`
   - `sessions_cancelled_by_fkey`
   - `sessions_location_id_fkey`
   - `session_participants_user_id_fkey`

   All matched the ticket's stated names exactly, all `NO ACTION` (not `CASCADE`).

2. **No code path relies on the FK rejecting a dangling reference.** All four constraints are
   `NO ACTION`, so there was no cascade-delete behavior to lose either way. Grepped
   `session-impl`'s tests for `DataIntegrityViolationException`/`ConstraintViolationException` —
   one hit (`SessionGenerationServiceSpec.groovy:103`), unrelated: it's about the
   `unique_group_session_start` unique constraint (duplicate session at the same group+time), not
   any of the four FKs being dropped.

## What was built

One Liquibase changeset, `V046__drop_session_tables_cross_domain_fks.sql`, registered in
`db.changelog-master.xml`:

```sql
ALTER TABLE sessions DROP CONSTRAINT sessions_created_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_cancelled_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_fkey;
ALTER TABLE session_participants DROP CONSTRAINT session_participants_user_id_fkey;
```

Purely schema-level — no entity, repository, service, or DTO change. All four JPA fields
(`Session.createdBy`/`cancelledBy`/`locationId`, `SessionParticipant.userId`) already stored the
value as a plain `UUID`/`Long` with no `@ManyToOne`, so the application layer was already
compliant; only the schema constraints weren't.

## Verification

- Applied against the running dev DB via `:server:bootRun` (Liquibase auto-runs on context
  init) — changeset ran successfully in 17ms, recorded in `databasechangelog`.
- Confirmed via `\d <table>` post-migration: all four FKs gone. `sessions`' other constraints
  (`sessions_pkey`, `unique_group_session_start`) and every index untouched; the intra-domain
  `session_participants_session_id_fkey` (→ `sessions.id`, same domain, correctly scoped) and
  `unique_session_user` untouched.
- `./gradlew :modules:session:session-impl:test` — pass.
- `./gradlew :server:test` — pass (confirms the H2 test-profile schema and Spring context are
  unaffected).

## Out of scope (unchanged)

`sessions.sport_id` — already correctly FK-free, nothing to do. The intra-domain
`session_participants.session_id → sessions.id` FK — same domain, correctly scoped, not removed.
Any change to any JPA entity, service, or repository in `session-impl`.

---

**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/session/docs/MVP/SESSION-11_DROP_CROSS_DOMAIN_FKS.md`
**Type:** Enhancement (Architecture) · **Filed:** 2026-08-10, as part of a
repo-wide sweep for cross-domain DB-level FKs, following the precedent set by `post-impl`'s A13
(`posts.sport_id`, `TODO`) — same rationale, applied domain-by-domain.

**Found:** four `session-impl`-owned columns carry a real Postgres FK across into a different
domain's table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `sessions.created_by` → `sessions_created_by_fkey` (into `user-impl`'s `users`, `NO ACTION`)
- `sessions.cancelled_by` → `sessions_cancelled_by_fkey` (into `users`, `NO ACTION`)
- `sessions.location_id` → `sessions_location_id_fkey` (into `location-impl`'s `locations`,
  `NO ACTION`)
- `session_participants.user_id` → `session_participants_user_id_fkey` (into `users`, `NO ACTION`)

**This one is not a "predates the rule" story like A13/A8/A15/B17.** `V031__create_sessions_table.sql`
and `V032__create_session_participants_table.sql` were both first committed **2026-07-30** — nearly
a month *after* root `CLAUDE.md`'s "cross-domain references use IDs only" rule was added
(2026-07-07), and this module's own `sessions.sport_id` column (same migration) already gets this
right — it's a plain unenforced `BIGINT`, no FK. `created_by`/`cancelled_by`/`location_id` were
missed despite the same file getting `sport_id` correct, and despite `groups.sport_id`
(`group-impl`) and `locations.sport_id` (`location-impl`) both already having established the
FK-free pattern by the time this module was built. All four columns are already plain `UUID`/`Long`
fields in their JPA entities (`Session.createdBy`/`cancelledBy`/`locationId`,
`SessionParticipant.userId`), no `@ManyToOne` — confirmed by reading the entities directly, not
assumed — so the application layer already complies; only the schema constraint doesn't, same end
state as the pre-rule cases even though the cause here is a miss, not an artifact of timing.

**Why it matters:** same as A13 — each of these is a hard schema coupling between `session-impl` and
either `user-impl` or `location-impl`, working against "monolith-first, microservice-ready."

**Fix approach:**
```sql
ALTER TABLE sessions DROP CONSTRAINT sessions_created_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_cancelled_by_fkey;
ALTER TABLE sessions DROP CONSTRAINT sessions_location_id_fkey;
ALTER TABLE session_participants DROP CONSTRAINT session_participants_user_id_fkey;
```
Confirm every constraint name via `\d <table>` before writing the migration. One new Liquibase
changeset, next sequential `Vxxx` file, registered in `db.changelog-master.xml`. No entity/service/
DTO change — purely schema-level.

**Verify before/after:** all four are `NO ACTION` (not `CASCADE`), so there's no delete-cascade
behavior to lose — dropping these is lower-risk than A13/A8/A15/B17's `CASCADE` cases. Confirm no
code path relies on the FK rejecting an insert with a dangling `created_by`/`cancelled_by`/
`location_id`/`user_id` (e.g. a test deliberately asserting a DB-level constraint violation rather
than the service layer's own `ResourceNotFoundException`/`BadRequestException` checks) before
dropping.

**Out of scope:** `sessions.sport_id` (already correctly FK-free, nothing to do); the intra-domain
`session_participants.session_id → sessions.id` FK — same domain, correctly scoped, nothing to
remove; any change to any JPA entity, service, or repository in this module.
