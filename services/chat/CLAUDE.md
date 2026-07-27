# services/chat — Go chat service conventions

This file is the source of truth for this service's conventions, the way `client/CLAUDE.md` is for
the React client. If a ticket or a person says something different, this file wins for anything
under `services/chat/` unless it's explicitly updated. Root `CLAUDE.md`'s domain-boundary
principles (cross-domain via interfaces/contracts only, IDs-only references, no shared mutable
state, domain-scoped tables) still apply here — they're just enforced across a real network/process
boundary instead of a Java package boundary.

## What this is

The first service in this repo that is not a Java Gradle module (`modules/`) and not part of the
React client (`client/`) — a standalone Go + Postgres service owning group chat and 1:1 direct
messages. It talks to the client directly (its own path, reverse-proxy-routed alongside Spring, not
through Spring as a gateway) and to the Java monolith only via: (1) independently verifying the same
JWTs Spring issues, and (2) an async, one-directional data sync (Spring → chat) for authorization
data — never the reverse, and never a live call back into Spring except for the one-time bootstrap
pull. See `docs/SYNC_DESIGN.md` for the full integration contract.

Full architectural rationale (why Go, why event-driven sync, why direct client routing, why the
schema covers group + 1:1 in one lineage): `documentation/md/archive/chat/` (the superseded PubNub
plan) plus the plan that replaced it — check `PROGRESS.md`'s chat entries for the current pointer.

**Ticket backlog:** `docs/BACKLOG_MVP.md` — backend test coverage, full client wiring for both
group chat and 1:1 DMs, and (as of 2026-07-27) message editing/deletion, read receipts, typing
indicators, and attachments too (moved in from V1 the same day they were filed — none of the four
are scoped in detail yet, each still needs its own Phase 1/2/3 pass at pickup).
`docs/BACKLOG_V1.md` is currently empty. Use `/workon chat mvp` / `/workon chat v1` to resume.

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | Go 1.22+ | Cheap goroutine-per-connection concurrency, fits the 1GB production box far better than a second JVM would |
| HTTP routing | stdlib `net/http` (Go 1.22+ `ServeMux` method+pattern routes) | Route surface is small; add a router dependency only if this genuinely stops being true |
| Postgres driver | `github.com/jackc/pgx/v5` (`pgxpool`) | Actively maintained, native pooling — kept deliberately small (`MaxConns`) since this shares the production box with Spring's own connection pool |
| Migrations | `github.com/golang-migrate/migrate/v4` | Closest Go analogue to Liquibase — plain numbered SQL, no ORM-driven schema magic |
| WebSocket | `github.com/coder/websocket` | Modern, `context`-native API; the older `nhooyr.io/websocket` is deprecated in favor of this fork |
| JWT | `github.com/golang-jwt/jwt/v5` | Verifies the HS256 tokens `JwtTokenServiceImpl` (Java side) mints, via the shared secret |
| Redis client | `github.com/redis/go-redis/v9` | Native Streams API (`XAdd`/`XReadGroup`/`XAck`) for the cross-service sync |
| Testing | stdlib `testing` + `testify` (`assert`/`require`) | Co-located `_test.go` files — idiomatic Go, not the Java side's separate Spock tree (that split exists because Groovy needs its own source set; Go has no such constraint) |
| Local env loading | `github.com/joho/godotenv` | Dev-only convenience — loads a gitignored `.env` file into `os.Getenv` so the required vars below don't need re-exporting every shell session. **Not** a config library: no layering, no file format beyond `KEY=value`, never overrides a real env var that's already set. See "Required environment variables" below. |

**Dependency philosophy:** same posture as the rest of this repo — don't add a new dependency
"because it was faster" without it actually earning its place. This service intentionally has no
web framework, no ORM, and no DI container; if a real need for one shows up, that's a conversation
to have and record here, not a silent per-package exception. `godotenv` is a deliberate, narrow
exception to "no config library" — it does one thing (`KEY=value` lines into the environment) and
nothing an `application.yml`-style file would do (no nesting, no per-environment override files, no
typed parsing). If a future need genuinely requires that, that's the point to reopen this
conversation, not to have quietly crossed it by adding `godotenv`.

