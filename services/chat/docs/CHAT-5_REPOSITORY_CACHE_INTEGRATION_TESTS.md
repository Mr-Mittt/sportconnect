# CHAT-5 · Repository/cache integration tests (DB-backed)

**Status:** `DONE` · **Branch:** `feature/chat-5-repo-cache-integration-tests`

## Design (approved plan, restated)

The scaffold's `conversation.Repository`, `message.Repository`, and `sync.CacheStore` had real,
hand-written SQL but only pure-validation unit tests (`conversation_test.go`'s `dmKey` test,
`message_test.go`'s content-length checks) — none of the actual queries had ever run under an
automated test. The approved plan had four parts:

1. **A minimal, behavior-preserving interface extraction** in `internal/db`: `Querier`
   (`Exec`/`Query`/`QueryRow`) and `TxQuerier` (`Querier` + `Begin`), so a repository could be
   handed either the real `*pgxpool.Pool` (production, unchanged) or an open `pgx.Tx` (tests) —
   both already expose identical method signatures, so this needed no behavior change anywhere.
2. **`internal/testdb`**, a shared test-only package: `RequirePool` (connects via
   `CHAT_DATABASE_URL`, failing loudly — not skipping — if unreachable, per the explicit user
   decision that H2/mocking isn't viable here — see "H2 question" below), `BeginTx` (opens a
   transaction and registers `t.Cleanup` to roll it back — full per-test isolation, no manual row
   cleanup, no ordering dependency between tests), and `CountingQuerier` (a decorator that counts
   `Query`/`QueryRow` calls, for the "exactly one batched query" assertion).
3. **Five new test files** — `conversation/repository_integration_test.go`,
   `conversation/service_integration_test.go`, `message/repository_integration_test.go`,
   `message/service_integration_test.go`, `sync/cache_integration_test.go` — covering every method
   named in the ticket.
4. **`.github/workflows/chat-ci.yml`** — this service's first CI pipeline, added as an explicit
   point on this ticket (not originally in the backlog text — added mid-session when the user asked
   whether chat had CI parity with `server-ci.yml`/`client-ci.yml`; it didn't). Build + vet + test,
   with a `postgres:16-alpine` service container standing in for the dev compose stack's Postgres.

## What was built

### `internal/db` — `Querier`/`TxQuerier`
```go
type Querier interface {
    Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
    Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
    QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}
type TxQuerier interface {
    Querier
    Begin(ctx context.Context) (pgx.Tx, error)
}
```
`conversation.Repository` (needs `Begin` for `GetOrCreateDirectConversation`'s internal transaction)
now holds a `db.TxQuerier`; `message.Repository` and `sync.CacheStore` hold a `db.Querier`. All
three constructors' parameter types changed to match. **No call site outside these three files
changed** — `cmd/chat/main.go`'s `conversation.NewRepository(pool)` etc. still compile unchanged,
since `*pgxpool.Pool` already structurally satisfies both interfaces.

One subtlety worth recording: `pgx.Tx` is itself an interface in pgx v5 (not a struct), and its
`Begin` returns a nested savepoint, not a fresh top-level transaction. This means a test that begins
an outer `pgx.Tx` and hands it to `conversation.NewRepository` gets correct behavior "for free" when
`GetOrCreateDirectConversation` calls `Begin`/`Commit` internally — it becomes a savepoint that
rolls up into the outer transaction's eventual rollback, rather than actually committing anything.

### `internal/testdb`
- `RequirePool(t)` — a package-level `sync.Once`-guarded pool, connected via `CHAT_DATABASE_URL`
  (loaded from `services/chat/.env` as a dev convenience, via `godotenv.Load("../../.env")` — the
  relative path works because `go test` runs each package's binary with that package's own
  directory as its working directory, and every test package here sits exactly two directories
  under `services/chat/`). Fails the test with `t.Fatalf` (not skip) if the variable is unset or the
  database is unreachable.
- `BeginTx(t, pool)` — opens a `pgx.Tx`, registers `t.Cleanup` to roll it back unconditionally.
- `CountingQuerier` — wraps a `db.Querier`, counts `Query`+`QueryRow` calls via `atomic.Int64`.

### Test coverage added
| Package | File | Covers |
|---|---|---|
| `conversation` | `repository_integration_test.go` | `GetOrCreateGroupConversation`/`GetOrCreateDirectConversation` idempotency (incl. swapped-argument-order for DMs), exactly-2-participants-not-4/6, `IsActiveParticipant` (active / left / stranger) |
| `conversation` | `service_integration_test.go` | `OpenGroup`/`OpenDirect` (member/friend success vs. `ErrNotAMember`/`ErrNotFriends`), `AuthorizeByID`'s three real outcomes |
| `message` | `repository_integration_test.go` | `Insert`, `Page` keyset pagination (5 messages, page by 2, no overlap, correct order) |
| `message` | `service_integration_test.go` | `Send` happy path, `History`'s batched sender resolution + exactly-one-query assertion |
| `sync` | `cache_integration_test.go` | Every `CacheStore` upsert/delete: role-changing upsert (1 row not 2), group-scoped bulk removal, bidirectional friendship upsert/remove, profile upsert-not-duplicate, `LastStreamID` round-trip |

All tests run against the real dev Postgres (`sportconnect_chat_dev`, via the existing dev compose
stack) — verified: `go build ./...`, `go vet ./...`, and `go test ./...` all green, and a direct
`psql` count against every affected table after the run confirmed zero leaked rows (transaction
rollback isolation works as designed).

### `chat-ci.yml`
Triggers on `services/chat/**` + its own path (mirrors `server-ci.yml`). Steps: checkout →
`actions/setup-go@v5` (version from `go.mod` via `go-version-file`) → add `go env GOPATH`'s `bin` to
`$GITHUB_PATH` → install `golang-migrate` (`-tags postgres`) → apply migrations against a
`postgres:16-alpine` service container (`sportconnect_chat_dev`, `postgres`/`sa` — matches the dev
compose stack's own credentials, safe since the container is CI-ephemeral) → `go build`/`go vet`/
`go test -v`.

**Verification beyond "tests pass locally":** an initial pass here only confirmed `go test ./...`
against the long-running dev-compose Postgres (already migrated ages ago) — that's a weaker claim
than "this CI workflow will pass," since it never exercised the workflow's own from-scratch steps
(installing `golang-migrate`, applying migrations to a database with zero prior history). Caught
when asked directly whether CI would actually pass. Re-verified properly: started a throwaway
`postgres:16-alpine` container (same image/env vars `chat-ci.yml` uses, on a separate port so it
didn't disturb the real dev stack), installed `golang-migrate` via the exact command in the
workflow, ran `migrate ... up` against it from empty (`1/u create_conversations`, `2/u
create_chat_messages`, `3/u create_sync_cache_tables`, exit 0), then ran `go build`/`go vet`/
`go test ./... -v` with `CHAT_DATABASE_URL` pointed at that fresh instance — all green. This
reproduces every step of `chat-ci.yml`'s job except the GitHub-Actions-specific mechanics
(`$GITHUB_PATH`, the service-container health-check wiring, `actions/setup-go`'s own caching) —
those remain genuinely unverified until a real PR runs the workflow on GitHub, the same HF-12-style
conditional every other CI ticket in this repo has recorded. No YAML linter (`actionlint` or
otherwise) was available in this environment either, so the workflow file's syntax was checked by
hand against `server-ci.yml`'s known-working shape.

## The "can we use H2?" question (recorded per user's ask)

Asked and answered mid-session: no. H2 is a JVM-embedded database reached over JDBC; this service's
only database driver (`pgx`) speaks the Postgres wire protocol natively and has no JDBC/H2 bridge.
Even ignoring the driver mismatch, the schema and queries use real Postgres-specific features H2
doesn't emulate (partial unique indexes with a `WHERE` clause, native `UUID` columns,
`ON CONFLICT ... DO UPDATE`, `ANY($1::uuid[])` array casts) — there's no ORM here to abstract a
dialect difference the way Hibernate does for the monolith's H2 test profile. The user considered
`embedded-postgres` (a real-Postgres-binary-per-test-run library, no Docker needed) as a
Docker-free alternative but chose to keep the original plan: real dev-compose Postgres locally,
`postgres:16-alpine` service container in CI — no new dependency, same shape the monolith's own
Testcontainers-based `*IT` tests already assume (Docker present).

## Divergence from the approved plan

One test assertion was written incorrectly on the first pass and caught by the test itself, not by
review: `TestHistory_BatchedSenderResolutionIsOneQuery` initially asserted the `CountingQuerier`
delta should be `2` (reasoning: `Page`'s query + `UserProfiles`' query). That's wrong given how the
test actually wires its dependencies — only the `sync.CacheStore`'s querier is wrapped in
`CountingQuerier` in `newTestService`, not the `message.Repository`'s — so the delta correctly
isolates just the profile-resolution query and should be `1`. Fixed to assert `1`; no production
code was in question, only the test's own expectation.

## Not in scope (per Phase 1 scoping)

- CHAT-6 (WebSocket broadcast + sync resilience tests) — separate ticket, untouched here.
- No new migrations — this ticket is coverage-only.
- No behavior change to any tested method — if a test had revealed an actual bug, that would have
  been flagged rather than silently fixed under this ticket's scope, but none did.
