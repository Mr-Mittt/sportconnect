# CHAT-22 · Apply the schema migrations at startup, embedded in the binary

**Status:** `DONE` (2026-10-30) · **Type:** Enhancement (Architecture, deploy) · **Depends on:** none (INFRA-6 depends on this ticket)

**Filed:** 2026-10-29, from the INFRA-6 Phase 1 discussion (question 4: how the chat schema is applied on a deploy). The chat image (INFRA-8) contains no migrations, and decision (owner, 2026-10-29) is that a version brings its own schema, applied when the service starts, like the server's Liquibase.

## What

Today `services/chat/migrations/*.up.sql` / `*.down.sql` (000001 to 000004) are applied from outside: by the `golang-migrate` CLI in dev (`services/chat/CLAUDE.md`), and by `psql` over the copied `.up.sql` files in `infra/oracle/scripts/run-containers.sh` on the box. The binary has no migration code and `go.mod` has no migrate dependency.

Embed the migrations in the binary (`go:embed`) and apply them at startup, before the service listens, using the `golang-migrate` **library** (with its pgx driver) rather than a hand-written runner: the library keeps its state in the same `schema_migrations` table as the CLI, so a database already migrated by the CLI is recognised as up to date, and it takes a Postgres advisory lock, so two instances cannot collide. A failed migration makes startup fail (the dirty flag is set by the library); INFRA-6's health probe sees that and the deploy command rolls back to the previous container.

## Points to settle at pickup

