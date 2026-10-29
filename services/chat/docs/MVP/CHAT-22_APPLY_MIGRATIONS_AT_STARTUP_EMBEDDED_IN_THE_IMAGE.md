# CHAT-22 · Apply the schema migrations at startup, embedded in the binary

**Status:** `TODO` · **Type:** Enhancement (Architecture, deploy) · **Depends on:** none (INFRA-6 depends on this ticket)

**Filed:** 2026-10-29, from the INFRA-6 Phase 1 discussion (question 4: how the chat schema is applied on a deploy). The chat image (INFRA-8) contains no migrations, and decision (owner, 2026-10-29) is that a version brings its own schema, applied when the service starts, like the server's Liquibase.

## What

Today `services/chat/migrations/*.up.sql` / `*.down.sql` (000001 to 000004) are applied from outside: by the `golang-migrate` CLI in dev (`services/chat/CLAUDE.md`), and by `psql` over the copied `.up.sql` files in `infra/oracle/scripts/run-containers.sh` on the box. The binary has no migration code and `go.mod` has no migrate dependency.

Embed the migrations in the binary (`go:embed`) and apply them at startup, before the service listens, using the `golang-migrate` **library** (with its pgx driver) rather than a hand-written runner: the library keeps its state in the same `schema_migrations` table as the CLI, so a database already migrated by the CLI is recognised as up to date, and it takes a Postgres advisory lock, so two instances cannot collide. A failed migration makes startup fail (the dirty flag is set by the library); INFRA-6's health probe sees that and the deploy command rolls back to the previous container.

## Points to settle at pickup

- **The production database was built with `psql`**, so it has no `schema_migrations` table. The first start of the new image would try to apply `000001` onto existing tables. Settle one of: seed `schema_migrations` once on the box at version 4 (simplest; goes into the deployment guide as a one-time step, with the command), or make the first run tolerant. Verify the seeding against a throwaway database with a real "created by psql, then started" run.
- **Dependency.** `services/chat/CLAUDE.md` fixes the stack (stdlib `net/http`, `pgx`, plain wiring). A migration library is a new dependency; say so in the ticket summary and update that file. Check that the pgx driver of `golang-migrate` matches the pgx version already used.
- **Dev flow.** `go run ./cmd/chat` should keep working against a fresh dev database (it will now create the schema itself); the CLI commands in `CLAUDE.md`, `README.md` and `GO_MUST_KNOW.md` become optional (still needed for `down 1`). Decide whether startup migration can be switched off by an environment variable (default on) for tests and for a database managed elsewhere.
- **Down migrations are not applied at startup.** Going back to an older chat release has the same schema problem as the server's: see INFRA-17.
- **Tests.** The migrations applying on an empty database and being a no-op on a second start, against a real Postgres (the dev stack's `sportconnect_chat_dev`, or a throwaway database), and the failure path (a broken migration makes startup exit non-zero).
- **Then:** `run-containers.sh` stops applying `*.up.sql` with `psql` (INFRA-6 replaces that script), the chat env example needs nothing new unless the switch above is added, and the change ships as a chat release (`/release chat`) so INFRA-6 has an image that migrates itself.

## Out of scope

- Down migrations at startup, and a tool to roll the chat schema back (INFRA-17).
- Any change to the chat tables themselves.