## Directory structure

```
cmd/chat/main.go       # wires config, DB pool, Redis client, sync, router; starts the HTTP+WS server
internal/
  config/              # env var loading, fails fast on missing required secrets
  auth/                # JWT verification middleware
  sync/                # anti-corruption layer: Redis Streams consumer + cold-start HTTP bootstrap + cache upserts
  conversation/        # domain: conversations + participants, authorization
  message/             # domain: chat_messages — send, paginated history
  ws/                  # pure transport: WebSocket connection registry + per-conversation fan-out
  api/                 # HTTP handlers + routing, request/response DTOs
  db/                   # pgxpool wrapper
  platform/             # logging, error types, request-id — depends on nothing else in this service
migrations/             # golang-migrate SQL, numbered 000001, 000002, ...
docs/
  SYNC_DESIGN.md        # the event schema + stream contract in detail
```

Packages are split by domain concern, not technical layer — `conversation` and `message` are
separate because they have different lifecycles (a conversation is created once; messages are
high-frequency), the same instinct as `modules/social` splitting `post`/`group` rather than
splitting by entity/repository/service. `sync` is its own package because it's translation between
the monolith's world and this service's cache, not a chat feature itself.

Everything lives under `internal/` — nothing here is meant to be imported by another Go module.
Go's compiler-enforced `internal/` boundary plays the same role the Java side's `-api`/`-impl` split
does, just stricter (structurally unimportable, not just a convention).

**Naming note:** `internal/sync` shares its package name with the Go standard library's `sync`
package. No file in this service currently needs both in the same file, but if one ever does, alias
the import (`import stdsync "sync"` or `import chatsync ".../internal/sync"`) rather than renaming
either package.

## Commands

No wrapping Makefile — plain Go and `golang-migrate` are the tools, one less convention layer to
maintain for a service this size:

```bash
go run ./cmd/chat        # run natively (matches Spring/Vite's dev convention — deps in Docker, app native)
go build ./...
go test ./...
go vet ./...

# migrations (from services/chat/), requires golang-migrate installed:
# note the appended ?sslmode=disable — migrate's driver (lib/pq) defaults to
# sslmode=require and fails against a local Postgres with no SSL configured,
# unlike pgx (what the service itself uses), which defaults to "prefer" and
# falls back to plaintext automatically — CHAT_DATABASE_URL in .env does NOT
# need this suffix, only ad-hoc `migrate` invocations do.
migrate -path migrations -database "${CHAT_DATABASE_URL}?sslmode=disable" up
migrate -path migrations -database "${CHAT_DATABASE_URL}?sslmode=disable" down 1
```

**Before committing:** always run `go build ./...`, `go vet ./...`, and `go test ./...` — this
service was originally scaffolded in an environment without a Go toolchain available, so the first
person to touch it with `go` installed should treat a clean run of all three as a prerequisite, not
a formality.

## Required environment variables

| Variable | Shared with | Notes |
|---|---|---|
| `CHAT_DATABASE_URL` | — | This service's own Postgres database, never the monolith's |
| `JWT_SECRET` | Spring's `app.jwt.secret` | Must be byte-identical to the monolith's secret — verification is pure HMAC signature checking, no callback to Spring |
| `INTERNAL_SERVICE_SECRET` | Spring's `INTERNAL_SERVICE_SECRET` | Authenticates this service's calls to `/internal/sync/**` on the monolith |
| `REDIS_ADDR` | Spring's Redis | Same Redis instance the monolith already runs, reused for the sync stream |
| `MONOLITH_BASE_URL` | — | Only used for the cold-start bootstrap pull, never per-request |
| `CHAT_HTTP_ADDR` | — | Defaults to `:8081` |
| `CHAT_CORS_ALLOWED_ORIGIN` | — | Defaults to `http://localhost:5173` (Vite dev) |

