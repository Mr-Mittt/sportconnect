# INFRA-17 · Down-version deploy and the database schema: make going back to an older release safe

**Status:** `TODO` · **Type:** Infrastructure (deploy safety, cross-cutting with the server migrations) · **Depends on:** INFRA-6 (the promote workflow and the deploy command this ticket extends)

**Filed:** 2026-10-29, from the INFRA-6 Phase 1 discussion (questions 1 to 3: how the box deploys, where the desired version lives, who runs Liquibase). INFRA-6 ships with migrations running inside the server at startup and with **down-version promotion blocked**; this ticket is what lets that block be lifted.

## Why this exists

INFRA-6 deploys by *promoting* a release to `:prod` (a GitHub workflow with an approval) and then running a deploy command on the box. Pointing `:prod` at an older release is technically just a retag, so going from `0.2.0` back to `0.1.0` would work for the image, but **not necessarily for the database**: `0.2.0` may already have run migrations that `0.1.0` cannot live with. Until this ticket is done, INFRA-6 refuses a promote to a version lower than the one `:prod` points at, and the way out of a bad release is a fixed newer release (roll forward), or a restore from backup if data was damaged.

## What we established (so it need not be rediscovered)

**How migrations work today.** All 86 files in `server/src/main/resources/db/changelog/changes/` are plain SQL ("formatted SQL" included from `db.changelog-master.xml`), run by Liquibase when the server starts. There is no `tagDatabase` anywhere and, apart from a stray mention, no `--rollback` line. About 38 of the 86 files contain `DROP`, `RENAME`, `ALTER COLUMN`, `DELETE` or `UPDATE`. `spring.jpa.hibernate.ddl-auto` is `validate` (`application.yml`): an extra column the entity does not map is fine, a missing or mismatched one fails startup.

**What Liquibase does and does not do.**

- `liquibase rollback` undoes a changeset by running its rollback block and, only then, deletes that changeset's row in `DATABASECHANGELOG`. A raw-SQL changeset without a `--rollback` line cannot be rolled back: the command fails and changes nothing (neither the records nor the schema).
- The execution record is therefore not something to delete by hand. Record removed with the column still there makes the next up-version re-run `ALTER TABLE ... ADD COLUMN` and fail with "column already exists". Record and schema must move together.
- The rollback has to be run with the changelog of the version being left (`0.2.0`), because only that version contains the changesets to undo. It cannot be run by `0.1.0`.
- A database holding records for changesets the running code does not know about (0.2.0's records under 0.1.0) is fine: Liquibase ignores them. Going up again then does nothing, because the records are still there.

**Why "just retag back" is not enough.** It works when the newer release only *added* things (a nullable column, a new table): `0.1.0` ignores them. It fails when the newer release renamed or dropped a column, changed a type, or added a `NOT NULL` column without a default: `0.1.0` expects the old shape.

**Why requiring `--rollback` lines everywhere is a poor default.** They are written while authoring `0.2.0`, before anyone knows a rollback will be needed, they cannot be tested against production data, and rolling back a column drops whatever `0.2.0` stored in it (data loss).

## Options for the pickup (decide in Phase 1 of this ticket)

1. **Expand/contract as the rule** (recommended base). Migrations are expand-only inside a release; removal comes one release later. Then the previous release always still works, and retag-only is safe. Rename `a` to `b`: release N adds `b`, copies data, writes both, reads `b`; a later release drops `a`. Same shape for drops (stop using, drop later), new `NOT NULL` (add nullable or with a default, backfill, constrain later) and type changes (new column of the new type). Cost: a rename takes two releases, with temporary duplicate data. To be written into the migration guidance (and checked by the lint below).
2. **A backup before every deploy that brings new migrations.** The deploy command runs `pg_dump` (the nightly backup scripts exist: `infra/oracle/scripts/backup-postgres.sh`) before the new server starts. If a destructive migration shipped anyway, the way back is that dump plus the old version; writes made since the dump are lost, and the deployment guide must say so.
3. **Opt-in schema rollback.** For a deliberately risky migration, write a `--rollback` block with the migration, tag the database after each successful deploy (`tagDatabase <version>`), and give the deploy command a schema-rollback option that backs up first, runs the Liquibase CLI (container) with the changelog extracted from the image being left, rolls back to the target version's tag, then starts the old version. Refuses if any changeset to undo has no rollback block. Not to be backfilled for the 86 existing files.
4. **A migration lint in CI.** On PRs that add or change a migration file, flag `DROP`, `RENAME`, `ALTER COLUMN` and `NOT NULL` without a default and require an explicit marker (for example `-- contract: <why now>`) so a destructive step is always a conscious one. Applies to new migrations only. A grep-level check, not a framework.
5. **Separate migration step before the restart** (instead of inside the server at startup) for down-version deploys only; the up-version path keeps the startup migration, as decided in INFRA-6. This is how option 3 is run.

## Done when

- A decision recorded (which of the options above, in what order) and the migration guidance written.
- INFRA-6's block on a down-version promote is lifted, or deliberately kept with a stated reason, in `promote.yml` and its summary text.
- If option 2 or 3 is built: `PRODUCTION_DEPLOYMENT_GUIDE.md` and its change-history row updated, the new step proven on a throwaway database with a real "0.N adds a column, go back to 0.N-1, go up again" run, and the data-loss cases written down plainly.

## Out of scope

- Zero-downtime or blue/green deploys, and Keycloak's own database (INFRA-14).
- Rewriting the 86 existing migrations.
- Chat's schema: how it is applied on a deploy is an INFRA-6 question; this ticket may reuse the answer.
