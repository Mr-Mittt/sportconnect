# LOC-3 · Drop DB-level FKs on location tables' cross-domain columns

**Status:** DONE (2026-08-10)
**Type:** Enhancement (Architecture)
**Migration:** `V045__drop_location_tables_cross_domain_fks.sql`

## Context

Filed 2026-08-10 in a repo-wide sweep for cross-domain DB-level FKs (see `aac6e6b`), following
the precedent set by `post-impl`'s A13 (`posts.sport_id`). Two `location-impl`-owned columns
carried a real Postgres FK across into `users`, owned by the `user-impl` domain — a hard schema
coupling that works against "monolith-first, microservice-ready." Unlike `auth-impl`'s sibling
ticket (A6), this isn't a "predates the rule" story: `V030__create_locations_table.sql` was first
committed 2026-07-30, nearly a month after root `CLAUDE.md`'s "cross-domain references use IDs
only" rule (2026-07-07) — and the same migration's `locations.sport_id` column already gets it
right (plain unenforced `BIGINT`, no FK). `created_by` was simply missed in the same file.
`user_favorite_locations.user_id` (`V038`, LOC-2, 2026-08-02) repeats the same miss.

## What was verified before implementing

1. **Constraint names**, via `\d <table>` against the live `sportconnect_dev` database:
   - `locations_created_by_fkey` (`NO ACTION`)
   - `user_favorite_locations_user_id_fkey` (`ON DELETE CASCADE`)

   Both matched the ticket's stated names exactly.

2. **No code path relies on `ON DELETE CASCADE`.** `locations.created_by` is `NO ACTION`, so there
   was no cascade behavior to lose there. For `user_favorite_locations.user_id`: grepped
   `user-impl` for a hard-delete-user path — none exists. `UserServiceImpl.deleteUser()` is a soft
   delete (`isActive = false`, save), the only delete method on `UserRepository`'s call sites.
   Same finding already confirmed for auth-impl's A6 earlier the same session.

## What was built

One Liquibase changeset, `V045__drop_location_tables_cross_domain_fks.sql`, registered in
`db.changelog-master.xml`:

```sql
ALTER TABLE locations DROP CONSTRAINT locations_created_by_fkey;
ALTER TABLE user_favorite_locations DROP CONSTRAINT user_favorite_locations_user_id_fkey;
```

Purely schema-level — no entity, repository, service, or DTO change. Both `Location.createdBy`
and `UserFavoriteLocation.userId` already stored the value as a plain `UUID` field with no
`@ManyToOne`, so the application layer was already compliant; only the schema constraint wasn't.

## Verification

- Applied against the running dev DB via `:server:bootRun` (Liquibase auto-runs on context
  init) — changeset ran successfully in 16ms, recorded in `databasechangelog`.
- Confirmed via `\d <table>` post-migration: both FKs gone. `locations`' other constraint
  (`locations_pkey`) and indexes untouched; the intra-domain
  `user_favorite_locations_location_id_fkey` (→ `locations.id`, same domain, correctly scoped)
  and `user_favorite_locations_user_id_location_id_key` unique constraint both untouched.
- `./gradlew :modules:location:location-impl:test` — pass.
- `./gradlew :server:test` — pass (confirms the H2 test-profile schema and Spring context are
  unaffected).

## Out of scope (unchanged)

`locations.sport_id` — already correctly FK-free, nothing to do. The intra-domain
`user_favorite_locations.location_id → locations.id` FK — same domain, correctly scoped, not
removed. Any change to any JPA entity, service, or repository in `location-impl`.

---

**Status:** `DONE` (2026-08-10) · **Summary:**
`modules/location/docs/MVP/LOC-3_DROP_LOCATION_CROSS_DOMAIN_FKS.md`
**Type:** Enhancement (Architecture) · **Filed:** 2026-08-10, as part of a
repo-wide sweep for cross-domain DB-level FKs, following the precedent set by `post-impl`'s A13
(`posts.sport_id`, `TODO`) — same rationale, applied domain-by-domain.

**Found:** two `location-impl`-owned columns carry a real Postgres FK across into `user-impl`'s
`users` table, confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database:
- `locations.created_by` → `locations_created_by_fkey` (`NO ACTION`)
- `user_favorite_locations.user_id` → `user_favorite_locations_user_id_fkey` (`ON DELETE CASCADE`)

**Not a "predates the rule" story** (same finding as `session-impl`'s sibling ticket SESSION-11,
filed in the same sweep): `V030__create_locations_table.sql` was first committed 2026-07-30, nearly
a month after root `CLAUDE.md`'s "cross-domain references use IDs only" rule (2026-07-07) — and this
module's own `locations.sport_id` column, added in the very same migration, already gets it right
(plain unenforced `BIGINT`, no FK, same pattern `groups.sport_id` established). `created_by` was
missed despite `sport_id` in the same file getting it right. `user_favorite_locations` (`V038`, LOC-2,
2026-08-02) repeats the same miss on `user_id`. Both columns are already plain `UUID` fields in their
JPA entities (`Location.createdBy`, `UserFavoriteLocation.userId`), no `@ManyToOne` — confirmed by
reading the entities directly — so the application layer already complies; only the schema
constraint doesn't.

**Why it matters:** same as A13 — each of these is a hard schema coupling between `location-impl`
and `user-impl`, working against "monolith-first, microservice-ready."

**Fix approach:**
```sql
ALTER TABLE locations DROP CONSTRAINT locations_created_by_fkey;
ALTER TABLE user_favorite_locations DROP CONSTRAINT user_favorite_locations_user_id_fkey;
```
Confirm both constraint names via `\d <table>` before writing the migration. One new Liquibase
changeset, next sequential `Vxxx` file, registered in `db.changelog-master.xml`. No entity/service/
DTO change — purely schema-level.

**Verify before/after:** `locations.created_by` is `NO ACTION` — no cascade behavior to lose.
`user_favorite_locations.user_id` is `ON DELETE CASCADE` — confirm no code path relies on a hard
user-delete auto-clearing their favorites (plausible but unconfirmed; grep `UserServiceImpl` for a
hard-delete-user path) before assuming the cascade is redundant.

**Out of scope:** `locations.sport_id` (already correctly FK-free, nothing to do); the intra-domain
`user_favorite_locations.location_id → locations.id` FK — same domain, correctly scoped, nothing to
remove; any change to any JPA entity, service, or repository in this module.