No dev defaults for secrets (`JWT_SECRET`, `INTERNAL_SERVICE_SECRET`) — a missing secret fails
startup loudly, matching the same posture the monolith already takes for its own JWT secret in prod.

**For local dev,** copy `.env.example` to `.env` (gitignored — never commit real values) and fill it
in instead of exporting each variable by hand every session. `config.Load()` loads it automatically
via `godotenv` on startup — see the Tech Stack table above. In CI/production there is no `.env`
file; real secrets are injected however that environment already injects secrets (the same as
today), and `godotenv`'s "file not found" is silently ignored in that case.

## Local dev loop

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres (incl. chat's own database) + Redis
./gradlew :server:bootRun                                # Spring, :8080 (native)
go run ./cmd/chat                                        # this service, :8081 (native)
cd client && pnpm dev                                     # Vite, :5173, proxies both
```

## Testing convention

Idiomatic Go: `_test.go` files co-located with the code they test (not a separate test tree), table
-driven where a function has more than a couple of input/output shapes, `testify`'s `assert`/
`require` for assertions rather than hand-rolled comparisons. Pure-function/validation logic (e.g.
`conversation.dmKey`, `message.Service.Send`'s length checks) gets a unit test with no live database;
anything touching `pgxpool`/Redis needs either a real Postgres/Redis (e.g. via the dev compose
stack) or a documented decision to skip integration coverage for now — don't fake a database
response by hand-rolling a mock repository unless a real one is genuinely impractical to reach.

## README maintenance convention

`README.md` (§1 "What this service owns", §7 "API reference", §8 "Current status") is this
service's user-facing description of what it actually does and how — not a scaffold snapshot frozen
at HF-00/CHAT-1..4 time. Any ticket that adds/changes an HTTP or WebSocket endpoint, an event type
this service consumes, a package under `internal/`, or what `go test ./...` actually requires to
pass (e.g. CHAT-5 made it need a real Postgres; a future ticket might add a Redis/monolith
dependency too) must update the relevant README section in the same PR, the same way
`client/CLAUDE.md` requires `client/docs/E2E_OVERVIEW.md` to track every e2e spec file. Treat
"README says X" as a claim that's either true right now or a bug to fix, not aspirational scaffold
text — §8 in particular ("Current status") should always reflect the real current backlog state
(`docs/BACKLOG_MVP.md`), not the state at initial scaffold.

## Error handling convention

Domain packages (`conversation`, `message`) export sentinel errors (`ErrNotAMember`,
`ErrNotFriends`, `ErrEmptyContent`, `ErrContentTooLong`) that the API layer maps to HTTP status
codes via `errors.Is` (see `internal/api/respond.go`) — handlers themselves never decide status
codes inline. Wrap errors with `%w` (via `fmt.Errorf`) when adding context on the way up, so
`errors.Is`/`errors.As` keep working for callers further up the stack.

## Known gaps (documented, not silently missing)

- **Role sync:** `group_members_cache.role` is stored but not kept in sync on role change
  (`transferOwnership`/`updateMemberRole` on the Java side don't publish an event) — chat
  authorization only ever needs "member or not," not role. Revisit if a feature needs role-aware
  chat behavior.
- **No `XAUTOCLAIM` sweep yet:** a message whose handler fails is left pending in the consumer group
  (not acked) and will be retried on the next restart of this service (`Consumer.reclaimPending`,
  added CHAT-6 — until then, this statement was aspirational, not actually true: `Run` only ever
  read with `>`, which Redis never redelivers to any consumer once delivered once), but nothing
  currently actively reclaims a pending entry from a *different* stuck consumer instance. Not needed
  at single-instance scale; revisit before ever running more than one instance of this service.