- **The production database was built with `psql`**, so it has no `schema_migrations` table. The first start of the new image would try to apply `000001` onto existing tables. Settle one of: seed `schema_migrations` once on the box at version 4 (simplest; goes into the deployment guide as a one-time step, with the command), or make the first run tolerant. Verify the seeding against a throwaway database with a real "created by psql, then started" run. **Superseded by the scope change below (no seeding).**
- **Dependency.** `services/chat/CLAUDE.md` fixes the stack (stdlib `net/http`, `pgx`, plain wiring). A migration library is a new dependency; say so in the ticket summary and update that file. Check that the pgx driver of `golang-migrate` matches the pgx version already used.
- **Dev flow.** `go run ./cmd/chat` should keep working against a fresh dev database (it will now create the schema itself); the CLI commands in `CLAUDE.md`, `README.md` and `GO_MUST_KNOW.md` become optional (still needed for `down 1`). Decide whether startup migration can be switched off by an environment variable (default on) for tests and for a database managed elsewhere.
- **Down migrations are not applied at startup.** Going back to an older chat release has the same schema problem as the server's: see INFRA-17.
- **Tests.** The migrations applying on an empty database and being a no-op on a second start, against a real Postgres (the dev stack's `sportconnect_chat_dev`, or a throwaway database), and the failure path (a broken migration makes startup exit non-zero).
- **Then:** `run-containers.sh` stops applying `*.up.sql` with `psql` (INFRA-6 replaces that script), the chat env example needs nothing new unless the switch above is added, and the change ships as a chat release (`/release chat`) so INFRA-6 has an image that migrates itself.

## Out of scope

- Down migrations at startup, and a tool to roll the chat schema back (INFRA-17).
- Any change to the chat tables themselves.

## Scope change 2026-10-30 (owner, at pickup): the first migration rebuilds the schema

The one-time seeding of `schema_migrations` is dropped. Instead `000001_create_conversations.up.sql` starts with `DROP TABLE IF EXISTS ... CASCADE` for every chat table (`chat_messages`, `conversation_participants`, `conversations`, `group_members_cache`, `friendships_cache`, `user_profiles_cache`, `sync_state`), and `000002` to `000004` stay plain. Why: 000001 to 000004 only build the initial schema, so a database that has the chat tables but no `schema_migrations` (the box, built with `psql`) is rare and is best reset to the known shape; `IF NOT EXISTS` would keep a table of the wrong shape without noticing.

- On an empty database the drops do nothing. A database already at version 1 or later never runs `000001` again, so dev databases and the box after its first start are untouched.
- **Data loss is intended in that one case:** the first start of this image on the box drops its chat messages, conversations and caches. `sync_state` goes too, so the cold-start bootstrap runs again and refills the caches. The deployment guide step says to take a `pg_dump` first if the messages matter, and to expect empty chat history.
- Test: build the schema with the old plain `psql` files, add rows, start with the new migrations, and assert the schema has the four-migration shape, the version is 4 and `dirty` is false.

## Implementation summary (2026-10-30)

**Design, as approved.** The migrations are embedded in the binary and applied by the golang-migrate **library** (pgx v5 driver, iofs source) before the pool opens, so the image brings its own schema. State is the same `schema_migrations` table the CLI uses, and the library's Postgres advisory lock keeps two starting instances apart. `000001` rebuilds the chat tables (scope change above), so no seeding step exists. `CHAT_MIGRATE_ON_START` (default on) switches it off.

**What was built**
- `migrations/embed.go`: package `migrations`, `//go:embed *.sql`, `var FS`. It sits next to the SQL because `go:embed` cannot reach outside its own directory; it is the one Go file outside `internal/` (noted in `CLAUDE.md`).
- `internal/db/migrate.go`: `Migrate(url, logger)` and `MigrateFS(url, fs, logger)` (the second so a test can feed a broken migration). `ErrNoChange` logs "schema is up to date"; a failure returns an error that carries the version and the dirty flag.
- `internal/config/config.go`: `MigrateOnStart`. `cmd/chat/main.go`: `Migrate` runs right after the config loads, before `db.NewPool`, so the `sync_state` check that decides the cold-start bootstrap sees the new tables; a failure exits 1.
- `migrations/000001_create_conversations.up.sql`: `DROP TABLE IF EXISTS ... CASCADE` for the seven chat tables first. `000002` to `000004` and every `.down.sql` are unchanged.
- `services/chat/.dockerignore`: the `migrations` line is gone (it kept the SQL out of the build context, which would have broken the embed).
- `go.mod`: `github.com/golang-migrate/migrate/v4 v4.20.1`. It raises the `go` line from 1.25.0 to 1.25.11 and bumps `golang.org/x/sync`, `golang.org/x/text` and two test-only libraries; pgx stays at `v5.10.0` (the driver uses pgx through `database/sql`). CI reads the Go version from `go.mod`; the Dockerfile's default `GO_VERSION=1.25` still builds (verified).

**Docs.** `services/chat/CLAUDE.md` (stack row, directory structure, commands, env table), `README.md`, `GO_MUST_KNOW.md`, both `.env.example` files, the comment in `sportconnect-deploy.sh`, `PRODUCTION_DEPLOYMENT_GUIDE.md` (section 16 chat-schema bullet rewritten, the "(not run yet)" note, change-history row) and a pointer in INFRA-6.

**Consumer census.** Dev databases (already at version 4): compatible as-is, `000001` never reruns. CI (fresh Postgres plus the `migrate` CLI): compatible as-is, the drops do nothing on an empty database, so the CLI step stays. The box (built with `psql`, no `schema_migrations`): updated in this change, its first start rebuilds the chat database. `run-containers.sh`: already replaced by INFRA-6. Client and Java side: no contract change.

**Tests (all against the real dev Postgres, each in a throwaway database)**

| Test | Proves |
|---|---|
| `TestMigrate_EmptyDatabaseGetsTheFullSchema` | version 4, not dirty, seven tables, the two 000004 columns |
| `TestMigrate_SecondRunChangesNothing` | a restart is a no-op and keeps rows |
| `TestMigrate_DatabaseBuiltByPsqlIsRebuilt` | schema built by the old plain files, with rows and no `schema_migrations`: ends at version 4, not dirty, chat tables and `sync_state` emptied |
| `TestMigrate_BrokenMigrationFailsAndLeavesTheDatabaseDirty` | a bad `000002` returns an error naming "dirty true" and leaves version 2, dirty |
| `TestMigrate_TwoInstancesStartingTogether` | two parallel `Migrate` calls both succeed, version 4 |
| `TestLoad_MigrateOnStart` (`internal/config`) | default on; `true`, `false`, `0` |

**Mutation check.** With the `DROP` removed from `000001`, `TestMigrate_DatabaseBuiltByPsqlIsRebuilt` fails with `relation "conversations" already exists` (version 1, dirty); with it restored the package passes. The two-instance test was not mutation-checked (it would need the advisory lock taken out of the library).

**Run results.** `go build ./...`, `go vet ./...` and `go test ./... -count=1` all pass (every package `ok`). The real image was built (`docker build`) and run against throwaway databases: an empty database ended at version 4 with all tables; a restart logged "schema is up to date" at version 4; `CHAT_MIGRATE_ON_START=false` created nothing; an unreachable database logged "failed to migrate chat database" and exited 1 before the server started. In both started runs the cold-start bootstrap then failed only because no monolith was running; the throwaway databases and the test image were removed afterwards.

**Not run.** The first start on the box (INFRA-6 box checks, after a chat release that contains this change; `/release chat` is not done by this ticket). The `down` migrations were not touched or run. `gofmt -l` lists every file in the module because the working copy is CRLF, as before this change; the new Go files were formatted with `gofmt -w`.
