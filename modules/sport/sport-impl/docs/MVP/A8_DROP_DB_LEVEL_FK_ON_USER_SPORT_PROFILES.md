# A8 · Drop DB-level FK on `user_sport_profiles.user_id`

**Status:** `TODO`
**Type:** Enhancement (Architecture)
**Filed:** 2026-08-10, as part of a repo-wide sweep for cross-domain DB-level FKs, following the
precedent set by `post-impl`'s A13 (`posts.sport_id`, `TODO`) — same rationale, applied
domain-by-domain (this module's own counterpart: a `sport-impl` table referencing *into*
`user-impl` instead of A13's `post-impl` table referencing into this module).

**Found:** `user_sport_profiles.user_id` carries a real Postgres FK into `users` (owned by
`user-impl`, a different domain) — constraint name `user_sport_profiles_user_id_fkey`,
`ON DELETE CASCADE`. Confirmed via `information_schema.table_constraints` against the live
`sportconnect_dev` database. Predates root `CLAUDE.md`'s "cross-domain references use IDs only"
rule (added 2026-07-07) — the table was created well before that (A3's JSONB `attributes` column
was added later, but the base table and this FK predate it), never retrofitted since Liquibase
migrations are append-only. `UserSportProfile.userId` is already a plain `UUID` field in the JPA
entity, no `@ManyToOne` — the application layer already complies; only the schema constraint
doesn't.

**Why it matters:** same as A13 — a DB-level FK is a hard schema coupling that works against
"monolith-first, microservice-ready." Extracting `sport` into its own service later would need
this dropped first as a blocking pre-step.

**Fix approach:**
```sql
ALTER TABLE user_sport_profiles DROP CONSTRAINT user_sport_profiles_user_id_fkey;
```
Confirm the actual constraint name via `\d user_sport_profiles` before writing the migration.
One new Liquibase changeset, next sequential `Vxxx` file, registered in
`db.changelog-master.xml`. No entity/service/DTO change — purely schema-level.

**Verify before/after:** confirm no code path relies on the FK's `ON DELETE CASCADE` — a user
hard-delete would currently cascade-remove their sport profiles automatically; grep
`UserServiceImpl` for a hard-delete-user path (per A2 in `user-impl`'s own backlog, deletes there
are soft via `is_active`, so this cascade has likely never fired in practice, but confirm rather
than assume).

**Out of scope:** `sports` table itself (no FK to remove, it's this module's own root entity);
`user_sport_profiles.sport_id` (already intra-domain, both owned by `sport-impl`, correctly no
issue); any change to `UserSportProfile`'s JPA entity or `UserSportProfileServiceImpl`.

---
