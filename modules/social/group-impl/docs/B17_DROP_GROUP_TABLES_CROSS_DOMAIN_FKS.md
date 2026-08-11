# B17 · Drop DB-level FKs on group-impl tables' cross-domain columns

**Status:** DONE (2026-08-11)
**Type:** Enhancement (Architecture)
**Migration:** `V049__drop_group_tables_cross_domain_fks.sql`

## Context

Filed 2026-08-10 as part of a repo-wide sweep for cross-domain DB-level FKs, following the
precedent set by `post-impl`'s A15 (absorbing A13) — same rationale, applied domain-by-domain.
Five `group-impl`-owned columns carried a real Postgres FK across into a different domain's
table, all predating root `CLAUDE.md`'s "cross-domain references use IDs only" rule (added
2026-07-07): `groups`/`group_members`/`group_join_requests` were all created 2026-03-04, well
before the rule. `groups.sport_id` (`V015`, added the same commit as the rule) was already
correctly FK-free — this ticket doesn't touch it, nothing to do there.

## Design (approved plan, restated)

Drop exactly five FK constraints, schema-only — no entity/service/DTO changes, since every one
of these columns was already a plain `UUID`/`Long` field in its JPA entity (`Group.createdBy`,
`Group.recurrenceLocationId`, `GroupMember.userId`, `GroupJoinRequest.userId`/`reviewedBy`), no
`@ManyToOne` anywhere — the application layer already complied; only the schema constraint
didn't.

## What was verified before implementing

1. **Constraint names**, via `\d <table>` against the live `sportconnect_dev` database (Docker
   container `sportconnect-dev-postgres-1`), for all 5 columns — all matched the ticket's stated
   names exactly:
   - `groups_created_by_fkey` (→ `users`, `ON DELETE CASCADE`)
   - `groups_recurrence_location_id_fkey` (→ `locations`, `NO ACTION`)
   - `group_members_user_id_fkey` (→ `users`, `ON DELETE CASCADE`)
   - `group_join_requests_user_id_fkey` (→ `users`, `ON DELETE CASCADE`)
   - `group_join_requests_reviewed_by_fkey` (→ `users`, `NO ACTION`)
2. **No code path relies on `groups.created_by`'s `ON DELETE CASCADE`** — the one cascade among
   these five, and the specific risk the ticket flagged (a hard user-delete would cascade-delete
   every group they created, and transitively every member row via `group_members`'s own
   cascade). Grepped and confirmed `UserServiceImpl.deleteUser()` is a soft delete
   (`isActive = false`) — it never hard-deletes a `users` row, so the cascade has never fired in
   practice. Same finding as A15 made for the analogous `posts.user_id`/`posts.group_id` cascades.

## What was built

One Liquibase changeset, `V049__drop_group_tables_cross_domain_fks.sql`, registered in
`db.changelog-master.xml` immediately after A15's `V048`:

```sql
ALTER TABLE groups DROP CONSTRAINT groups_created_by_fkey;
ALTER TABLE groups DROP CONSTRAINT groups_recurrence_location_id_fkey;
ALTER TABLE group_members DROP CONSTRAINT group_members_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_user_id_fkey;
ALTER TABLE group_join_requests DROP CONSTRAINT group_join_requests_reviewed_by_fkey;
```

No entity, repository, service, or DTO change — purely schema-level, matching A15's shape
exactly.

## Verification

- Applied against the running dev DB via `:server:bootRun` — Liquibase auto-ran the changeset on
  context init (`23ms`), recorded in `databasechangelog`. Server started fully; a `curl` to
  `/api/groups/public` (unauthenticated) returned a clean `401 Unauthorized` JSON response —
  correct behavior, confirms the app boots and serves requests normally post-migration.
- Confirmed via `\d <table>` post-migration: all 5 cross-domain FKs gone from `groups`,
  `group_members`, `group_join_requests`. Every intra-domain FK (`*_group_id_fkey` →
  `groups.id`, `group_members_role_id_fkey` → `group_roles.id`) and every index/check constraint
  untouched.
- `./gradlew :modules:social:group-impl:test` — pass (no test changes needed; no logic changed).
- `./gradlew :server:test` — pass, no regressions.

No divergence from the approved design — implementation matches the ticket spec exactly, same
shape as A15's precedent.

## Out of scope (unchanged from ticket)

`groups.sport_id` (already correctly FK-free, nothing to do); any same-domain (intra
`group-impl`) FK — `group_members.group_id`, `group_join_requests.group_id`,
`group_settings.group_id`/`group_type_id`, `group_invitation_inviters.invitation_id` — all
correctly scoped, nothing removed; any change to any JPA entity, service, or repository in this
module.
